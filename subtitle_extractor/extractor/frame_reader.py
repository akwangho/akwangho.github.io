"""Streaming frame reader that samples a target FPS without decoding every frame.

Frames we are going to skip are advanced with ``grab()`` (no decode), and only the
frames we actually sample are turned into images with ``retrieve()``. This keeps
memory flat and is the key 10-15x speed-up described in the project plan.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

import cv2
import numpy as np

from .video_info import VideoInfo


@dataclass
class Frame:
    index: int          # native frame index
    timestamp: float    # seconds
    image: np.ndarray   # BGR frame


def iter_frames(info: VideoInfo, sample_fps: float) -> Iterator[Frame]:
    step = max(1, int(round(info.fps / max(0.1, sample_fps))))
    cap = cv2.VideoCapture(info.path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {info.path}")
    try:
        index = 0
        while True:
            grabbed = cap.grab()
            if not grabbed:
                break
            if index % step == 0:
                ok, image = cap.retrieve()
                if not ok:
                    break
                yield Frame(index=index, timestamp=index / info.fps, image=image)
            index += 1
    finally:
        cap.release()


def estimated_sample_count(info: VideoInfo, sample_fps: float) -> int:
    step = max(1, int(round(info.fps / max(0.1, sample_fps))))
    if info.frame_count > 0:
        return info.frame_count // step + 1
    return int(info.duration * sample_fps) + 1
