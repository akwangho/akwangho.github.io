"""Tiny YAML loader kept separate so the rest of the code never imports yaml directly."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict


def load_yaml(path: Path) -> Dict[str, Any]:
    path = Path(path)
    if not path.exists():
        return {}
    import yaml

    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}
