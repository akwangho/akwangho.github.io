"""Subtitle cue data model."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Subtitle:
    start: float  # seconds
    end: float    # seconds
    text: str

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)
