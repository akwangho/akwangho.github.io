#!/usr/bin/env python3
"""Inject DEFAULT_SENTENCES and chapter buttons into a listening lesson HTML."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

DEFAULT_CHAPTER_EMOJI = ["📖", "🎬", "⭐", "🎉", "🌟", "🎯"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Patch lesson HTML from sentences JSON")
    p.add_argument("--html", required=True, help="Target eng/*.html")
    p.add_argument("--sentences-json", required=True, help="Final sentences JSON with zh")
    p.add_argument("--srt-path", help="Relative SRT path for script comment (optional)")
    p.add_argument("--video-url", help="Full YouTube URL for script comment (optional)")
    return p.parse_args()


def js_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def build_sentences_js(sentences: list[dict]) -> str:
    rows = []
    for i, s in enumerate(sentences, 1):
        sid = s.get("id") or f"s{i}"
        rows.append(
            f"    {{ id:'{sid}', chapter:{s['chapter']}, "
            f'en:"{js_escape(s["en"])}", zh:"{s["zh"]}", '
            f"start:{s['start']}, end:{s['end']} }},"
        )
    return "\n".join(rows)


def chapter_button(ch: dict, idx: int) -> str:
    emoji = ch.get("emoji") or DEFAULT_CHAPTER_EMOJI[idx % len(DEFAULT_CHAPTER_EMOJI)]
    label = ch["label"]
    if not label.startswith(emoji):
        label = f"{emoji} {label}"
    v = ch["chapter"]
    return (
        f'<button class="seg" data-k="scope" data-v="{v}" '
        f'onclick="setSetting(\'scope\',\'{v}\')">{label}</button>'
    )


def chapter_buttons_html(chapters: list[dict], key: str) -> str:
    buttons = [
        f'<button class="seg" data-k="{key}" data-v="all" onclick="setSetting(\'{key}\',\'all\')">全部</button>'
    ]
    for i, ch in enumerate(sorted(chapters, key=lambda x: x["chapter"])):
        emoji = ch.get("emoji") or DEFAULT_CHAPTER_EMOJI[i % len(DEFAULT_CHAPTER_EMOJI)]
        label = ch["label"]
        if not label.startswith(emoji):
            label = f"{emoji} {label}"
        v = ch["chapter"]
        buttons.append(
            f'<button class="seg" data-k="{key}" data-v="{v}" '
            f'onclick="setSetting(\'{key}\',\'{v}\')">{label}</button>'
        )
    return "\n                ".join(buttons)


def replace_button_group(html: str, key: str, chapters: list[dict]) -> str:
    replacement = chapter_buttons_html(chapters, key)
    pattern = (
        rf'<button class="seg" data-k="{key}" data-v="all"[^>]*>全部</button>\s*'
        rf'(?:<button class="seg" data-k="{key}"[^>]*>[^<]*</button>\s*)+'
    )
    return re.sub(pattern, replacement + "\n                ", html, count=1)


def patch_comment(html: str, srt_path: str | None, video_url: str | None) -> str:
    extra = "Whisper medium.en 重新轉錄；SRT 碎片已合併為完整句子"
    if srt_path:
        extra += f"；字幕： {srt_path}"
    block = re.search(r"/\* ={57}\n \* .*?={55} \*/", html, re.S)
    if not block:
        return html
    lines = block.group(0).splitlines()
    if len(lines) >= 2 and video_url and "https://" not in lines[2]:
        lines.insert(2, f" *  影片： {video_url}")
    for i, line in enumerate(lines):
        if "SRT" in line or "字幕" in line or "Whisper" in line or "碎片" in line:
            lines[i] = f" *  （{extra}）"
            break
    else:
        lines.insert(-1, f" *  （{extra}）")
    return html[: block.start()] + "\n".join(lines) + html[block.end() :]


def main() -> int:
    args = parse_args()
    html_path = Path(args.html)
    data = json.loads(Path(args.sentences_json).read_text(encoding="utf-8"))
    sentences = data["sentences"]
    chapters = data.get("chapters") or [{"chapter": 0, "label": "全部內容"}]

    missing_zh = [s["en"] for s in sentences if not s.get("zh")]
    if missing_zh:
        raise SystemExit(f"Missing zh for {len(missing_zh)} sentences. Add translations first.")

    html = html_path.read_text(encoding="utf-8")
    html = patch_comment(html, args.srt_path, args.video_url)
    html = re.sub(
        r"const DEFAULT_SENTENCES = \[.*?\n\];",
        "const DEFAULT_SENTENCES = [\n" + build_sentences_js(sentences) + "\n];",
        html,
        count=1,
        flags=re.S,
    )
    html = replace_button_group(html, "scope", chapters)
    html = replace_button_group(html, "shadowScope", chapters)
    html_path.write_text(html, encoding="utf-8")

    srt_out = html_path.with_suffix(".srt")
    if args.srt_path:
        srt_out = Path(args.srt_path)
    print(f"Patched HTML: {html_path} ({len(sentences)} sentences, {len(chapters)} chapters)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
