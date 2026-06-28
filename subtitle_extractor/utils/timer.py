"""Lightweight context-manager timer for rough profiling."""

from __future__ import annotations

import time
from contextlib import contextmanager


@contextmanager
def measure(label: str = ""):
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start
        print(f"[timer] {label}: {elapsed:.2f}s")
