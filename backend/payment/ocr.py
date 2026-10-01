import re

import pytesseract
from PIL import Image

from .choices import SupportedBank

MAX_IMAGE_PIXELS = 25_000_000
OCR_TIMEOUT_SECONDS = 15

# Most specific first. A receipt containing "CBE Birr" must not be
# read as plain CBE, so wallet/brand names are checked before "cbe".
_BANK_PATTERNS = [
    (SupportedBank.CBEBIRR, re.compile(r"\bcbe\s*birr\b")),
    (SupportedBank.TELEBIRR, re.compile(r"\btele\s*birr\b")),
    (SupportedBank.MPESA, re.compile(r"\bm[-\s]?pesa\b")),
    (SupportedBank.KAAFIEBIRR, re.compile(r"\bkaafi")),
    (SupportedBank.SIINQEE, re.compile(r"\bsiinqee\b")),
    (SupportedBank.DASHEN, re.compile(r"\bdashen\b")),
    (SupportedBank.AWASH, re.compile(r"\bawash\b")),
    (SupportedBank.BOA, re.compile(r"\bbank of abyssinia\b|\bboa\b")),
    (SupportedBank.CBE, re.compile(r"\bcommercial bank of ethiopia\b|\bcbe\b")),
]

_HIGH = re.compile(r"(?<![A-Z0-9])FT[A-Z0-9]{8,14}(?![A-Z0-9])")
_MEDIUM = re.compile(
    r"(?<![A-Z0-9])(?!ETB|AMOUNT|DATE|TIME|BIRR|BALANCE|TOTAL)(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,16}(?![A-Z0-9])"
)
_LOW = re.compile(r"(?<![A-Z0-9])[0-9]{10,16}(?![A-Z0-9])")


def _detect_bank(raw_text: str) -> str:
    lowered = raw_text.lower()
    for bank, pattern in _BANK_PATTERNS:
        if pattern.search(lowered):
            return bank
    return ""


def _line_variants(raw_text: str):
    """Per line, never across lines. The whitespace-stripped variant
    repairs OCR's habit of splitting a token ("FT262677 1GJT"); the
    split-tokens variant handles "Label VALUE" lines with no colon.
    Working per line stops values on different lines fusing together.
    """
    for line in raw_text.upper().splitlines():
        line = line.strip()
        if not line:
            continue
        yield re.sub(r"\s+", "", line)
        yield from line.split()


def _extract_candidates(raw_text: str):
    tiers = {"high": [], "medium": [], "low": []}
    for variant in _line_variants(raw_text):
        for tier, pattern in (("high", _HIGH), ("medium", _MEDIUM), ("low", _LOW)):
            for match in pattern.findall(variant):
                tiers[tier].append(match)

    ordered = []
    for tier in ("high", "medium", "low"):
        for candidate in tiers[tier]:
            # drop exact repeats and truncated fragments of a better candidate
            if any(candidate in kept for _, kept in ordered):
                continue
            ordered.append((tier, candidate))
    return ordered


def _prepare_image(image_file) -> Image.Image:
    image = Image.open(image_file)
    width, height = image.size
    if width * height > MAX_IMAGE_PIXELS:
        raise ValueError("Image is too large to scan.")
    image = image.convert("L")
    if width < 1200:
        image = image.resize((width * 2, height * 2), Image.LANCZOS)
    return image


def extract_reference_from_image(*, image_file, bank_hint: str = "") -> dict:
    """Best-effort suggestion only. The payer must see and confirm the
    result before it is submitted; nothing here is trusted by the
    payment verification code.
    """
    image = _prepare_image(image_file)
    raw_text = pytesseract.image_to_string(image, timeout=OCR_TIMEOUT_SECONDS)

    ordered = _extract_candidates(raw_text)
    detected_bank = _detect_bank(raw_text)

    if ordered:
        confidence, suggested = ordered[0]
        others = [c for _, c in ordered[1:5]]
    else:
        confidence, suggested, others = "none", "", []

    return {
        "raw_text": raw_text.strip(),
        "suggested_bank": bank_hint or detected_bank,
        "suggested_reference_number": suggested,
        "other_candidates": others,
        "confidence": confidence,
    }
