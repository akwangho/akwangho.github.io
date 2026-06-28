"""Phase 7 — merge consecutive OCR samples of the same subtitle into one cue.

Input: a chronological list of (timestamp, text) observations sampled from the
video (text == "" means a blank/no-subtitle frame). Output: clean, non-overlapping
``Subtitle`` cues with accurate start/end times.
"""

from __future__ import annotations

from typing import List, Optional, Sequence, Tuple

from .duplicate_detector import is_duplicate
from .subtitle import Subtitle


def merge_observations(
    observations: Sequence[Tuple[float, str]],
    video_end: float,
    merge_similarity: float = 90.0,
    min_duration: float = 0.30,
    max_gap: float = 0.40,
) -> List[Subtitle]:
    # 1) Turn change-point observations into raw [start, end) spans.
    raw: List[Subtitle] = []
    for i, (ts, text) in enumerate(observations):
        next_ts = observations[i + 1][0] if i + 1 < len(observations) else video_end
        text = (text or "").strip()
        if text:
            raw.append(Subtitle(start=round(ts, 3), end=round(next_ts, 3), text=text))

    if not raw:
        return []

    # 2) Merge neighbours with (near-)identical text, bridging tiny blank gaps.
    merged: List[Subtitle] = [raw[0]]
    for cue in raw[1:]:
        prev = merged[-1]
        gap = cue.start - prev.end
        if is_duplicate(prev.text, cue.text, merge_similarity) and gap <= max_gap:
            prev.end = cue.end
            # Keep the longer of the two readings (more complete OCR).
            if len(cue.text) > len(prev.text):
                prev.text = cue.text
        else:
            merged.append(cue)

    # 3) Drop flicker shorter than min_duration.
    cleaned = [c for c in merged if c.duration >= min_duration]

    # 4) Final safety: stop a cue before the next one begins.
    for i in range(len(cleaned) - 1):
        if cleaned[i].end > cleaned[i + 1].start:
            cleaned[i].end = cleaned[i + 1].start
    return cleaned
