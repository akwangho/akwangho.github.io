"""Typed configuration object and loader for the subtitle extractor."""

from __future__ import annotations

from dataclasses import dataclass, fields
from pathlib import Path
from typing import Optional

from utils.config_loader import load_yaml

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "config.yaml"


@dataclass
class Config:
    # Frame sampling
    fps: float = 3.0

    # Subtitle region
    crop_mode: str = "ratio"          # "ratio" | "box"
    crop_ratio: float = 0.28
    crop_box: Optional[list] = None   # [x, y, w, h]

    # Change detection
    difference_threshold: int = 30
    minimum_change_pixels: int = 3000
    text_threshold: int = 150

    # OCR
    ocr_language: str = "en"
    use_gpu: bool = False

    # Merge / dedupe
    merge_similarity: float = 90.0
    min_duration: float = 0.30
    max_gap: float = 0.40

    # Misc
    llm_correction: bool = False
    debug: bool = False

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "Config":
        """Build a Config from a YAML file, falling back to dataclass defaults."""
        data = load_yaml(path or DEFAULT_CONFIG_PATH)
        known = {f.name for f in fields(cls)}
        clean = {k: v for k, v in (data or {}).items() if k in known}
        return cls(**clean)

    def apply_overrides(self, **overrides) -> "Config":
        """Return a copy with any non-None overrides applied (used by the CLI)."""
        for key, value in overrides.items():
            if value is not None and hasattr(self, key):
                setattr(self, key, value)
        return self
