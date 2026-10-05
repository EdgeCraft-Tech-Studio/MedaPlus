import logging
import re

import pytesseract
from PIL import Image, ImageFilter, ImageOps

from .choices import SupportedBank

logger = logging.getLogger(__name__)

MAX_IMAGE_PIXELS = 25_000_000
OCR_TIMEOUT_SECONDS = 15
TARGET_OCR_WIDTH = 2200


class OcrUnavailable(Exception):
    pass


_BANK_PATTERNS = [
    (SupportedBank.CBEBIRR, re.compile(r"\bcbe\s*birr\b")),
    (SupportedBank.TELEBIRR, re.compile(r"\btele\s*birr\b")),
    (SupportedBank.MPESA, re.compile(r"\bm[-\s]?pesa\b")),
    (SupportedBank.KAAFIEBIRR, re.compile(r"\bkaafi")),
    (SupportedBank.SIINQEE, re.compile(r"\bsiinqee\b")),
    (SupportedBank.DASHEN, re.compile(r"\bdashen\b")),
    (SupportedBank.AWASH, re.compile(r"\bawash\b")),
    (SupportedBank.ZEMEN, re.compile(r"\bzemen\b")),
    (SupportedBank.BOA, re.compile(r"\bbank of abyssinia\b|\bboa\b")),
    (SupportedBank.CBE, re.compile(r"\bcommercial bank of ethiopia\b|\bcbe\b")),
]

_REFERENCE_LABELS = [
    "TRANSACTION ID", "TRANSACTION NUMBER", "TRANSACTION REFERENCE",
    "TRANSFER REFERENCE", "TRANSACTION REF", "REFERENCE NUMBER",
    "REFERENCE NO", "REF NO", "RECEIPT NUMBER", "RECEIPT NO",
    "TXN NUMBER", "TXN NO", "TXN ID",
]

_CBE_RECEIPT_URL = re.compile(r"mbreciept\.cbe\.com\.et/+([A-Z0-9]{6,32})", re.IGNORECASE)

# FT-prefixed references (CBE, and BOA's "other bank transfer" routed
# through CBE's network) are highly distinctive — checked FIRST,
# globally, before any label search. This alone restores CBE/BOA to
# the reliability they had before this whole rewrite started.
_FT_PATTERN = re.compile(r"(?<![A-Z0-9])FT[A-Z0-9]{8,16}(?![A-Z0-9])")

# Widened from 20 -> 32 to fit Dashen's 25-char references. Matching
# stays SINGLE-LINE only — no joining adjacent lines together, which
# is what previously produced garbage from unrelated nearby text.
_CODE = re.compile(r"(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,32}")
_STOPWORDS = {
    "ETB", "AMOUNT", "DATE", "TIME", "BIRR", "BALANCE", "TOTAL",
    "TRANSACTION", "NUMBER", "REFERENCE", "REFNO", "TXN", "NAME",
    "ACCOUNT", "PAYER", "RECEIVER", "MOBILE", "BANKING", "STATUS",
    "SUCCESS", "COMPLETED", "FROM", "TO", "VAT", "SERVICE", "FEE", "CHARGE",
    "RECEIPT", "NO", "REASON", "TRANSFER", "REF", "ID",
}


def _detect_bank(raw_text: str) -> str:
    lowered = raw_text.lower()
    for bank, pattern in _BANK_PATTERNS:
        if pattern.search(lowered):
            return bank
    return ""


def _best_code_in_text(text: str) -> str:
    compact = re.sub(r"\s+", "", text.upper())
    for match in _CODE.findall(compact):
        if match not in _STOPWORDS:
            return match
    return ""


def _find_code_near_label(lines: list, label: str, max_lookahead: int = 2) -> str:
    """Finds `label` on a line, pulls a code from the rest of THAT
    line, or from one of the next 1-2 lines individually — never
    joined together. Line-joining was removed; it's what caused the
    garbage-string regression.
    """
    label_compact = re.sub(r"\s+", "", label)

    for i, line in enumerate(lines):
        line_compact = re.sub(r"\s+", "", line.upper())
        if label_compact not in line_compact:
            continue

        idx = line.upper().find(label)
        if idx != -1:
            remainder = re.sub(r"^[:\s\-]+", "", line[idx + len(label):])
            found = _best_code_in_text(remainder)
            if found:
                return found

        compact_idx = line_compact.find(label_compact)
        found = _best_code_in_text(line_compact[compact_idx + len(label_compact):])
        if found:
            return found

        for j in range(i + 1, min(i + 1 + max_lookahead, len(lines))):
            found = _best_code_in_text(lines[j])
            if found:
                return found

    return ""


def _isolated_line_candidate(lines: list) -> str:
    for line in lines:
        compact = re.sub(r"\s+", "", line.upper())
        if not compact or compact in _STOPWORDS:
            continue
        if _CODE.fullmatch(compact):
            return compact
    return ""


def _prepare_base_image(image_file) -> Image.Image:
    image = Image.open(image_file)
    width, height = image.size
    if width * height > MAX_IMAGE_PIXELS:
        raise ValueError("Image is too large to scan.")
    image = image.convert("L")
    if width < TARGET_OCR_WIDTH:
        scale = TARGET_OCR_WIDTH / width
        image = image.resize((int(width * scale), int(height * scale)), Image.LANCZOS)
    return image


def _enhance_image(image: Image.Image) -> Image.Image:
    enhanced = ImageOps.autocontrast(image, cutoff=1)
    enhanced = enhanced.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
    return enhanced


def _binarize_image(image: Image.Image) -> Image.Image:
    """Last-resort third pass: hard black/white threshold. Cheap
    (pure Pillow point() op, no new dependency) and specifically
    helps receipts where a faint watermark or stamp bleeds into the
    text — binarizing tends to wipe out light-gray background noise
    while keeping solid black text intact.
    """
    return image.point(lambda p: 255 if p > 150 else 0)


def _run_tesseract(image: Image.Image, psm: int) -> str:
    try:
        return pytesseract.image_to_string(image, config=f"--psm {psm}", timeout=OCR_TIMEOUT_SECONDS)
    except pytesseract.pytesseract.TesseractNotFoundError as exc:
        raise OcrUnavailable("Tesseract is not installed on this server.") from exc


def _try_extract(raw_text: str, bank_hint: str):
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    detected_bank = _detect_bank(raw_text)

    url_match = _CBE_RECEIPT_URL.search(raw_text)
    if url_match:
        return url_match.group(1).upper(), "high", (bank_hint or detected_bank or SupportedBank.CBE)

    ft_match = _FT_PATTERN.search(re.sub(r"\s+", "", raw_text.upper()))
    if ft_match:
        return ft_match.group(0), "high", (bank_hint or detected_bank)

    for label in _REFERENCE_LABELS:
        found = _find_code_near_label(lines, label)
        if found:
            return found, "high", (bank_hint or detected_bank)

    return "", "none", (bank_hint or detected_bank)


def extract_reference_from_image(*, image_file, bank_hint: str = "") -> dict:
    """Best-effort suggestion only — the payer confirms/edits it, and
    submit_manual_bank_payment() independently re-checks it. At most
    3 Tesseract calls, only reaching the 3rd on genuinely hard images.
    """
    base_image = _prepare_base_image(image_file)

    raw_text_1 = _run_tesseract(base_image, psm=6)
    suggested, confidence, bank = _try_extract(raw_text_1, bank_hint)
    combined_text = raw_text_1

    if not suggested:
        enhanced_image = _enhance_image(base_image)
        raw_text_2 = _run_tesseract(enhanced_image, psm=11)
        combined_text += "\n" + raw_text_2
        suggested, confidence, bank = _try_extract(raw_text_2, bank_hint)

    if not suggested:
        binarized_image = _binarize_image(base_image)
        raw_text_3 = _run_tesseract(binarized_image, psm=6)
        combined_text += "\n" + raw_text_3
        suggested, confidence, bank = _try_extract(raw_text_3, bank_hint)

    if not suggested:
        lines = [l.strip() for l in combined_text.splitlines() if l.strip()]
        fallback = _isolated_line_candidate(lines)
        if fallback:
            suggested, confidence = fallback, "medium"

    detected_bank = bank or _detect_bank(combined_text)

    return {
        "raw_text": combined_text.strip(),
        "suggested_bank": bank_hint or detected_bank,
        "suggested_reference_number": suggested,
        "other_candidates": [],
        "confidence": confidence if suggested else "none",
    }