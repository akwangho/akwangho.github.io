#!/usr/bin/env python3
"""Hard Subtitle Extractor — CLI entry point.

Pipeline (see README.md / project plan):

    video -> frame_reader -> crop -> change detector -> OCR
          -> clean + normalize -> merge/dedupe -> SRT

Example:

    python main.py input.mp4 --output output.srt --fps 3 --lang en --debug
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running as a plain script (python main.py ...) by making the package
# directory importable.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import cv2  # noqa: E402

from config import Config  # noqa: E402
from detector.subtitle_change_detector import SubtitleChangeDetector  # noqa: E402
from extractor import crop as crop_mod  # noqa: E402
from extractor import frame_reader, video_info  # noqa: E402
from ocr.paddle_ocr import OCREngine  # noqa: E402
from ocr.text_cleaner import clean_text  # noqa: E402
from ocr.text_normalizer import normalize  # noqa: E402
from subtitle.srt_writer import write_srt  # noqa: E402
from subtitle.subtitle_merger import merge_observations  # noqa: E402
from utils.logger import get_logger  # noqa: E402

log = get_logger()


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Extract burned-in (hard) subtitles to SRT.")
    p.add_argument("input", help="Input video file (mp4/mkv/mov).")
    p.add_argument("--output", help="Output .srt path (default: output/<name>.srt).")
    p.add_argument("--config", help="Path to a config.yaml (default: bundled).")
    p.add_argument("--fps", type=float, help="Frames per second to sample.")
    p.add_argument("--crop", choices=["ratio", "box", "auto"], help="Crop mode.")
    p.add_argument("--crop-ratio", type=float, help="Bottom band fraction (crop=ratio).")
    p.add_argument("--lang", dest="ocr_language", help="OCR language (en|ch).")
    p.add_argument("--gpu", dest="use_gpu", action="store_true", default=None, help="Use GPU OCR.")
    p.add_argument("--merge-threshold", type=float, dest="merge_similarity",
                   help="RapidFuzz similarity to treat cues as identical.")
    p.add_argument("--min-change", type=int, dest="minimum_change_pixels",
                   help="Min changed pixels to trigger OCR.")
    p.add_argument("--llm-correct", dest="llm_correction", action="store_true", default=None,
                   help="Enable LLM OCR correction (stub).")
    p.add_argument("--debug", action="store_true", default=None, help="Dump debug crops + text.")
    return p.parse_args()


def build_config(args: argparse.Namespace) -> Config:
    cfg = Config.load(Path(args.config) if args.config else None)
    crop_mode = None
    crop_ratio = args.crop_ratio
    if args.crop == "box":
        crop_mode = "box"
    elif args.crop == "ratio":
        crop_mode = "ratio"
    elif args.crop == "auto":
        crop_mode = "ratio"  # auto-detect handled separately below if implemented
    cfg.apply_overrides(
        fps=args.fps,
        crop_mode=crop_mode,
        crop_ratio=crop_ratio,
        ocr_language=args.ocr_language,
        use_gpu=args.use_gpu,
        merge_similarity=args.merge_similarity,
        minimum_change_pixels=args.minimum_change_pixels,
        llm_correction=args.llm_correction,
        debug=args.debug,
    )
    return cfg


def main() -> int:
    args = parse_args()
    cfg = build_config(args)

    in_path = Path(args.input)
    if not in_path.exists():
        log.error("Input not found: %s", in_path)
        return 2

    out_dir = Path(__file__).resolve().parent / "output"
    out_path = Path(args.output) if args.output else out_dir / f"{in_path.stem}.srt"
    debug_dir = out_dir / "debug"
    if cfg.debug:
        debug_dir.mkdir(parents=True, exist_ok=True)

    info = video_info.probe(in_path)
    log.info(
        "Video: %dx%d  %.3f fps  %d frames  %.1fs",
        info.width, info.height, info.fps, info.frame_count, info.duration,
    )

    log.info("Loading OCR engine (lang=%s, gpu=%s)...", cfg.ocr_language, cfg.use_gpu)
    engine = OCREngine(language=cfg.ocr_language, use_gpu=cfg.use_gpu)
    log.info("OCR backend: %s", engine.kind)

    detector = SubtitleChangeDetector(
        difference_threshold=cfg.difference_threshold,
        minimum_change_pixels=cfg.minimum_change_pixels,
        text_threshold=cfg.text_threshold,
    )

    total = frame_reader.estimated_sample_count(info, cfg.fps)
    try:
        from tqdm import tqdm
        progress = tqdm(total=total, unit="frame", desc="scan")
    except Exception:
        progress = None

    observations: list[tuple[float, str]] = []
    ocr_calls = 0
    for frame in frame_reader.iter_frames(info, cfg.fps):
        if progress:
            progress.update(1)
        crop = crop_mod.subtitle_region(
            frame.image,
            crop_mode=cfg.crop_mode,
            crop_ratio=cfg.crop_ratio,
            crop_box=cfg.crop_box,
        )
        changed, count = detector.is_changed(crop)
        if not changed:
            continue

        text = normalize(clean_text(engine.read(crop)))
        ocr_calls += 1
        observations.append((frame.timestamp, text))

        if cfg.debug:
            stem = f"{frame.index:06d}_{frame.timestamp:07.2f}"
            cv2.imwrite(str(debug_dir / f"crop_{stem}.png"), crop)
            (debug_dir / f"ocr_{stem}.txt").write_text(text, encoding="utf-8")

    if progress:
        progress.close()

    log.info(
        "Sampled ~%d frames, OCR ran %d times (%.1f%% of samples).",
        total, ocr_calls, (100.0 * ocr_calls / total) if total else 0.0,
    )

    cues = merge_observations(
        observations,
        video_end=info.duration,
        merge_similarity=cfg.merge_similarity,
        min_duration=cfg.min_duration,
        max_gap=cfg.max_gap,
    )

    write_srt(cues, out_path)
    log.info("Wrote %d cues -> %s", len(cues), out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
