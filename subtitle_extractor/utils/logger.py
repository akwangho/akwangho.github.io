"""Project-wide logger factory."""

from __future__ import annotations

import logging

_CONFIGURED = False


def get_logger(name: str = "subtitle_extractor", level: int = logging.INFO) -> logging.Logger:
    global _CONFIGURED
    if not _CONFIGURED:
        logging.basicConfig(
            level=level,
            format="%(asctime)s  %(levelname)-7s %(message)s",
            datefmt="%H:%M:%S",
        )
        _CONFIGURED = True
    return logging.getLogger(name)
