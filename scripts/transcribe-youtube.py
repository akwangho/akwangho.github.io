#!/usr/bin/env python3
"""Download YouTube audio and transcribe to SRT using faster-whisper."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

# Little Fox / story-specific ASR corrections
TEXT_REPLACEMENTS = {
    r"\bTimmy tip toes\b": "Timmy Tiptoes",
    r"\bTimmy Tip Toes\b": "Timmy Tiptoes",
    r"\bTimmy tip-toes\b": "Timmy Tiptoes",
    r"\bTimmy tiptoes\b": "Timmy Tiptoes",
    r"\bTimmy Tiptoes\b": "Timmy Tiptoes",
    r"\bSilver tail\b": "Silvertail",
    r"\bSilver Tail\b": "Silvertail",
    r"\bPeter rabbit\b": "Peter Rabbit",
    r"\bBenjamin bunny\b": "Benjamin Bunny",
    r"\blittle fox\b": "Little Fox",
}

SKIP_PATTERNS = [
    re.compile(r"^\s*\[music\]\s*$", re.I),
    re.compile(r"^\s*\[laughter\]\s*$", re.I),
    re.compile(r"^\s*\[applause\]\s*$", re.I),
    re.compile(r"^\s*$"),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Transcribe YouTube video to SRT")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--url", help="YouTube URL")
    src.add_argument("--video-id", help="YouTube video ID")
    parser.add_argument("--output-srt", required=True, help="Output .srt path")
    parser.add_argument("--model", default="medium.en", help="faster-whisper model (default: medium.en)")
    parser.add_argument("--language", default="en", help="Language code (default: en)")
    parser.add_argument("--json", dest="json_out", help="Optional path for raw segments JSON")
    parser.add_argument(
        "--cache-dir",
        default=str(Path(__file__).resolve().parent / ".cache"),
        help="Directory for downloaded audio",
    )
    return parser.parse_args()


def video_url(args: argparse.Namespace) -> str:
    if args.url:
        return args.url
    return f"https://www.youtube.com/watch?v={args.video_id}"


def download_audio(url: str, cache_dir: Path) -> Path:
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


def format_timestamp(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def clean_text(text: str) -> str:
    text = text.strip()
    for pattern, replacement in TEXT_REPLACEMENTS.items():
        text = re.sub(pattern, replacement, text, flags=re.I)
    return text


def should_skip(text: str) -> bool:
    return any(p.match(text) for p in SKIP_PATTERNS)


def segments_to_srt(segments) -> str:
    lines: list[str] = []
    index = 1
    for seg in segments:
        text = clean_text(seg.text or "")
        if should_skip(text):
            continue
        lines.append(str(index))
        lines.append(f"{format_timestamp(seg.start)} --> {format_timestamp(seg.end)}")
        lines.append(text)
        lines.append("")
        index += 1
    return "\n".join(lines).rstrip() + "\n"


def transcribe(audio_path: Path, model_name: str, language: str):
    from faster_whisper import WhisperModel

    print(f"Loading model {model_name}...", file=sys.stderr)
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    print(f"Transcribing {audio_path}...", file=sys.stderr)
    segments, info = model.transcribe(
        str(audio_path),
        language=language,
        vad_filter=True,
        word_timestamps=True,
        beam_size=5,
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

    audio_path = download_audio(url, cache_dir)
    segments, info = transcribe(audio_path, args.model, args.language)

    if args.json_out:
        json_path = Path(args.json_out)
        payload = {
            "language": info.language,
            "language_probability": info.language_probability,
            "segments": [
                {
                    "start": seg.start,
                    "end": seg.end,
                    "text": clean_text(seg.text or ""),
                }
                for seg in segments
                if not should_skip(clean_text(seg.text or ""))
            ],
        }
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote JSON: {json_path}", file=sys.stderr)

    srt = segments_to_srt(segments)
    output_srt.write_text(srt, encoding="utf-8")
    print(f"Wrote SRT: {output_srt} ({srt.count(chr(10)) // 4} cues)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
