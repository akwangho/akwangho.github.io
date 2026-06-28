"""Image helpers shared by the detector and OCR stages."""

from __future__ import annotations

import cv2
import numpy as np


def to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def text_mask(image: np.ndarray, threshold: int) -> np.ndarray:
    """Isolate bright subtitle glyphs (white + yellow karaoke highlight).

    Burned-in subtitles are near-white or bright-yellow with a dark outline, so a
    simple luminance threshold separates the text from the muted background well
    enough for change detection.
    """
    gray = to_gray(image)
    _, mask = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)
    return mask


def upscale_for_ocr(image: np.ndarray, scale: float = 1.5) -> np.ndarray:
    """OCR accuracy improves when small glyphs are enlarged a little."""
    if scale == 1.0:
        return image
    h, w = image.shape[:2]
    return cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)


def isolate_text(
    image: np.ndarray,
    scale: float = 2.0,
    white_thr: int = 185,
    yellow_rg: int = 160,
    yellow_b: int = 130,
) -> np.ndarray:
    """Return a clean black-glyphs-on-white image of the bright subtitle text.

    Burned-in captions are white (or a yellow karaoke highlight) with a dark
    outline, so masking near-white and yellow pixels removes the busy cartoon
    background and gives the OCR recogniser a high-contrast input.
    """
    if image.ndim == 2:
        bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    else:
        bgr = image
    b, g, r = cv2.split(bgr.astype(np.int16))
    white = (r > white_thr) & (g > white_thr) & (b > white_thr)
    yellow = (r > yellow_rg) & (g > (yellow_rg - 10)) & (b < yellow_b)
    mask = ((white | yellow) * 255).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))
    out = 255 - mask  # black glyphs on a white page
    if scale != 1.0:
        h, w = out.shape
        out = cv2.resize(out, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
    return cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
