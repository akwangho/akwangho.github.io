"""Decide when the subtitle has actually changed so we only OCR on transitions.

The detector compares the *bright-text mask* of consecutive sampled crops. Using
the thresholded text mask (instead of the raw crop) makes the decision robust to:

* moving cartoon backgrounds behind the subtitle, and
* the yellow karaoke highlight sweeping across an otherwise-unchanged line
  (we tune ``minimum_change_pixels`` above a single word but below a full line).
"""

from __future__ import annotations

from typing import Optional

import numpy as np

from utils.image import text_mask
from .frame_difference import changed_pixel_count


class SubtitleChangeDetector:
    def __init__(
        self,
        difference_threshold: int = 30,
        minimum_change_pixels: int = 3000,
        text_threshold: int = 150,
    ) -> None:
        self.difference_threshold = difference_threshold
        self.minimum_change_pixels = minimum_change_pixels
        self.text_threshold = text_threshold
        self._prev_mask: Optional[np.ndarray] = None

    def reset(self) -> None:
        self._prev_mask = None

    def is_changed(self, crop: np.ndarray) -> tuple[bool, int]:
        """Return (changed, changed_pixel_count) and update internal state."""
        mask = text_mask(crop, self.text_threshold)
        if self._prev_mask is None:
            self._prev_mask = mask
            return True, mask.size

        count = changed_pixel_count(self._prev_mask, mask, self.difference_threshold)
        changed = count >= self.minimum_change_pixels
        if changed:
            self._prev_mask = mask
        return changed, count
