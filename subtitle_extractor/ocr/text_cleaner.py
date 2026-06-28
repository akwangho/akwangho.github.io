"""Phase 5 — text cleaning: whitespace, punctuation spacing, quotes."""

from __future__ import annotations

import re

# Map of OCR look-alikes / stray glyphs to fix before spacing rules run.
_RAW_FIXES = {
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "—": "-",
    "…": "...",
    "''": '"',
}


def _apply_raw_fixes(text: str) -> str:
    for bad, good in _RAW_FIXES.items():
        text = text.replace(bad, good)
    return text


def clean_text(text: str) -> str:
    if not text:
        return ""
    text = _apply_raw_fixes(text)

    # Collapse all whitespace to single spaces.
    text = re.sub(r"\s+", " ", text).strip()

    # Remove space *before* closing punctuation: "squirrel ." -> "squirrel."
    text = re.sub(r"\s+([,.!?;:])", r"\1", text)

    # Remove space right after an opening quote and before a closing quote.
    text = re.sub(r'"\s+', '"', text)
    text = re.sub(r'\s+"', '"', text)
    # Re-add the space the previous rule may have eaten after a closing quote:
    text = re.sub(r'"([A-Za-z])', r'" \1', text)
    # ...but keep an opening quote glued to its first word.
    text = re.sub(r'(^|[\s])" ([A-Za-z])', r'\1"\2', text)

    # Ensure a space after sentence punctuation when glued to the next word.
    text = re.sub(r"([,.!?;:])([A-Za-z])", r"\1 \2", text)

    # Collapse any double spaces introduced above.
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text
