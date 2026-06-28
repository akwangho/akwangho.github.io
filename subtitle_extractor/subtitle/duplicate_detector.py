"""Phase 6 — duplicate detection via exact match + RapidFuzz similarity."""

from __future__ import annotations

import re

from rapidfuzz import fuzz


def _key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def is_duplicate(a: str, b: str, threshold: float = 90.0) -> bool:
    ka, kb = _key(a), _key(b)
    if not ka or not kb:
        return ka == kb
    if ka == kb:
        return True
    return fuzz.ratio(ka, kb) >= threshold
