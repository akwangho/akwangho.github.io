#!/usr/bin/env python3
"""Merge Whisper JSON segments into draft teaching sentences (agent adds zh + fixes)."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

EPISODE_RE = re.compile(
    r"(?i)(episode\s*(?:one|two|three|four|\d+)|第\s*[一二三四1234]\s*集)",
)
INCOMPLETE_RE = re.compile(r"(—|\.\.\.|…)\s*$")
SENTENCE_END_RE = re.compile(r'[.!?]["\']?\s*$')
SKIP_RE = re.compile(r"^\[(music|laughter|applause)\]$", re.I)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Merge Whisper segments into draft sentences JSON")
    p.add_argument("--json", required=True, help="Whisper segments JSON from transcribe-youtube.py")
    p.add_argument("--output", required=True, help="Output draft sentences JSON")
    p.add_argument("--include-channel-intro", action="store_true", help="Keep leading Little Fox / channel line")
    return p.parse_args()


def normalize(text: str) -> str:
    text = re.sub(r"\s+", " ", text.strip())
    if text and text[0].islower() and text[-1] not in ".!?":
        text = text[0].upper() + text[1:]
    return text


def is_episode_title(text: str) -> bool:
    return bool(EPISODE_RE.search(text))


def should_skip(text: str) -> bool:
    return not text or bool(SKIP_RE.match(text))


def merge_segments(segments: list[dict], include_intro: bool) -> list[dict]:
    sentences: list[dict] = []
    chapter = 0
    buf: list[dict] = []

    def flush(force: bool = False) -> None:
        nonlocal buf, chapter
        if not buf:
            return
        text = normalize(" ".join(x["text"] for x in buf))
        if should_skip(text):
            buf = []
            return
        if INCOMPLETE_RE.search(text) and not force:
            return
        start = buf[0]["start"]
        end = buf[-1]["end"]
        if is_episode_title(text):
            chapter = max(chapter, len([s for s in sentences if is_episode_title(s.get("en", ""))]))
        sentences.append({"chapter": chapter, "en": text, "zh": "", "start": round(start, 2), "end": round(end, 2)})
        buf = []

    for seg in segments:
        text = normalize(seg["text"])
        if should_skip(text):
            continue
        if is_episode_title(text):
            flush(force=True)
            chapter = len([s for s in sentences if EPISODE_RE.search(s.get("en", ""))])
            sentences.append(
                {
                    "chapter": chapter,
                    "en": text,
                    "zh": "",
                    "start": round(seg["start"], 2),
                    "end": round(seg["end"], 2),
                }
            )
            continue
        buf.append(seg)
        merged = normalize(" ".join(x["text"] for x in buf))
        if SENTENCE_END_RE.search(merged):
            flush(force=True)

    flush(force=True)

    if include_intro and segments:
        first = normalize(segments[0]["text"])
        if "little fox" in first.lower() and not any(s["en"].lower().startswith("little fox") for s in sentences):
            sentences.insert(
                0,
                {
                    "chapter": 0,
                    "en": "Little Fox.",
                    "zh": "",
                    "start": round(max(0.0, segments[0]["start"] - 0.5), 2),
                    "end": round(segments[0]["start"] + 2.0, 2),
                },
            )

    for i, s in enumerate(sentences, 1):
        s["id"] = f"s{i}"
    return sentences


def detect_chapters(sentences: list[dict]) -> list[dict]:
    labels: list[dict] = []
    seen = set()
    for s in sentences:
        ch = s["chapter"]
        if ch in seen:
            continue
        seen.add(ch)
        en = s["en"]
        if is_episode_title(en):
            short = re.sub(r".*?(Episode\s*(?:One|Two|Three|Four|\d+)\s*[:，,]?\s*)", "", en, flags=re.I).strip(" .")
            short = short or en
            labels.append({"chapter": ch, "label": short[:24]})
        elif ch == 0 and not labels:
            labels.append({"chapter": 0, "label": "開場"})
    if not labels:
        labels = [{"chapter": 0, "label": "全部內容"}]
    return labels


def main() -> int:
    args = parse_args()
    data = json.loads(Path(args.json).read_text(encoding="utf-8"))
    segments = data["segments"]
    sentences = merge_segments(segments, args.include_channel_intro)
    chapters = detect_chapters(sentences)
    payload = {
        "source_json": str(Path(args.json)),
        "language": data.get("language", "en"),
        "chapters": chapters,
        "sentences": sentences,
    }
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(sentences)} draft sentences → {out}")
    print("Next: add zh translations, fix en merges, then run patch-lesson-html.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
