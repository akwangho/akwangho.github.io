"""OCR engine wrapper around the PP-OCR (PaddleOCR) detection + recognition models.

The plan specifies PaddleOCR. On many platforms (notably macOS / Python 3.13)
``paddlepaddle`` has no prebuilt wheel, so we default to **RapidOCR**, which runs
the *exact same* PP-OCR models through ONNX Runtime and needs no paddle build.
If a real PaddleOCR install is present it is used automatically.

Either way the public surface is a single ``OCREngine.read(crop) -> str`` call
that returns one reading-ordered line of text.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

import numpy as np

from utils.image import isolate_text, upscale_for_ocr


class OCREngine:
    def __init__(self, language: str = "en", use_gpu: bool = False) -> None:
        self.language = language
        self.use_gpu = use_gpu
        self._backend = None
        self._kind = None
        self._init_backend()

    def _init_backend(self) -> None:
        # Prefer real PaddleOCR when it is importable...
        try:
            from paddleocr import PaddleOCR  # type: ignore

            self._backend = PaddleOCR(
                use_angle_cls=False,
                lang=self.language,
                use_gpu=self.use_gpu,
                show_log=False,
            )
            self._kind = "paddleocr"
            return
        except Exception:
            pass

        # ...otherwise use RapidOCR (PP-OCR models via ONNX Runtime).
        try:
            from rapidocr_onnxruntime import RapidOCR  # type: ignore

            self._backend = RapidOCR()
            self._kind = "rapidocr"
            return
        except Exception as exc:  # pragma: no cover - dependency missing
            raise RuntimeError(
                "No OCR backend available. Install 'rapidocr-onnxruntime' "
                "(recommended) or 'paddleocr' + 'paddlepaddle'."
            ) from exc

    @property
    def kind(self) -> str:
        return self._kind or "none"

    def _raw(self, image: np.ndarray) -> List[Tuple[list, str, float]]:
        """Normalize both backends to a list of (box, text, score)."""
        if self._kind == "rapidocr":
            result, _ = self._backend(image)
            if not result:
                return []
            return [(box, text, float(score)) for box, text, score in result]

        # paddleocr
        result = self._backend.ocr(image, cls=False)
        out: List[Tuple[list, str, float]] = []
        if result and result[0]:
            for box, (text, score) in result[0]:
                out.append((box, text, float(score)))
        return out

    def read(self, crop: np.ndarray, min_score: float = 0.5) -> str:
        """OCR a subtitle crop.

        The raw (upscaled) crop gives the best results on most frames. Only when
        it finds nothing — e.g. a low-contrast frame — do we fall back to the
        text-isolated black-on-white rendering, which can recover faint glyphs.
        """
        text, _score, _tokens = self._read_image(upscale_for_ocr(crop, scale=1.5), min_score)
        if text:
            return text
        text, _score, _tokens = self._read_image(isolate_text(crop, scale=1.5), min_score)
        return text

    def _read_image(self, image: np.ndarray, min_score: float) -> Tuple[str, float, int]:
        items = self._raw(image)
        if not items:
            return "", 0.0, 0

        kept = []
        scores = []
        for box, text, score in items:
            if score < min_score or not text.strip():
                continue
            ys = [pt[1] for pt in box]
            xs = [pt[0] for pt in box]
            kept.append((min(ys), min(xs), text.strip()))
            scores.append(float(score))
        if not kept:
            return "", 0.0, 0

        # Group into visual lines (top->bottom), then order left->right within a line.
        kept.sort(key=lambda t: (t[0], t[1]))
        line_height = _median_line_height(items)
        lines: List[List[Tuple[float, float, str]]] = []
        for item in kept:
            placed = False
            for line in lines:
                if abs(line[0][0] - item[0]) <= line_height * 0.6:
                    line.append(item)
                    placed = True
                    break
            if not placed:
                lines.append([item])

        rendered_lines = []
        for line in lines:
            line.sort(key=lambda t: t[1])
            rendered_lines.append(" ".join(piece[2] for piece in line))
        text = " ".join(rendered_lines).strip()
        mean_score = sum(scores) / len(scores)
        tokens = len(text.split())
        return text, mean_score, tokens


def _median_line_height(items: List[Tuple[list, str, float]]) -> float:
    heights = []
    for box, _text, _score in items:
        ys = [pt[1] for pt in box]
        heights.append(max(ys) - min(ys))
    if not heights:
        return 30.0
    heights.sort()
    return max(10.0, heights[len(heights) // 2])
