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
        # https://www.littlefox.com/hk/supplement/org/C0007885 … C0007888
    },
    "full-story": {
        "srt": ROOT / "eng/sub/2026-06-29-The-Tale-of-Peter-Rabbit-Full-Story.srt",
        "html": ROOT / "eng/2026-06-29-The-Tale-of-Peter-Rabbit-Full-Story.html",
        # https://www.littlefox.com/hk/supplement/org/C0007023 … C0007026
    },
    "boot": {
        "srt": ROOT / "eng/sub/2026-06-30-Peter-Rabbit-Benjamin-Adventure-with-a-Boot.srt",
        "html": ROOT / "eng/2026-06-30-Peter-Rabbit-Benjamin-Adventure-with-a-Boot.html",
        # https://www.littlefox.com/hk/supplement/org/C0008124 … C0008127
    },
}

REQUIRED_LINES = {
    "harvest-feast": [
        "Silvertail bent deeper.",
        '"Where are they?"',
        '"Right there."',
        '"We must stop him."',
        '"You trapped me in the tree!"',
        '"And where are all my nuts?"',
    ],
    "full-story": [
        '"Ahh!" cried Peter.',
        '"Help!" cried Peter.',
        '"I\'m stuck in this net!"',
        '"Brr!" said Peter.',
        '"Whew!" whispered Peter.',
        "Scritch, scratch!",
        '"These vegetables are delicious!" said Peter.',
        '"I\'ll eat some more."',
        '"Your father went there."',
        '"And he never came home."',
    ],
    "boot": [
        '"Oh no!" Peter said.',
        '"We must find Mrs. Tiggy-Winkle," Benjamin said.',
        '"My house is gone!" she cried.',
        '"It is an old brown boot."',
        '"Let\'s take it to the shopkeeper," Peter said.',
        '"Then he will give us candy!"',
        '"Yes!" the mouse cried.',
        '"What will I do?"',
        '"Did someone put feathers in my boot?"',
        '"Yes," Peter said.',
        '"Jemima put feathers in your boot."',
        '"Bye!" Tom said.',
        "She held up an old hat.",
        "The bunnies grabbed the boot.",
        "They pulled hard.",
        "But it was still stuck!",
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


def split_if_merged(out: list[Cue], needle: str, b_en: str, a_en: str | None, a_zh: str, b_zh: str, ratio: float = 0.45) -> bool:
    """Split one cue into two when both parts appear in the same cue."""
    try:
        i = find(out, needle)
    except ValueError:
        return False
    if b_en not in out[i].en:
        return False
    c = out[i]
    first = a_en if a_en else c.en[: c.en.index(b_en)].strip()
    out[i : i + 1] = split_cue(c, first, b_en, a_zh, b_zh, ratio)
    return True


def cap_chapter_last_outro(cues: list[Cue]) -> int:
    """Trim chapter-final cues whose end times absorb inter-episode outros."""
    fixes = 0
    for i, c in enumerate(cues):
        nxt = cues[i + 1] if i + 1 < len(cues) else None
        if not nxt or nxt.chapter == c.chapter:
            continue
        gap = nxt.start - c.end
        dur = c.end - c.start
        if gap < 5 or dur < 9:
            continue
        words = len(re.findall(r"\b[\w']+\b", c.en))
        est_end = c.start + max(4.0, words * 0.42 + 1.0)
        new_end = min(c.end, est_end, nxt.start - 0.35)
        if new_end < c.end - 0.4:
            c.end = round(new_end, 2)
            fixes += 1
    return fixes


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
    fix_harvest_official_wording(out)
    cap_chapter_last_outro(out)

    # Silvertail: two shouts in supplement
    t = find(out, "You trapped me in the tree")
    if "where are all my nuts" in out[t].en.lower() and "And where" in out[t].en:
        c = out[t]
        out[t : t + 1] = split_cue(
            c,
            '"You trapped me in the tree!"',
            '"And where are all my nuts?"',
            "「你們把我困在樹裡！」",
            "「我的堅果到底都到哪去了？」",
            0.45,
        )

    fix_timing_overlaps(out)
    cap_chapter_last_outro(out)

    nuts_offer = find(out, "We found lots of nuts")
    if "Would you like some" in out[nuts_offer].en:
        c = out[nuts_offer]
        out[nuts_offer : nuts_offer + 1] = split_cue(
            c,
            '"We found lots of nuts.',
            'Would you like some?"',
            "「我們找到很多堅果。",
            "你要一些嗎？」",
            0.48,
        )

    fix_timing_overlaps(out)
    return out


def fix_harvest_official_wording(cues: list[Cue]) -> None:
    """Align wording with Little Fox C0007885–7888 supplements."""
    for c in cues:
        if c.en == '"Hmph!" Timmy was mad.':
            c.en = '"Hmph!" Timmy looked mad.'


def fix_full_story(cues: list[Cue]) -> list[Cue]:
    out = list(cues)

    j = find(out, "Look over there")
    if "blackberry bush" in out[j].en:
        out[j : j + 1] = split_cue(
            out[j],
            '"Look over there!" said Mopsy.',
            '"I see a blackberry bush!"',
            "「看那边！」莫普西说。",
            "「我看到一叢黑莓！」",
            0.45,
        )

    k = find(out, "The farmer!")
    if out[k].en == "Peter gasped. The farmer!":
        out[k].en = 'Peter gasped. "The farmer!"'

    if not any(c.en == '"Ahh!" he cried.' or c.en == '"Ahh!" cried Peter.' for c in out):
        b = find(out, "big buttons")
        insert_after(out, b, Cue('"Ahh!" cried Peter.', out[b].end + 0.2, out[b].end + 1.8, "「啊！」彼得大叫。"))

    for c in out:
        if c.en == '"Ahh!" he cried.':
            c.en = '"Ahh!" cried Peter.'
            if c.zh in ("「啊！」他大叫。", ""):
                c.zh = "「啊！」彼得大叫。"
        if "Cottontail" in c.en:
            c.en = c.en.replace("Cottontail", "Cotton-tail")
        if c.en == '"Look over there," said Mopsy.':
            c.en = '"Look over there!" said Mopsy.'
        if c.en == '"I see green leaves everywhere," said Peter.':
            c.en = '"I see green leaves everywhere!" said Peter.'
        if c.en.startswith('"These vegetables are delicious,"'):
            c.en = c.en.replace(
                '"These vegetables are delicious,"',
                '"These vegetables are delicious!"',
                1,
            )

    m = find(out, '"Help!')
    if "I'm stuck in this net" in out[m].en and "cried Peter" in out[m].en:
        c = out[m]
        out[m : m + 1] = split_cue(
            c,
            '"Help!" cried Peter.',
            '"I\'m stuck in this net!"',
            "「救命！」彼得大喊。",
            "「我被困在這張網子裡了！」",
            0.35,
        )

    for c in out:
        if c.en == '"Help!" he cried.':
            c.en = '"Help!" cried Peter.'
            if c.zh in ("「救命！」他大喊。", ""):
                c.zh = "「救命！」彼得大喊。"

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

    bird = find(out, "Don't give up")
    if "Keep trying" in out[bird].en and "get free" not in out[bird].en:
        c = out[bird]
        out[bird : bird + 1] = split_cue(
            c,
            '"Don\'t give up!" called one bird.',
            '"Keep trying to get free!"',
            "「不要放棄！」一隻鳥喊道。",
            "「繼續設法脫身！」",
            0.45,
        )

    veg = find(out, "These vegetables are delicious")
    if "I'll eat some more" in out[veg].en:
        c = out[veg]
        out[veg : veg + 1] = split_cue(
            c,
            '"These vegetables are delicious!" said Peter.',
            '"I\'ll eat some more."',
            "「這些蔬菜真好吃。」彼得說。",
            "「我要再多吃一點。」",
            0.55,
        )

    dad = find(out, "Your father went there")
    if "never came home" in out[dad].en and "And he" not in out[dad].en:
        c = out[dad]
        out[dad : dad + 1] = split_cue(
            c,
            '"Your father went there."',
            '"And he never came home."',
            "「你們的爸爸去了那裡。」",
            "「就再也沒有回家。」",
            0.45,
        )

    fix_timing_overlaps(out)
    cap_chapter_last_outro(out)
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

    for c in out:
        if c.en == '"Did someone put feathers on my boot?"':
            c.en = '"Did someone put feathers in my boot?"'
            if "靴子上" in c.zh:
                c.zh = c.zh.replace("靴子上", "靴子裡")
        if c.en == '"Yes," Peter said. "Jemima put feathers on your boot."':
            c.en = '"Yes," Peter said. "Jemima put feathers in your boot."'
            c.zh = "「有。」彼得說。「潔咪瑪在你的靴子裡放了羽毛。」"
        if c.en == '"Bye, Tom!" the bunnies said.':
            c.en = '"Bye!" Tom said.'
            c.zh = "「再見！」湯姆說。"

    # Little Fox Ep.1: mouse cry is two beats (video hard subs match)
    m = find(out, "My house is gone")
    if "old brown boot" in out[m].en:
        c = out[m]
        out[m : m + 1] = [
            Cue('"My house is gone!" she cried.', c.start, round(c.start + 5.3, 2), "「我的家不見了！」她哭著說。", c.chapter),
            Cue('"It is an old brown boot."', round(c.start + 5.35, 2), 138.8, "「那是一隻舊的棕色靴子。」", c.chapter),
        ]

    shop = find(out, "Let's take it to the shopkeeper")
    if "Then he will give us candy" in out[shop].en:
        c = out[shop]
        out[shop : shop + 1] = split_cue(
            c,
            '"Let\'s take it to the shopkeeper," Peter said.',
            '"Then he will give us candy!"',
            "「我們把它拿給店主吧。」彼得說。",
            "「這樣他就會給我們糖果！」",
            0.45,
        )

    sk = find(out, "shopkeeper looked at the boot again")
    if "I will take it" in out[sk].en:
        c = out[sk]
        mid = c.start + (c.end - c.start) * 0.28
        out[sk : sk + 1] = [
            Cue("The shopkeeper looked at the boot again.", c.start, mid, "店主又看了看靴子。", c.chapter),
            Cue('"Okay," he said. "I will take it."', mid, c.end, "「好吧。」他說。「我收了。」", c.chapter),
        ]

    sorry = find(out, "shopkeeper shook his head")
    if "Mrs. Tiggy-Winkle just bought it" in out[sorry].en:
        c = out[sorry]
        mid = c.start + (c.end - c.start) * 0.32
        out[sorry : sorry + 1] = [
            Cue('The shopkeeper shook his head. "Sorry," he said.', c.start, mid, "店主搖搖頭。「抱歉。」他說。", c.chapter),
            Cue('"Mrs. Tiggy-Winkle just bought it."', mid, c.end, "「提吉溫可爾太太剛買走了。」", c.chapter),
        ]

    yesm = find(out, '"Yes!" the mouse cried')
    if "What will I do" in out[yesm].en:
        c = out[yesm]
        out[yesm : yesm + 1] = split_cue(
            c,
            '"Yes!" the mouse cried.',
            '"What will I do?"',
            "「對！」老鼠哭著說。",
            "「我該怎麼辦？」",
            0.4,
        )

    hat = find(out, "She held up an old hat")
    if "Jemima gave me this hat" in out[hat].en:
        c = out[hat]
        out[hat : hat + 1] = split_cue(
            c,
            "She held up an old hat.",
            '"Jemima gave me this hat. I gave her the boot."',
            "她舉起一頂舊帽子。",
            "「潔咪瑪給了我這頂帽子。我把靴子給了她。」",
            0.22,
        )

    grab = find(out, "The bunnies grabbed the boot")
    if "pulled hard" in out[grab].en and "still stuck" in out[grab].en:
        c = out[grab]
        t1 = c.start + (c.end - c.start) * 0.32
        t2 = c.start + (c.end - c.start) * 0.62
        out[grab : grab + 1] = [
            Cue("The bunnies grabbed the boot.", c.start, t1, "小兔子們抓住靴子。", c.chapter),
            Cue("They pulled hard.", round(t1 + 0.05, 2), t2, "牠們用力拉。", c.chapter),
            Cue("But it was still stuck!", round(t2 + 0.05, 2), round(c.start + 11.0, 2), "但靴子還是卡住了。", c.chapter),
        ]

    thanks = find(out, "Thank you for finding my house")
    if "I found something for you too" in out[thanks].en:
        c = out[thanks]
        out[thanks : thanks + 1] = split_cue(
            c,
            '"Thank you for finding my house," the mouse said.',
            '"I found something for you too."',
            "「謝謝你們幫我找到家。」老鼠說。",
            "「我也幫你們找到了東西。」",
            0.5,
        )

    no_p = find(out, '"No," Peter said')
    if "Do you?" in out[no_p].en:
        c = out[no_p]
        out[no_p : no_p + 1] = split_cue(
            c,
            '"No," Peter said.',
            '"Do you?"',
            "「沒有。」彼得說。",
            "「你有嗎？」",
            0.45,
        )

    jcall = find(out, '"Jemima!" Benjamin called')
    if "We are looking for an old boot" in out[jcall].en:
        c = out[jcall]
        out[jcall : jcall + 1] = split_cue(
            c,
            '"Jemima!" Benjamin called.',
            '"We are looking for an old boot."',
            "「潔咪瑪！」班傑明喊道。",
            "「我們在找一隻舊靴子。」",
            0.35,
        )

    joh = find(out, '"Oh," Jemima said')
    if "wanted to make a nest" in out[joh].en:
        c = out[joh]
        out[joh : joh + 1] = split_cue(
            c,
            '"Oh," Jemima said.',
            '"I wanted to make a nest in that boot, but it was too small for my eggs."',
            "「噢。」潔咪瑪說。",
            "「我想在那隻靴子裡做個巢，但對我的蛋來說太小了。」",
            0.2,
        )

    gpb = find(out, '"Great!" Peter said')
    if "Can we have the boot" in out[gpb].en:
        c = out[gpb]
        out[gpb : gpb + 1] = split_cue(
            c,
            '"Great!" Peter said.',
            '"Can we have the boot?"',
            "「太好了！」彼得說。",
            "「我們可以拿走靴子嗎？」",
            0.4,
        )

    nj = find(out, '"No," Jemima said')
    if "gave the boot to Tom Kitten" in out[nj].en:
        c = out[nj]
        out[nj : nj + 1] = split_cue(
            c,
            '"No," Jemima said.',
            '"I gave the boot to Tom Kitten. He gave me hay."',
            "「不行。」潔咪瑪說。",
            "「我把靴子給了湯姆小貓。他給了我乾草。」",
            0.25,
        )

    tom_boot = find(out, "Oh, okay")
    if "I will give you the boot" in out[tom_boot].en and "Will you give me" not in out[tom_boot].en:
        c = out[tom_boot]
        out[tom_boot : tom_boot + 1] = split_cue(
            c,
            '"Oh, okay," Tom said.',
            '"I will give you the boot."',
            "「噢，好吧。」湯姆說。",
            "「我把靴子給你們。」",
            0.45,
        )

    boot_gasp = find(out, "Suddenly she stopped")
    if "My boot!" in out[boot_gasp].en and "gasped" in out[boot_gasp].en:
        c = out[boot_gasp]
        t1 = c.start + (c.end - c.start) * 0.35
        t2 = c.start + (c.end - c.start) * 0.55
        out[boot_gasp : boot_gasp + 1] = [
            Cue("Suddenly she stopped.", c.start, t1, "她突然停了下來。", c.chapter),
            Cue('"My boot!"', round(t1 + 0.05, 2), t2, "「我的靴子！」", c.chapter),
            Cue("The mouse gasped.", round(t2 + 0.05, 2), c.end, "老鼠倒吸一口氣。", c.chapter),
        ]

    yb = find(out, "Mrs. Tiggy-Winkle painted a picture on your boot")
    if '"Yes," Benjamin said.' in out[yb].en and "Mrs. Tiggy-Winkle painted" in out[yb].en:
        c = out[yb]
        out[yb : yb + 1] = split_cue(
            c,
            '"Yes," Benjamin said.',
            '"Mrs. Tiggy-Winkle painted a picture on your boot."',
            "「有。」班傑明說。",
            "「提吉溫可爾太太在你的靴子上畫了圖。」",
            0.35,
        )

    yp = find(out, "Jemima put feathers in your boot")
    if '"Yes," Peter said.' in out[yp].en and "Jemima put feathers" in out[yp].en:
        c = out[yp]
        out[yp : yp + 1] = split_cue(
            c,
            '"Yes," Peter said.',
            '"Jemima put feathers in your boot."',
            "「有。」彼得說。",
            "「潔咪瑪在你的靴子裡放了羽毛。」",
            0.35,
        )

    ybs = find(out, '"Yes," Benjamin said sadly')
    if "can't get it out" in out[ybs].en:
        c = out[ybs]
        out[ybs : ybs + 1] = split_cue(
            c,
            '"Yes," Benjamin said sadly.',
            '"And we can\'t get it out."',
            "「有。」班傑明難過地說。",
            "「而且我們拔不出來。」",
            0.4,
        )

    fix_timing_overlaps(out)
    cap_chapter_last_outro(out)
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


TWO_BEAT_RE = re.compile(
    r'"[^"]+"\s+(?:\w+\s+){0,4}(?:said|cried|asked|shouted|yelled|whispered|called|muttered|gasped)[,.]?\s+"[^"]+"',
    re.I,
)


def deep_audit(story_key: str, cues: list[Cue]) -> list[str]:
    """Heuristic scan for cues that may truncate like the mouse/boot merge bug."""
    issues: list[str] = []
    for i, c in enumerate(cues):
        dur = c.end - c.start
        if TWO_BEAT_RE.search(c.en):
            issues.append(f"TWO_BEAT #{i+1} ({dur:.1f}s): {c.en[:75]}")
        if dur > 11:
            issues.append(f"LONG #{i+1} ({dur:.1f}s): {c.en[:75]}")
        nxt = cues[i + 1] if i + 1 < len(cues) else None
        if nxt and nxt.chapter != c.chapter:
            gap = nxt.start - c.end
            if dur > 9 and gap > 8:
                issues.append(
                    f"CHAPTER_END #{i+1} ch{c.chapter} dur={dur:.1f}s gap={gap:.1f}s: {c.en[:60]}"
                )
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
    deep = deep_audit(story_key, cues)
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
    if deep:
        print("  deep warnings:", *deep[:6], sep="\n    ")
        if len(deep) > 6:
            print(f"    ... +{len(deep)-6} more")
    else:
        print("  deep: OK")


def main() -> int:
    ap = argparse.ArgumentParser(description="Audit/repair Little Fox lesson subtitles")
    ap.add_argument("story", nargs="?", choices=[*STORIES, "all"], default="all")
    ap.add_argument("--audit-only", action="store_true")
    ap.add_argument("--deep", action="store_true", help="Also run TWO_BEAT / chapter-end heuristics")
    args = ap.parse_args()
    keys = list(STORIES) if args.story == "all" else [args.story]
    if args.audit_only:
        for key in keys:
            cues = parse_srt(STORIES[key]["srt"])
            html_sents = parse_html_sentences(STORIES[key]["html"])
            merge_html_into_cues(cues, html_sents)
            issues = audit(key, cues, check_zh=True)
            print(f"=== {key} ({len(cues)} cues) ===")
            if issues:
                print("\n".join(f"  {x}" for x in issues[:20]))
                if len(issues) > 20:
                    print(f"  ... +{len(issues)-20} more")
            else:
                print("  OK")
            if args.deep:
                deep = deep_audit(key, cues)
                if deep:
                    print("  -- deep --")
                    print("\n".join(f"  {x}" for x in deep[:25]))
                    if len(deep) > 25:
                        print(f"  ... +{len(deep)-25} more")
                else:
                    print("  -- deep: OK")
        return 0
    for key in keys:
        apply_story(key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
