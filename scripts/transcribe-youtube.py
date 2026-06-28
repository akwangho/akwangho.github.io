#!/usr/bin/env python3
"""Download YouTube audio and transcribe to SRT using faster-whisper (word-aligned)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from subtitle_utils import (
    LITTLE_FOX_PROMPT,
    clean_text,
    format_timestamp,
    normalize_spoken_line,
    segment_bounds,
    should_skip,
    words_from_whisper_segment,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Transcribe YouTube video to SRT")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--url", help="YouTube URL")
    src.add_argument("--video-id", help="YouTube video ID")
    parser.add_argument("--output-srt", required=True, help="Output .srt path")
    parser.add_argument(
        "--model",
        default="large-v3",
        help="faster-whisper model (default: large-v3 for accuracy)",
    )
    parser.add_argument("--language", default="en", help="Language code (default: en)")
    parser.add_argument("--json", dest="json_out", help="Optional path for segments+words JSON")
    parser.add_argument(
        "--cache-dir",
        default=str(Path(__file__).resolve().parent / ".cache"),
        help="Directory for downloaded audio",
    )
    parser.add_argument(
        "--fast",
        action="store_true",
        help="Use medium.en + int8 (faster, less accurate)",
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Reuse existing WAV in cache-dir",
    )
    return parser.parse_args()


def video_url(args: argparse.Namespace) -> str:
    if args.url:
        return args.url
    return f"https://www.youtube.com/watch?v={args.video_id}"


def download_audio(url: str, cache_dir: Path) -> Path:
    import subprocess

    cache_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(cache_dir / "%(id)s.%(ext)s")
    cmd = [
        "yt-dlp",
        "-x",
        "--audio-format",
        "wav",
        "--postprocessor-args",
        "ffmpeg:-ar 16000 -ac 1",
        "-o",
        output_template,
        url,
    ]
    print("Downloading audio:", " ".join(cmd), file=sys.stderr)
    subprocess.run(cmd, check=True)

    wav_files = sorted(cache_dir.glob("*.wav"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not wav_files:
        raise FileNotFoundError(f"No WAV file found in {cache_dir}")
    return wav_files[0]


def find_cached_wav(cache_dir: Path, video_id: str | None) -> Path | None:
    if video_id:
        p = cache_dir / f"{video_id}.wav"
        if p.exists():
            return p
    wavs = sorted(cache_dir.glob("*.wav"), key=lambda p: p.stat().st_mtime, reverse=True)
    return wavs[0] if wavs else None


def segment_to_dict(segment) -> dict:
    text = normalize_spoken_line(segment.text or "")
    words = words_from_whisper_segment(segment)
    start, end = segment_bounds({"start": segment.start, "end": segment.end, "words": words})
    return {
        "start": start,
        "end": end,
        "text": text,
        "words": words,
    }


def segments_to_srt(segment_dicts: list[dict]) -> str:
    lines: list[str] = []
    index = 1
    for seg in segment_dicts:
        text = seg["text"]
        if should_skip(text):
            continue
        start, end = segment_bounds(seg)
        lines.append(str(index))
        lines.append(f"{format_timestamp(start)} --> {format_timestamp(end)}")
        lines.append(text)
        lines.append("")
        index += 1
    return "\n".join(lines).rstrip() + "\n"


def transcribe(audio_path: Path, model_name: str, language: str, fast: bool):
    from faster_whisper import WhisperModel

    compute = "int8" if fast or "large" in model_name else "float32"
    print(f"Loading model {model_name} ({compute})...", file=sys.stderr)
    model = WhisperModel(model_name, device="cpu", compute_type=compute)
    print(f"Transcribing {audio_path}...", file=sys.stderr)
    segments, info = model.transcribe(
        str(audio_path),
        language=language,
        vad_filter=True,
        word_timestamps=True,
        beam_size=5 if fast else 10,
        best_of=5 if not fast else 1,
        condition_on_previous_text=True,
        initial_prompt=LITTLE_FOX_PROMPT,
        no_speech_threshold=0.5,
        compression_ratio_threshold=2.4,
    )
    segment_list = list(segments)
    print(
        f"Done. Language={info.language} prob={info.language_probability:.2f} segments={len(segment_list)}",
        file=sys.stderr,
    )
    return segment_list, info


def main() -> int:
    args = parse_args()
    url = video_url(args)
    cache_dir = Path(args.cache_dir)
    output_srt = Path(args.output_srt)
    output_srt.parent.mkdir(parents=True, exist_ok=True)

    model_name = "medium.en" if args.fast else args.model
    video_id = args.video_id or (url.split("v=")[-1].split("&")[0] if "v=" in url else None)

    if args.skip_download:
        audio_path = find_cached_wav(cache_dir, video_id)
        if not audio_path:
            raise FileNotFoundError("No cached WAV; run without --skip-download")
    else:
        audio_path = download_audio(url, cache_dir)

    segments, info = transcribe(audio_path, model_name, args.language, args.fast)
    segment_dicts = [segment_to_dict(seg) for seg in segments]
    segment_dicts = [s for s in segment_dicts if not should_skip(s["text"])]

    if args.json_out:
        json_path = Path(args.json_out)
        payload = {
            "language": info.language,
            "language_probability": info.language_probability,
            "model": model_name,
            "word_aligned": True,
            "segments": segment_dicts,
        }
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote JSON: {json_path}", file=sys.stderr)

    srt = segments_to_srt(segment_dicts)
    output_srt.write_text(srt, encoding="utf-8")
    print(f"Wrote SRT: {output_srt} ({srt.count(chr(10)) // 4} cues)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
