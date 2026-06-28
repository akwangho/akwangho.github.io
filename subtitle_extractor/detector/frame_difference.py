"""Low-level frame-difference primitives (Phase 3, priority methods).

1. absdiff()
2. binary threshold
3. count different pixels
"""

from __future__ import annotations

import cv2
import numpy as np

from utils.image import to_gray


def changed_pixel_count(prev: np.ndarray, curr: np.ndarray, difference_threshold: int) -> int:
    """Count pixels whose grayscale value moved by more than ``difference_threshold``."""
    if prev is None:
        return curr.shape[0] * curr.shape[1]
    g_prev = to_gray(prev)
    g_curr = to_gray(curr)
    if g_prev.shape != g_curr.shape:
        g_prev = cv2.resize(g_prev, (g_curr.shape[1], g_curr.shape[0]))
    diff = cv2.absdiff(g_prev, g_curr)
    _, mask = cv2.threshold(diff, difference_threshold, 255, cv2.THRESH_BINARY)
    return int(np.count_nonzero(mask))
