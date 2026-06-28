"""Crop the subtitle region out of a full frame.

Phase 2 of the plan: the initial version is a fixed bottom-band crop. A
``box`` mode is also supported for videos whose subtitles sit elsewhere.
"""

from __future__ import annotations

from typing import Optional, Sequence

import numpy as np


def subtitle_region(
    frame: np.ndarray,
    crop_mode: str = "ratio",
    crop_ratio: float = 0.28,
    crop_box: Optional[Sequence[int]] = None,
) -> np.ndarray:
    h, w = frame.shape[:2]
    if crop_mode == "box" and crop_box:
        x, y, bw, bh = (int(v) for v in crop_box)
        x = max(0, min(x, w - 1))
        y = max(0, min(y, h - 1))
        bw = max(1, min(bw, w - x))
        bh = max(1, min(bh, h - y))
        return frame[y : y + bh, x : x + bw]

    ratio = min(max(crop_ratio, 0.05), 0.95)
    top = int(h * (1.0 - ratio))
    return frame[top:h, 0:w]
