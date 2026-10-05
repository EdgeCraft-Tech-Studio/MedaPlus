"""Receipt reference-number extractor (Tesseract + Pillow only, no paid APIs).

Why the old version failed on real screenshots, and what this does instead:

1. ONE reading is never trusted. The image is OCR'd through several
   different "views" (plain gray, colour-watermark-removed, local-adaptive
   threshold, sharpened, inverted) and every view votes. A digit that one
   view drops or misreads is outvoted by the others.
2. Labels are found by GEOMETRY, not by text order. We use Tesseract's word
   boxes: the value is whatever sits to the right of / right below a fuzzy-
   matched label ("Transaction Number", "Transaction Reference",
   "Transaction ID", ...), so layout differences between CBE / BOA /
   telebirr stop mattering and typos in the label ("Transacton Numer") are
   tolerated.
3. When the label itself is unreadable (faint gray captions, e.g. telebirr),
   a bank-format / isolated-value fallback still finds the value.
4. Known formats get repaired: CBE and BOA references are
   "FT" + 5 digits + 5 alphanumerics, so O/D/I/S/B... sitting in the digit
   slots are corrected.
5. The best candidate is re-read from a ZOOMED crop with a letters+digits
   whitelist (the automatic version of "crop and zoom manually"), which is
   what fixes the one-missing/one-wrong-character cases.
6. Near-identical candidates (1-2 chars apart) are merged by weighted
   per-position majority vote.

Everything is bounded: at most ~6 full-page Tesseract calls + 3 tiny crop
calls, with an overall time budget, and it stops early once confident.
"""
import logging
import re
import time
from difflib import SequenceMatcher

import pytesseract
from PIL import Image, ImageChops, ImageFilter, ImageOps
from pytesseract import Output

from .choices import SupportedBank

logger = logging.getLogger(__name__)

MAX_IMAGE_PIXELS = 25_000_000
OCR_TIMEOUT_SECONDS = 15
TOTAL_BUDGET_SECONDS = 35
TARGET_OCR_WIDTH = 1600   # upscale small phone screenshots to this width
MAX_OCR_WIDTH = 2400      # downscale anything bigger (bounds CPU)
CROP_TARGET_HEIGHT = 120  # zoom level used when re-reading the winning value
_ALNUM_WHITELIST = "-c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
_NO_DICTIONARY = "-c load_system_dawg=0 -c load_freq_dawg=0"


class OcrUnavailable(RuntimeError):
    """Raised when the tesseract binary itself isn't installed/reachable.
    Subclasses RuntimeError so the existing view's
    `except (TesseractNotFoundError, RuntimeError)` turns it into a clean 503.
    Callers must degrade to manual entry — never crash a payment submission.
    """


# ---------------------------------------------------------------- bank detect

_BANK_PATTERNS = [
    (SupportedBank.CBEBIRR, re.compile(r"\bcbe\s*birr\b")),
    (SupportedBank.TELEBIRR, re.compile(r"\btele\s*birr\b|\bethio\s*telecom\b")),
    (SupportedBank.MPESA, re.compile(r"\bm[-\s]?pesa\b")),
    (SupportedBank.KAAFIEBIRR, re.compile(r"\bkaafi")),
    (SupportedBank.SIINQEE, re.compile(r"\bsiinqee\b")),
    (SupportedBank.DASHEN, re.compile(r"\bdashen\b")),
    (SupportedBank.AWASH, re.compile(r"\bawash\b")),
    (SupportedBank.ZEMEN, re.compile(r"\bzemen\b")),
    (SupportedBank.BOA, re.compile(r"bank\s+of\s+abyss?inia|\babyss?inia\b|\bboa\b")),
    (SupportedBank.CBE, re.compile(r"commercial\s+bank\s+of\s+ethiopia|\bcbe\b|mbreciept\.cbe")),
]


def _detect_bank(raw_text: str, only=None) -> str:
    """The bank that is mentioned FIRST wins. (A BOA receipt also contains
    'Commercial Bank of Ethiopia' as the receiver's bank further down.)
    """
    lowered = raw_text.lower()
    best = None
    for order, (bank, pattern) in enumerate(_BANK_PATTERNS):
        if only and bank not in only:
            continue
        m = pattern.search(lowered)
        if m and (best is None or (m.start(), order) < best[0]):
            best = ((m.start(), order), bank)
    return best[1] if best else ""


# ------------------------------------------------------------ label handling

# compact (lowercase, alphanumeric only) forms of every label we accept
_LABELS = [
    "transactionnumber", "transactionid", "transactionreference", "transactionref",
    "transactionno", "transactioncode", "transferreference", "transferid",
    "referencenumber", "referenceno", "referenceid", "reference", "refno",
    "receiptnumber", "receiptno", "txnnumber", "txnno", "txnid", "trxid",
    "invoiceno", "invoicenumber", "paymentreference", "confirmationnumber",
]
# look-alike labels that must NOT be mistaken for a reference label
_NEGATIVE_LABELS = [
    "transactiontime", "transactiontype", "transactionto", "transactiondate",
    "transactionstatus", "transactionamount", "transactiondetails", "transactionfee",
]
_LABEL_PREFILTER = re.compile(r"tra|ran|ans|ref|efe|txn|trx|rec|ece|inv|nvo|pay|conf")
_LABEL_MIN_RATIO = 0.88

_REFERENCE_LABELS = _LABELS  # kept for backwards compatibility


def _label_ends(compact: str) -> list:
    """End offsets of every fuzzy label occurrence inside a compact line."""
    ends = set()
    for label in _LABELS:
        n = len(label)
        for size in {n - 1, n, n + 1}:
            if size < 5 or size > len(compact):
                continue
            for start in range(0, len(compact) - size + 1):
                seg = compact[start:start + size]
                ratio = SequenceMatcher(None, seg, label).ratio()
                if ratio < _LABEL_MIN_RATIO:
                    continue
                if any(SequenceMatcher(None, seg, neg).ratio() >= ratio for neg in _NEGATIVE_LABELS):
                    continue
                ends.add(start + size)
    merged = []
    for end in sorted(ends):
        if merged and end - merged[-1] <= 3:
            merged[-1] = end  # same label matched with a slightly different window
        else:
            merged.append(end)
    return merged


# ------------------------------------------------------------ token helpers

_STOPWORDS = {
    "ETB", "AMOUNT", "DATE", "TIME", "BIRR", "BALANCE", "TOTAL",
    "TRANSACTION", "NUMBER", "REFERENCE", "REFNO", "TXN", "NAME",
    "ACCOUNT", "PAYER", "RECEIVER", "MOBILE", "BANKING", "STATUS",
    "SUCCESS", "SUCCESSFUL", "COMPLETED", "FROM", "TO", "VAT", "SERVICE", "FEE",
    "CHARGE", "RECEIPT", "NO", "REASON", "TRANSFER", "REF", "ID", "THANK", "YOU",
}

# OCR confusions in positions that must be DIGITS
_TO_DIGIT = str.maketrans({
    "O": "0", "D": "0", "Q": "0", "I": "1", "L": "1", "S": "5",
    "B": "8", "Z": "2", "G": "6", "T": "7", "A": "4",
})
_FT_STRICT = re.compile(r"FT\d{5}[A-Z0-9]{5}")
_FT_LOOSE = re.compile(r"F[T7I1][0-9OIDLSBZGQTA]{5}[A-Z0-9]{5}")


def _try_ft(token: str) -> str:
    """CBE / Bank of Abyssinia style reference: FT + 5 digits (YYDDD) + 5
    alphanumerics. Returns the repaired token, or '' if it can't be one."""
    token = token.upper()
    if len(token) != 12 or token[0] != "F" or token[1] not in "T7I1":
        return ""
    fixed = "FT" + token[2:7].translate(_TO_DIGIT) + token[7:]
    return fixed if _FT_STRICT.fullmatch(fixed) else ""


def _is_codelike(tok: str) -> bool:
    if not re.fullmatch(r"[A-Z0-9]{6,24}", tok) or tok in _STOPWORDS:
        return False
    has_digit = any(c.isdigit() for c in tok)
    has_alpha = any(c.isalpha() for c in tok)
    if has_digit and has_alpha:
        return True
    return has_digit and len(tok) >= 8  # all-digit reference (rare, needs length)


def _tokens(text: str) -> list:
    return [t.upper() for t in re.split(r"[^A-Za-z0-9]+", text) if t]


# kept: used by older callers
def _best_code_in_text(text: str) -> str:
    compact = re.sub(r"[^A-Za-z0-9]+", "", text.upper())
    if _is_codelike(compact):
        return compact
    for tok in _tokens(text):
        if _is_codelike(tok):
            return tok
    return ""


# -------------------------------------------------------------- image views

def _load_rgb(image_file) -> Image.Image:
    try:
        image = Image.open(image_file)
        width, height = image.size
        if width * height > MAX_IMAGE_PIXELS:
            raise ValueError("Image is too large to scan.")
        image = ImageOps.exif_transpose(image)
        if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
            rgba = image.convert("RGBA")
            background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            image = Image.alpha_composite(background, rgba).convert("RGB")
        else:
            image = image.convert("RGB")
    except ValueError:
        raise
    except Exception as exc:  # corrupt / unsupported file
        raise ValueError("Could not read this image.") from exc

    width, height = image.size
    if width < TARGET_OCR_WIDTH:
        scale = TARGET_OCR_WIDTH / width
        image = image.resize((int(width * scale), int(height * scale)), Image.LANCZOS)
    elif width > MAX_OCR_WIDTH:
        scale = MAX_OCR_WIDTH / width
        image = image.resize((int(width * scale), int(height * scale)), Image.LANCZOS)
    return image


def _prepare_base_image(image_file) -> Image.Image:  # backwards compatible name
    return _load_rgb(image_file).convert("L")


def _max_channel(rgb: Image.Image) -> Image.Image:
    """Per-pixel BRIGHTEST channel. Black/dark text stays dark, but yellow,
    purple, blue, green watermarks and coloured backgrounds all become
    near-white — this is the colour-watermark killer.
    """
    r, g, b = rgb.split()
    return ImageChops.lighter(ImageChops.lighter(r, g), b)


def _enhance_image(image: Image.Image) -> Image.Image:
    """Stretch faded gray text toward black, crisp up thin strokes."""
    enhanced = ImageOps.autocontrast(image, cutoff=1)
    return enhanced.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))


def _adaptive_binarize(gray: Image.Image, offset: int = 12) -> Image.Image:
    """Local-contrast threshold: a pixel becomes black only if it is darker
    than its own neighbourhood. Light-gray text survives, smooth watermarks
    and gradients (which are 'flat' locally) vanish.
    """
    radius = max(12, gray.width // 90)
    blurred = gray.filter(ImageFilter.GaussianBlur(radius))
    darker_than_surroundings = ImageChops.subtract(blurred, gray)
    binary = darker_than_surroundings.point(lambda v: 0 if v > offset else 255)
    return binary.filter(ImageFilter.MedianFilter(3))


# ----------------------------------------------------------------- tesseract

class _Budget:
    def __init__(self, seconds):
        self.deadline = time.monotonic() + seconds

    def left(self):
        return self.deadline - time.monotonic()


def _run_tesseract(image: Image.Image, psm: int) -> str:  # kept for compatibility
    try:
        return pytesseract.image_to_string(image, config=f"--psm {psm}", timeout=OCR_TIMEOUT_SECONDS)
    except pytesseract.TesseractNotFoundError as exc:
        raise OcrUnavailable("Tesseract is not installed on this server.") from exc


def _ocr_words(image: Image.Image, psm: int, budget: _Budget, extra: str = ""):
    """Returns word dicts with boxes, or None if this single call failed
    (timeout etc.). Only a missing binary is fatal."""
    if budget.left() < 1.5:
        return None
    try:
        data = pytesseract.image_to_data(
            image,
            config=f"--psm {psm} {extra}".strip(),
            output_type=Output.DICT,
            timeout=min(OCR_TIMEOUT_SECONDS, max(2, budget.left())),
        )
    except pytesseract.TesseractNotFoundError as exc:
        raise OcrUnavailable("Tesseract is not installed on this server.") from exc
    except RuntimeError:
        logger.warning("Tesseract call failed/timed out (psm=%s)", psm)
        return None

    words = []
    for i, raw in enumerate(data["text"]):
        text = (raw or "").strip()
        if not text:
            continue
        left, top = int(data["left"][i]), int(data["top"][i])
        width, height = int(data["width"][i]), int(data["height"][i])
        words.append({
            "text": text,
            "compact": re.sub(r"[^a-z0-9]", "", text.lower()),
            "left": left, "top": top, "right": left + width, "bottom": top + height,
            "line": (data["block_num"][i], data["par_num"][i], data["line_num"][i]),
        })
    return words


def _group_lines(words: list) -> list:
    lines = {}
    for w in words:
        lines.setdefault(w["line"], []).append(w)
    ordered = sorted(lines.values(), key=lambda ws: min(w["top"] for w in ws))
    return [sorted(ws, key=lambda w: w["left"]) for ws in ordered]


def _text_of(lines: list) -> str:
    return "\n".join(" ".join(w["text"] for w in line) for line in lines)


# ------------------------------------------------------------ observations

def _obs(out: list, code: str, score: float, bbox=None, label=False):
    out.append({"code": code, "score": score, "bbox": bbox, "label": label})


def _word_bbox(w):
    return (w["left"], w["top"], w["right"], w["bottom"])


def _codes_from_word(w) -> list:
    """Every code-like thing inside one OCR word, FT-repaired if possible."""
    found = []
    if re.fullmatch(r"[\d\s/:.,\-+*%()]+", w["text"]):  # date, time, amount, phone-like
        return found
    whole = re.sub(r"[^A-Za-z0-9]", "", w["text"]).upper()
    pieces = [whole] + _tokens(w["text"])
    if _is_codelike(_try_ft(whole) or whole):
        pieces = [whole]  # one OCR word = one value; don't also emit its fragments
    for tok in pieces:
        tok = _try_ft(tok) or tok
        if _is_codelike(tok) and tok not in found:
            found.append(tok)
    return found


def _label_observations(lines: list) -> list:
    out = []
    all_words = [w for line in lines for w in line]
    for line in lines:
        compact, spans = "", []
        for w in line:
            spans.append((len(compact), len(compact) + len(w["compact"])))
            compact += w["compact"]
        if len(compact) < 5 or not _LABEL_PREFILTER.search(compact):
            continue

        for end in _label_ends(compact):
            label_words = [w for w, (s, _e) in zip(line, spans) if s < end]
            if not label_words:
                continue
            last_start, last_end = [(s, e) for (s, e) in spans if s < end][-1]
            # The fuzzy window can run 1-2 chars past the label into the value
            # ("transaction ID : FT26276ML58G" -> window ends after "FT"). If it
            # only nibbles the start of a word, that word is the VALUE, not label.
            if last_end > end and end - last_start <= 3 and len(label_words) > 1:
                label_words = label_words[:-1]
                end = last_start
                last_start, last_end = [(s, e) for (s, e) in spans if s < end][-1]
            top = min(w["top"] for w in label_words)
            bottom = max(w["bottom"] for w in label_words)
            height = max(bottom - top, 10)
            label_right = max(w["right"] for w in label_words)

            # (a) value glued to the label inside the same OCR word ("ID:FT26149HK481")
            if last_end > end:
                remainder = label_words[-1]["compact"][end - last_start:].upper()
                remainder = _try_ft(remainder) or remainder
                if _is_codelike(remainder):
                    _obs(out, remainder, 6.0, _word_bbox(label_words[-1]), label=True)
                    continue
                label_right = label_words[-1]["left"] + (label_words[-1]["right"] - label_words[-1]["left"]) * (end - last_start) / max(len(label_words[-1]["compact"]), 1)

            label_ids = {id(w) for w in label_words}

            # (b) same row, to the right of the label (any OCR line grouping)
            row = sorted(
                (w for w in all_words
                 if id(w) not in label_ids
                 and top - 0.6 * height <= (w["top"] + w["bottom"]) / 2 <= bottom + 0.6 * height
                 and w["left"] >= label_right - 0.5 * height),
                key=lambda w: w["left"],
            )
            row_hits = 0
            for w in row:
                for code in _codes_from_word(w):
                    _obs(out, code, 6.0 if row_hits == 0 else 2.0, _word_bbox(w), label=True)
                    row_hits += 1
            if row and row_hits == 0:  # value split by spaces: "DDI415 MGL4"
                joined = re.sub(r"[^A-Za-z0-9]", "", "".join(w["text"] for w in row[:3])).upper()
                joined = _try_ft(joined) or joined
                if (_is_codelike(joined) and any(c.isalpha() for c in joined)
                        and not any(re.fullmatch(r"[\d\s/:.,\-+*%()]+", w["text"]) for w in row[:3])):
                    box = (row[0]["left"], min(w["top"] for w in row[:3]),
                           row[min(2, len(row) - 1)]["right"], max(w["bottom"] for w in row[:3]))
                    _obs(out, joined, 5.0, box, label=True)
                    row_hits += 1

            # (c) directly below the label (value on the next line)
            if row_hits == 0:
                below = sorted(
                    (w for w in all_words
                     if id(w) not in label_ids
                     and bottom - 0.1 * height <= w["top"]
                     and (w["top"] + w["bottom"]) / 2 <= bottom + 3.5 * height),
                    key=lambda w: (round(w["top"] / height), w["left"]),
                )
                hits = 0
                for w in below:
                    for code in _codes_from_word(w):
                        _obs(out, code, 4.5 if hits == 0 else 1.5, _word_bbox(w), label=True)
                        hits += 1
                    if hits >= 2:
                        break
    return out


def _format_observations(lines: list, full_text: str) -> list:
    """No label needed: FT-style references are recognisable by shape alone."""
    out = []
    for line in lines:
        for w in line:
            for tok in _tokens(w["text"]) + [re.sub(r"[^A-Za-z0-9]", "", w["text"]).upper()]:
                ft = _try_ft(tok)
                if ft:
                    _obs(out, ft, 4.0, _word_bbox(w))
    compact = re.sub(r"[^A-Z0-9]", "", full_text.upper())
    for m in _FT_LOOSE.finditer(compact):
        ft = _try_ft(m.group(0))
        if ft:
            _obs(out, ft, 3.0)
    return out


def _isolated_observations(lines: list) -> list:
    """Last resort for faint/unreadable labels (light-gray 'Transaction
    Number'): a letters+digits value that is (almost) alone on its line."""
    out = []
    for line in lines:
        significant = [w for w in line if len(w["compact"]) >= 3]
        if not significant or len(significant) > 2:
            continue
        w = significant[-1]
        for code in _codes_from_word(w):
            if 8 <= len(code) <= 16 and any(c.isalpha() for c in code) and any(c.isdigit() for c in code):
                _obs(out, code, 1.5, _word_bbox(w))
    return out


def _observe(words: list):
    lines = _group_lines(words)
    text = _text_of(lines)
    obs = _label_observations(lines) + _format_observations(lines, text) + _isolated_observations(lines)
    return obs, text


# ------------------------------------------------------- voting & consensus

class _Votes:
    def __init__(self):
        self.items = {}  # code -> {"passes": {name: score}, "bbox": (score, box), "label": bool}

    def add(self, pass_name: str, observations: list):
        for o in observations:
            item = self.items.setdefault(o["code"], {"passes": {}, "bbox": (0, None), "label": False})
            item["passes"][pass_name] = max(item["passes"].get(pass_name, 0), o["score"])
            if o["bbox"] is not None and o["score"] >= item["bbox"][0]:
                item["bbox"] = (o["score"], o["bbox"])
            item["label"] = item["label"] or o["label"]

    def totals(self, bank: str) -> dict:
        totals = {}
        for code, item in self.items.items():
            total = sum(item["passes"].values())
            if bank == SupportedBank.TELEBIRR and re.fullmatch(r"[A-Z0-9]{10}", code):
                total += 2.0
            totals[code] = total
        return totals


def _hamming(a, b):
    return sum(x != y for x, y in zip(a, b))


def _edit1(a, b):
    if len(a) < len(b):
        a, b = b, a
    return any(a[:i] + a[i + 1:] == b for i in range(len(a)))


def _similar(a, b):
    if min(len(a), len(b)) < 8:
        return False
    if len(a) == len(b):
        return _hamming(a, b) <= 2
    return abs(len(a) - len(b)) == 1 and _edit1(a, b)


def _resolve(votes: _Votes, bank: str) -> list:
    """-> [{"code", "score", "members", "bbox", "label"}] best first."""
    totals = votes.totals(bank)
    clusters = []
    for code, score in sorted(totals.items(), key=lambda kv: -kv[1]):
        for cl in clusters:
            if any(_similar(code, m) for m in cl):
                cl[code] = score
                break
        else:
            clusters.append({code: score})

    resolved = []
    for members in clusters:
        by_len = {}
        for c, s in members.items():
            by_len.setdefault(len(c), {})[c] = s

        def weight(length):
            group = by_len[length]
            return sum(group.values()) + (5 if any(_FT_STRICT.fullmatch(c) for c in group) else 0)

        best_len = max(by_len, key=weight)
        group = by_len[best_len]
        top = max(group, key=group.get)
        chars = []
        for i in range(best_len):
            tally = {}
            for c, s in group.items():
                tally[c[i]] = tally.get(c[i], 0) + s
            chars.append(max(tally, key=lambda ch: (tally[ch], ch == top[i])))
        code = "".join(chars)
        code = _try_ft(code) or code

        bbox, label = None, False
        for c in group:
            item = votes.items[c]
            label = label or item["label"]
            if item["bbox"][1] is not None and (bbox is None or item["bbox"][0] > bbox[0]):
                bbox = (item["bbox"][0], item["bbox"][1])
        agree = (
            len([n for n in votes.items[code]["passes"] if not n.startswith("crop_")])
            if code in votes.items else 0
        )
        resolved.append({
            "code": code, "score": sum(members.values()), "agree": agree,
            "members": list(members), "bbox": bbox[1] if bbox else None, "label": label,
        })
    resolved.sort(key=lambda r: -r["score"])
    return resolved


# ------------------------------------------------------------ zoomed re-read

def _otsu_threshold(gray: Image.Image) -> int:
    hist = gray.histogram()
    total = sum(hist)
    sum_all = sum(i * h for i, h in enumerate(hist))
    best_t, best_var, w0, sum0 = 127, -1.0, 0, 0
    for t in range(256):
        w0 += hist[t]
        if w0 == 0 or w0 == total:
            continue
        sum0 += t * hist[t]
        m0, m1 = sum0 / w0, (sum_all - sum0) / (total - w0)
        var = w0 * (total - w0) * (m0 - m1) ** 2
        if var > best_var:
            best_var, best_t = var, t
    return best_t


def _crop_variants(crop_rgb: Image.Image) -> list:
    """Different cleanups of the SAME small crop; each gets its own read."""
    gray = crop_rgb.convert("L")
    maxch = _max_channel(crop_rgb)
    out = [("g", ImageOps.autocontrast(gray, cutoff=2))]
    base = ImageOps.autocontrast(gray, cutoff=2)
    t = _otsu_threshold(base)
    out.append(("otsu", base.point(lambda v, t=t: 255 if v > t else 0)))
    out.append(("m", ImageOps.autocontrast(maxch, cutoff=2)))
    return out


def _refine_by_crop(votes: _Votes, rgb: Image.Image, bbox, budget: _Budget):
    """Re-read ONLY the winning value from a big, clean crop with a
    letters+digits whitelist and Tesseract's dictionary switched off (a
    dictionary 'corrects' reference numbers into real words)."""
    left, top, right, bottom = bbox
    pad_x, pad_y = 20, 12
    box = (max(left - pad_x, 0), max(top - pad_y, 0),
           min(right + pad_x, rgb.width), min(bottom + pad_y, rgb.height))
    crop_rgb = rgb.crop(box)
    if crop_rgb.height < 4:
        return
    scale = min(max(CROP_TARGET_HEIGHT / crop_rgb.height, 1.0), 5.0)
    crop_rgb = crop_rgb.resize((int(crop_rgb.width * scale), int(crop_rgb.height * scale)), Image.LANCZOS)

    for name, crop in _crop_variants(crop_rgb):
        crop = ImageOps.expand(crop, border=30, fill=255)
        for psm in ((7, 8) if name == "g" else (7,)):
            if budget.left() < 3:
                return
            try:
                text = pytesseract.image_to_string(
                    crop, config=f"--psm {psm} {_ALNUM_WHITELIST} {_NO_DICTIONARY}",
                    timeout=min(OCR_TIMEOUT_SECONDS, max(2, budget.left())),
                )
            except pytesseract.TesseractNotFoundError as exc:
                raise OcrUnavailable("Tesseract is not installed on this server.") from exc
            except RuntimeError:
                continue
            compact = re.sub(r"[^A-Z0-9]", "", text.upper())
            compact = _try_ft(compact) or compact
            if _is_codelike(compact):
                votes.add(f"crop_{name}_{psm}", [{"code": compact, "score": 1.5, "bbox": None, "label": False}])


# ------------------------------------------------------------------- public

# (view name, psm) — ordered cheapest/most-likely-to-succeed first
_PASSES = [
    ("gray", 6),
    ("maxch_adapt", 6),
    ("enh", 11),
    ("maxch", 6),
    ("inv", 11),
    ("adapt", 11),
]


def _build_view(name: str, rgb: Image.Image, cache: dict) -> Image.Image:
    if name in cache:
        return cache[name]
    if name == "gray":
        view = rgb.convert("L")
    elif name == "maxch":
        view = _enhance_image(_max_channel(rgb))
    elif name == "maxch_adapt":
        view = _adaptive_binarize(_max_channel(rgb))
    elif name == "enh":
        view = _enhance_image(_build_view("gray", rgb, cache))
    elif name == "inv":
        view = ImageOps.invert(_enhance_image(_build_view("gray", rgb, cache)))
    elif name == "adapt":
        view = _adaptive_binarize(_build_view("gray", rgb, cache))
    else:
        raise KeyError(name)
    cache[name] = view
    return view


def _confidence(top) -> str:
    if top is None:
        return "none"
    # "high" only when the exact final string was independently read more
    # than once, or it has the unmistakable FT shape AND sat next to a label.
    if top["agree"] >= 2 and top["score"] >= 9:
        return "high"
    if top["label"] and top["agree"] >= 1 and _FT_STRICT.fullmatch(top["code"]):
        return "high"
    return "medium"


def _is_confident(top) -> bool:
    return top is not None and top["score"] >= 10 and (
        len(top["members"]) >= 1 and (top["score"] >= 14 or _FT_STRICT.fullmatch(top["code"]))
    )


def extract_reference_from_image(*, image_file, bank_hint: str = "") -> dict:
    """Best-effort suggestion — the payer confirms/edits it, and
    submit_manual_bank_payment() independently re-checks it against a fresh
    OCR pass before anything is trusted.

    `raw_text` contains the text of EVERY pass plus every candidate string
    that was read, so that cross-check tolerates single-pass misreads.
    """
    budget = _Budget(TOTAL_BUDGET_SECONDS)
    rgb = _load_rgb(image_file)
    views: dict = {}
    votes = _Votes()
    texts = []
    bank = bank_hint or ""
    ran_any = False
    top = None

    for view_name, psm in _PASSES:
        view = _build_view(view_name, rgb, views)
        words = _ocr_words(view, psm, budget)
        if words is None:
            continue
        ran_any = True
        observations, text = _observe(words)
        texts.append(text)
        votes.add(f"{view_name}_{psm}", observations)
        if not bank:
            detected = _detect_bank("\n".join(texts))
            if detected:
                bank = detected
        ranked = _resolve(votes, bank)
        top = ranked[0] if ranked else None
        if _is_confident(top):
            break

    # zoom-in re-read of the current winner (fixes a wrong / missing character)
    certain = top is not None and bool(_FT_STRICT.fullmatch(top["code"])) and top["label"] and top["agree"] >= 2
    if top is not None and top["bbox"] is not None and not certain and budget.left() > 4:
        try:
            _refine_by_crop(votes, rgb, top["bbox"], budget)
        except OcrUnavailable:
            raise
        except Exception:
            logger.exception("Crop refinement failed; keeping the full-page result")

    combined_text = "\n".join(texts)
    detected_bank = bank_hint or bank or _detect_bank(combined_text)
    ranked = _resolve(votes, detected_bank) if ran_any else []
    best = ranked[0] if ranked else None

    suggested = best["code"] if best else ""
    if not bank_hint and _FT_STRICT.fullmatch(suggested):
        # "FT..." references are issued by CBE / BOA even when the text also
        # mentions a wallet ("...to own Telebirr wallet").
        detected_bank = _detect_bank(combined_text, only={SupportedBank.CBE, SupportedBank.BOA}) or detected_bank
    others = []
    if best:
        for code in best["members"] + [c for r in ranked[1:] for c in [r["code"]] + r["members"]]:
            if code != suggested and code not in others and code not in suggested and suggested not in code:
                others.append(code)

    every_read = list(votes.items.keys())
    raw_text = (combined_text + "\n" + "\n".join(every_read)).strip()

    return {
        "raw_text": raw_text,
        "suggested_bank": bank_hint or detected_bank,
        "suggested_reference_number": suggested,
        "other_candidates": others[:4],
        "confidence": _confidence(best) if suggested else "none",
    }