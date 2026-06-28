#!/usr/bin/env python3
"""Scaffold a new eng/ listening lesson from a YouTube URL (transcribe + HTML + index)."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
DEFAULT_TEMPLATE = ROOT / "eng/2026-06-27-Peter-Rabbit-Benjamin-Harvest-Feast.html"
INDEX_HTML = ROOT / "eng/index.html"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Create listening lesson from YouTube URL")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--url")
    src.add_argument("--video-id")
    p.add_argument("--title", required=True, help="Card title for eng/index.html")
    p.add_argument("--slug", required=True, help="English slug, e.g. Peter-Rabbit-Harvest-Feast")
    p.add_argument("--emoji", default="📺")
    p.add_argument("--brand", help="Header brand text (defaults to title)")
    p.add_argument("--page-title", help="Browser <title> (defaults to title + 聽力闖關)")
    p.add_argument("--lesson-date", default=date.today().isoformat())
    p.add_argument("--template", default=str(DEFAULT_TEMPLATE))
    p.add_argument("--model", default="large-v3")
    p.add_argument("--fast", action="store_true", help="Use medium.en (faster, less accurate)")
    p.add_argument("--skip-transcribe", action="store_true")
    p.add_argument("--include-channel-intro", action="store_true")
    return p.parse_args()


def extract_video_id(url_or_id: str) -> str:
    if re.fullmatch(r"[\w-]{6,}", url_or_id):
        return url_or_id
    m = re.search(r"(?:v=|youtu\.be/)([\w-]{6,})", url_or_id)
    if not m:
        raise ValueError(f"Cannot parse YouTube video id from: {url_or_id}")
    return m.group(1)


def run(cmd: list[str]) -> None:
    print("$", " ".join(cmd), file=sys.stderr)
    subprocess.run(cmd, check=True)


def slugify_srt(slug: str, lesson_date: str) -> str:
    return f"{lesson_date}-{slug}.srt"


def update_index(title: str, href: str, emoji: str, lesson_date: str) -> None:
    text = INDEX_HTML.read_text(encoding="utf-8")
    entry = (
        "            {\n"
        f'                title: "{title}",\n'
        f'                href: "{href}",\n'
        f'                emoji: "{emoji}",\n'
        f'                date: "{lesson_date}"\n'
        "            },"
    )
    if href in text:
        print(f"Index already contains {href}", file=sys.stderr)
        return
    text = text.replace("const lessonList = [", "const lessonList = [\n" + entry, 1)
    INDEX_HTML.write_text(text, encoding="utf-8")
    print(f"Updated {INDEX_HTML}", file=sys.stderr)


def patch_scaffold(html_path: Path, args: argparse.Namespace, video_id: str, srt_rel: str) -> None:
    html = html_path.read_text(encoding="utf-8")
    brand = args.brand or args.title
    page_title = args.page_title or f"{args.title} 聽力闖關"
    url = f"https://www.youtube.com/watch?v={video_id}"

    html = re.sub(r"<title>.*?</title>", f"<title>{page_title}</title>", html, count=1)
    html = re.sub(r'(<div class="brand">).*?(</div>)', rf"\1{brand}\2", html, count=1)
    html = re.sub(r"const VIDEO_ID = '[^']*';", f"const VIDEO_ID = '{video_id}';", html, count=1)

    comment = f"""/* =========================================================
 *  {args.title} — 聽力闖關
 *  影片： {url}
 *  字幕： {srt_rel}
 *  （Whisper {args.model} 自動轉錄；待合併句子與繁中翻譯）
 * ======================================================= */"""
    html = re.sub(r"/\* ={57}\n \* .*?={55} \*/", comment, html, count=1, flags=re.S)
    html_path.write_text(html, encoding="utf-8")


def main() -> int:
    args = parse_args()
    video_id = extract_video_id(args.url or args.video_id)
    url = f"https://www.youtube.com/watch?v={video_id}"

    html_name = f"{args.lesson_date}-{args.slug}.html"
    html_path = ROOT / "eng" / html_name
    srt_name = slugify_srt(args.slug, args.lesson_date)
    srt_path = ROOT / "eng/sub" / srt_name
    srt_rel = f"eng/sub/{srt_name}"
    json_path = SCRIPTS / ".cache" / f"{video_id}.json"
    draft_path = SCRIPTS / ".cache" / f"{video_id}-sentences-draft.json"
    manifest_path = SCRIPTS / ".cache" / f"{video_id}-manifest.json"

    if not args.skip_transcribe:
        run(
            [
                sys.executable,
                str(SCRIPTS / "transcribe-youtube.py"),
                "--video-id",
                video_id,
                "--output-srt",
                str(srt_path),
                "--json",
                str(json_path),
                "--model",
                args.model,
            ]
            + (["--fast"] if args.fast else [])
        )

    template = Path(args.template)
    if not template.exists():
        raise FileNotFoundError(template)
    shutil.copy2(template, html_path)
    patch_scaffold(html_path, args, video_id, srt_rel)
    update_index(args.title, html_name, args.emoji, args.lesson_date)

    merge_cmd = [
        sys.executable,
        str(SCRIPTS / "merge-whisper-segments.py"),
        "--json",
        str(json_path),
        "--output",
        str(draft_path),
    ]
    if args.include_channel_intro:
        merge_cmd.append("--include-channel-intro")
    if json_path.exists():
        run(merge_cmd)

    manifest = {
        "video_id": video_id,
        "url": url,
        "html": str(html_path.relative_to(ROOT)),
        "srt": str(srt_path.relative_to(ROOT)),
        "whisper_json": str(json_path.relative_to(ROOT)),
        "sentences_draft": str(draft_path.relative_to(ROOT)),
        "title": args.title,
        "slug": args.slug,
        "emoji": args.emoji,
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n=== Lesson scaffold ready ===")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    print("\nNext steps (agent):")
    print(f"1. Edit {draft_path} — fix en merges, fill every zh")
    print(f"2. Save final JSON, e.g. scripts/.cache/{video_id}-sentences.json")
    print(
        "3. python3 scripts/patch-lesson-html.py "
        f'--html "{html_path}" '
        f'--sentences-json scripts/.cache/{video_id}-sentences.json '
        f'--srt-path {srt_rel} --video-url "{url}"'
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
