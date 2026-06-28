"""Phase 5 — normalization: full/half-width + story-specific proper nouns.

Burned-in subtitles are already the "ground truth" wording, so normalization is
intentionally conservative: we fix character width and a small set of known
proper nouns, but we never rewrite the sentence.
"""

from __future__ import annotations

import re
import unicodedata

# Story-specific OCR corrections (Little Fox — Peter Rabbit universe).
PROPER_NOUNS = {
    r"\bsilvertail\b": "Silvertail",
    r"\bsilver tail\b": "Silvertail",
    r"\btimmy tiptoes\b": "Timmy Tiptoes",
    r"\btimmy tip toes\b": "Timmy Tiptoes",
    r"\bpeter rabbit\b": "Peter Rabbit",
    r"\bbenjamin bunny\b": "Benjamin Bunny",
    r"\bmrs\.? rabbit\b": "Mrs. Rabbit",
    r"\bmr\.? mcgregor\b": "Mr. McGregor",
    r"\blittle fox\b": "Little Fox",
}


def to_halfwidth(text: str) -> str:
    return unicodedata.normalize("NFKC", text)


def fix_proper_nouns(text: str) -> str:
    for pattern, replacement in PROPER_NOUNS.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def normalize(text: str) -> str:
    if not text:
        return ""
    text = to_halfwidth(text)
    text = fix_proper_nouns(text)
    return text.strip()
