"""Automatic subtitle-region detection (future enhancement, Phase 2 "future").

A light implementation using text-density over a sample of frames. The default
pipeline uses the fixed bottom-band crop; this is offered for ``--crop auto``.
"""

from __future__ import annotations

from typing import List, Tuple

import numpy as np

from utils.image import text_mask


def estimate_region(
    crops_full_frame: List[np.ndarray],
    text_threshold: int = 150,
    band_ratio: float = 0.05,
) -> Tuple[int, int, int, int]:
    """Return an (x, y, w, h) box around the horizontal band with the most text.

    ``crops_full_frame`` should be a handful of full frames sampled across the
    video. We accumulate a bright-text mask, collapse it to a row profile, and
    pick the densest contiguous band in the lower half of the frame.
    """
    if not crops_full_frame:
        raise ValueError("need at least one frame")

    h, w = crops_full_frame[0].shape[:2]
    acc = np.zeros((h,), dtype=np.float64)
    for frame in crops_full_frame:
        mask = text_mask(frame, text_threshold)
        acc += mask.sum(axis=1)

    lower = acc.copy()
    lower[: h // 2] = 0  # subtitles live in the lower half
    band = max(1, int(h * band_ratio))
    window = np.convolve(lower, np.ones(band), mode="same")
    center = int(window.argmax())
    top = max(0, center - band * 3)
    bottom = min(h, center + band * 3)
    return 0, top, w, bottom - top
