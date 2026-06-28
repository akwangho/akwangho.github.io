"""Future enhancement stub — LLM OCR correction.

The contract (per the plan): the LLM only *fixes OCR mistakes*. It must not
rewrite, translate, or paraphrase. Disabled by default; wired through config so
a real implementation can be dropped in later.
"""

from __future__ import annotations

from typing import List


def correct(lines: List[str]) -> List[str]:
    # No-op until a real corrector is configured.
    return lines
