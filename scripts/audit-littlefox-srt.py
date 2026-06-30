#!/usr/bin/env python3
"""Audit and repair Little Fox SRT / listening-lesson subtitles.

Detects merged cues, missing lines, timing overlaps, and non-traditional zh.
See .agents/skills/youtube-listening-lesson/SKILL.md §字幕完整性稽核.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from subtitle_utils import sentences_to_srt  # noqa: E402

try:
    import zhconv
except ImportError:
    zhconv = None  # type: ignore


@dataclass
class Cue:
    en: str
    start: float
    end: float
    zh: str = ""
    chapter: int = 0


STORIES = {
    "harvest-feast": {
        "srt": ROOT / "eng/sub/2026-06-28-Peter-Rabbit-Harvest-Feast.srt",
        "html": ROOT / "eng/2026-06-28-Peter-Rabbit-Harvest-Feast.html",
    },
    "full-story": {
        "srt": ROOT / "eng/sub/2026-06-29-The-Tale-of-Peter-Rabbit-Full-Story.srt",
        "html": ROOT / "eng/2026-06-29-The-Tale-of-Peter-Rabbit-Full-Story.html",
    },
    "boot": {
        "srt": ROOT / "eng/sub/2026-06-30-Peter-Rabbit-Benjamin-Adventure-with-a-Boot.srt",
        "html": ROOT / "eng/2026-06-30-Peter-Rabbit-Benjamin-Adventure-with-a-Boot.html",
    },
}

REQUIRED_LINES = {
    "harvest-feast": [
        "Silvertail bent deeper.",
        '"Where are they?"',
        '"Right there."',
        '"We must stop him."',
    ],
    "full-story": [
        '"Ahh!" he cried.',
        '"Help!" he cried.',
        '"I\'m stuck in this net!"',
        '"Brr!" said Peter.',
        '"Whew!" whispered Peter.',
        "Scritch, scratch!",
    ],
    "boot": [
        '"Oh no!" Peter said.',
        '"We must find Mrs. Tiggy-Winkle," Benjamin said.',
    ],
}

# Name / glossary overrides after OpenCC (keep 班傑明, character names)
ZH_OVERRIDES = [
    (r"本傑明", "班傑明"),
    (r"本杰明", "班傑明"),
    (r"看那边", "看那邊"),
    (r"看那邊", "看那邊"),
]


def ts_to_sec(ts: str) -> float:
    h, m, rest = ts.split(":")
    s, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def parse_srt(path: Path) -> list[Cue]:
    cues: list[Cue] = []
    for block in path.read_text(encoding="utf-8").strip().split("\n\n"):
        lines = block.split("\n")
        if len(lines) < 3:
            continue
        start_s, end_s = [x.strip() for x in lines[1].split("-->")]
        cues.append(Cue(en="\n".join(lines[2:]), start=ts_to_sec(start_s), end=ts_to_sec(end_s)))
    return cues


def parse_html_sentences(path: Path) -> list[dict]:
    html = path.read_text(encoding="utf-8")
    pat = re.compile(
        r"\{ id:'s(\d+)', chapter:(\d+), en:\"((?:[^\"\\]|\\.)*)\", "
        r"zh:\"((?:[^\"\\]|\\.)*)\", start:([\d.]+), end:([\d.]+) \}"
    )
    out: list[dict] = []
    for m in pat.finditer(html):
        en = m.group(3).replace('\\"', '"').replace("\\'", "'")
        out.append(
            {
                "id": f"s{m.group(1)}",
                "chapter": int(m.group(2)),
                "en": en,
                "zh": m.group(4),
                "start": float(m.group(5)),
                "end": float(m.group(6)),
            }
        )
    return out


def js_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def patch_html_sentences(html_path: Path, sentences: list[dict]) -> None:
    html = html_path.read_text(encoding="utf-8")
    rows = []
    for i, s in enumerate(sentences, 1):
        sid = s.get("id") or f"s{i}"
        rows.append(
            f"    {{ id:'{sid}', chapter:{s['chapter']}, "
            f'en:"{js_escape(s["en"])}", zh:"{s["zh"]}", '
            f"start:{s['start']}, end:{s['end']} }},"
        )
    block = "const DEFAULT_SENTENCES = [\n" + "\n".join(rows) + "\n];"
    html, n = re.subn(r"const DEFAULT_SENTENCES = \[[\s\S]*?\];", block, html, count=1)
    if n != 1:
        raise SystemExit(f"Could not patch DEFAULT_SENTENCES in {html_path}")
    html_path.write_text(html, encoding="utf-8")


def merge_html_into_cues(cues: list[Cue], html_sents: list[dict]) -> None:
    hi = 0
    for cue in cues:
        while hi < len(html_sents) and html_sents[hi]["en"] != cue.en:
            hi += 1
        if hi < len(html_sents):
            cue.zh = html_sents[hi]["zh"]
            cue.chapter = html_sents[hi]["chapter"]
            hi += 1


def find(cues: list[Cue], needle: str) -> int:
    for i, c in enumerate(cues):
        if needle in c.en:
            return i
    raise ValueError(f"cue not found: {needle!r}")


def split_cue(c: Cue, a_en: str, b_en: str, a_zh: str, b_zh: str, ratio: float = 0.5) -> list[Cue]:
    mid = c.start + (c.end - c.start) * ratio
    return [
        Cue(a_en, c.start, mid, a_zh, c.chapter),
        Cue(b_en, mid, c.end, b_zh, c.chapter),
    ]


def insert_after(cues: list[Cue], idx: int, new: Cue) -> None:
    new.chapter = cues[idx].chapter
    cues.insert(idx + 1, new)


def normalize_zh(text: str) -> str:
    if zhconv:
        text = zhconv.convert(text, "zh-tw")
    for pat, repl in ZH_OVERRIDES:
        text = re.sub(pat, repl, text)
    return text


def fix_timing_overlaps(cues: list[Cue]) -> int:
    """Ensure each cue starts after the previous ends (min 0.05s gap)."""
    fixes = 0
    for i in range(1, len(cues)):
        prev, cur = cues[i - 1], cues[i]
        if cur.start < prev.end + 0.05:
            dur = max(0.4, cur.end - cur.start)
            cur.start = round(prev.end + 0.05, 2)
            if cur.end <= cur.start:
                cur.end = round(cur.start + dur, 2)
            fixes += 1
    return fixes


def fix_harvest_feast(cues: list[Cue]) -> list[Cue]:
    out = list(cues)

    i = find(out, "Yes!")
    if "licked" in out[i].en and not any(c.en == '"Where are they?"' for c in out):
        insert_after(out, i, Cue('"Where are they?"', out[i].end + 1.0, out[i].end + 3.5, "「它們在哪裡？」"))

    j = find(out, "Silvertail is stealing our nuts!")
    if "We must stop him" in out[j].en:
        out[j : j + 1] = split_cue(
            out[j],
            '"Silvertail is stealing our nuts!"',
            '"We must stop him."',
            "「銀尾巴正在偷我們的堅果！」",
            "「我們得阻止他！」",
            0.55,
        )

    k = find(out, "Peter pointed to the nut pies")
    if not any(c.en == '"Right there."' for c in out):
        insert_after(out, k, Cue('"Right there."', out[k].end + 0.3, out[k].end + 1.8, "「就在那裡。」"))

    # Split stuck cry (Little Fox: "Ahh!" / "I'm stuck!" as separate beats)
    s = find(out, "Ahh!")
    if "I'm stuck" in out[s].en and out[s].en.count('"') >= 4:
        c = out[s]
        out[s : s + 1] = split_cue(
            c,
            '"Ahh!" he cried.',
            '"I\'m stuck!"',
            "「啊！」他大叫。",
            "「我卡住了！」",
            0.4,
        )

    fix_timing_overlaps(out)
    return out


def fix_full_story(cues: list[Cue]) -> list[Cue]:
    out = list(cues)

    j = find(out, "Look over there")
    if "blackberry bush" in out[j].en:
        out[j : j + 1] = split_cue(
            out[j],
            '"Look over there," said Mopsy.',
            '"I see a blackberry bush!"',
            "「看那邊。」莫普西說。",
            "「我看到一叢黑莓！」",
            0.45,
        )

    k = find(out, "The farmer!")
    if out[k].en == "Peter gasped. The farmer!":
        out[k].en = 'Peter gasped. "The farmer!"'

    if not any(c.en == '"Ahh!" he cried.' for c in out):
        b = find(out, "big buttons")
        insert_after(out, b, Cue('"Ahh!" he cried.', out[b].end + 0.2, out[b].end + 1.8, "「啊！」他大叫。"))

    m = find(out, '"Help!')
    if "I'm stuck in this net" in out[m].en and "cried Peter" in out[m].en:
        c = out[m]
        out[m : m + 1] = split_cue(
            c,
            '"Help!" he cried.',
            '"I\'m stuck in this net!"',
            "「救命！」他大喊。",
            "「我被困在這張網子裡了！」",
            0.35,
        )

    if not any(c.en == '"Brr!" said Peter.' for c in out):
        w = find(out, "icy water")
        insert_after(out, w, Cue('"Brr!" said Peter.', out[w].end + 0.1, out[w].end + 0.9, "「好冷！」彼得說。"))

    sne = find(out, "Peter sneezed")
    if out[sne].en == "Peter sneezed." and sne > 0 and "tickle" in out[sne - 1].en:
        out[sne].en = '"Ah-choo!" Peter sneezed.'
        out[sne].zh = "「啊——嚏！」彼得打了一個大噴嚏。"

    if not any(c.en == '"Whew!" whispered Peter.' for c in out):
        cat = find(out, "didn't see Peter")
        insert_after(out, cat, Cue('"Whew!" whispered Peter.', out[cat].end + 0.2, out[cat].end + 1.5, "「呼！」彼得小聲說。"))

    n = find(out, "Peter heard a noise")
    if not out[n].en.startswith("Scritch"):
        out[n].en = "Scritch, scratch! Peter heard a noise."
        if out[n].zh in ("彼得聽到一個聲音。", ""):
            out[n].zh = "颳擦、颳擦！彼得聽到一個聲音。"

    t = find(out, "Then Peter saw something else")
    if not any(c.en == "Scritch, scratch!" and c is not out[n] for c in out):
        out.insert(
            t,
            Cue("Scritch, scratch!", out[t].start - 2.0, out[t].start - 0.2, "颳擦、颳擦！", out[t].chapter),
        )

    g = find(out, "A cat!")
    if "Oh, a cat" in out[g].en:
        out[g].en = 'Suddenly, Peter gasped. "A cat!"'
        out[g].zh = "突然間，彼得倒抽一口氣。「一隻貓！」"

    fix_timing_overlaps(out)
    return out


def fix_boot(cues: list[Cue]) -> list[Cue]:
    out = list(cues)

    # Split merged Peter/Benjamin exchange
    o = find(out, "Oh no!")
    if "We must find Mrs. Tiggy-Winkle" in out[o].en and "Benjamin said" in out[o].en:
        c = out[o]
        out[o : o + 1] = split_cue(
            c,
            '"Oh no!" Peter said.',
            '"We must find Mrs. Tiggy-Winkle," Benjamin said.',
            "「噢不！」彼得說。",
            "「我們一定要找到提吉溫可爾太太。」班傑明說。",
            0.35,
        )

    w = find(out, "We need that boot")
    if "Can we have it" in out[w].en and "Benjamin asked" in out[w].en:
        c = out[w]
        out[w : w + 1] = split_cue(
            c,
            '"We need that boot," Peter said.',
            '"Can we have it?" Benjamin asked.',
            "「我們需要那隻靴子。」彼得說。",
            "「我們可以拿走它嗎？」班傑明問。",
            0.45,
        )

    # Split Tom's long reply
    t = find(out, "Oh, okay")
    if "Will you give me some candy" in out[t].en:
        c = out[t]
        mid = c.start + (c.end - c.start) * 0.55
        out[t : t + 1] = [
            Cue('"Oh, okay," Tom said. "I will give you the boot."', c.start, mid, "「噢，好吧。」湯姆說。「我把靴子給你們。」", c.chapter),
            Cue('"Will you give me some candy?"', mid, c.end, "「你們能給我一些糖果嗎？」", c.chapter),
        ]

    fix_timing_overlaps(out)
    return out


def audit(story_key: str, cues: list[Cue], check_zh: bool = False) -> list[str]:
    issues: list[str] = []
    all_en = {c.en for c in cues}
    for req in REQUIRED_LINES.get(story_key, []):
        if req not in all_en:
            issues.append(f"MISSING: {req}")
    for i, c in enumerate(cues):
        if i and c.start < cues[i - 1].end - 0.01:
            issues.append(f"OVERLAP #{i+1}: {c.en[:50]} starts before prev ends")
        if re.match(r'^"[^"]+"\s+"[^"]+"', c.en) and not re.search(
            r"\b(said|cried|asked|shouted|yelled|whispered|called|muttered)\b", c.en
        ):
            if "Yikes" not in c.en:
                issues.append(f"MERGED quotes: {c.en[:72]}")
    if check_zh:
        for c in cues:
            if not c.zh:
                issues.append(f"MISSING zh: {c.en[:40]}")
            elif c.zh != normalize_zh(c.zh):
                issues.append(f"NON-TRAD zh: {c.zh[:40]}")
    return issues


FIXERS = {
    "harvest-feast": fix_harvest_feast,
    "full-story": fix_full_story,
    "boot": fix_boot,
}


def apply_story(story_key: str) -> None:
    meta = STORIES[story_key]
    html_sents = parse_html_sentences(meta["html"])
    cues = parse_srt(meta["srt"])
    merge_html_into_cues(cues, html_sents)

    before = audit(story_key, cues, check_zh=True)
    cues = FIXERS[story_key](cues)

    # Normalize all zh to traditional
    for c in cues:
        if c.zh:
            c.zh = normalize_zh(c.zh)
        elif c.en:
            # leave empty for manual fill — should not happen after merge
            pass

    after = audit(story_key, cues, check_zh=True)
    sentences = [
        {
            "id": f"s{i}",
            "chapter": c.chapter,
            "en": c.en,
            "zh": c.zh,
            "start": round(c.start, 2),
            "end": round(c.end, 2),
        }
        for i, c in enumerate(cues, 1)
    ]

    meta["srt"].write_text(sentences_to_srt(sentences) + "\n", encoding="utf-8")
    patch_html_sentences(meta["html"], sentences)

    print(f"=== {story_key} ===")
    print(f"  cues: {len(html_sents)} -> {len(cues)}")
    if before:
        print("  before:", *before[:8], sep="\n    ")
        if len(before) > 8:
            print(f"    ... +{len(before)-8} more")
    print("  after:", "OK" if not after else "\n    ".join(after[:8]))


def main() -> int:
    ap = argparse.ArgumentParser(description="Audit/repair Little Fox lesson subtitles")
    ap.add_argument("story", nargs="?", choices=[*STORIES, "all"], default="all")
    ap.add_argument("--audit-only", action="store_true")
    args = ap.parse_args()
    keys = list(STORIES) if args.story == "all" else [args.story]
    if args.audit_only:
        for key in keys:
            cues = parse_srt(STORIES[key]["srt"])
            html_sents = parse_html_sentences(STORIES[key]["html"])
            merge_html_into_cues(cues, html_sents)
            issues = audit(key, cues, check_zh=True)
            print(f"=== {key} ({len(cues)} cues) ===")
            print("  OK" if not issues else "\n".join(f"  {x}" for x in issues[:20]))
            if len(issues) > 20:
                print(f"  ... +{len(issues)-20} more")
        return 0
    for key in keys:
        apply_story(key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
