"""Optional image-similarity helpers (SSIM / perceptual hash).

These are not required by the default pipeline but are provided as the
"optional" detection methods listed in Phase 3 of the plan.
"""

from __future__ import annotations

import cv2
import numpy as np

from utils.image import to_gray


def mean_abs_diff(prev: np.ndarray, curr: np.ndarray) -> float:
    g_prev = to_gray(prev).astype(np.float32)
    g_curr = to_gray(curr).astype(np.float32)
    if g_prev.shape != g_curr.shape:
        g_curr = cv2.resize(g_curr, (g_prev.shape[1], g_prev.shape[0]))
    return float(np.mean(cv2.absdiff(g_prev, g_curr)))


def phash(image: np.ndarray, hash_size: int = 8) -> int:
    """Tiny perceptual hash (average hash) — handy for quick equality checks."""
    gray = to_gray(image)
    small = cv2.resize(gray, (hash_size, hash_size), interpolation=cv2.INTER_AREA)
    avg = small.mean()
    bits = (small > avg).flatten()
    out = 0
    for bit in bits:
        out = (out << 1) | int(bit)
    return out


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")
