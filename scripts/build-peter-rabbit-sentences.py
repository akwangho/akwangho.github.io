#!/usr/bin/env python3
"""Post-process Whisper SRT and build DEFAULT_SENTENCES for the lesson HTML."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRT_PATH = ROOT / "eng/sub/2026-06-27-Peter-Rabbit-and-Benjamin's-Harvest-Feast-The-Great-Nut-Myste.srt"
JSON_PATH = ROOT / "scripts/.cache/ueIkpeMWPYQ.json"

# Curated teaching sentences mapped to JSON segment indices (0-based, inclusive ranges)
SENTENCE_MAP = [
    # chapter 0
    {"chapter": 0, "en": "Little Fox.", "zh": "小狐狸頻道。", "start": 0.37, "end": 3.32 },
    {
        "chapter": 0,
        "en": "Peter and Benjamin Have a Feast, Episode One: Gathering Nuts.",
        "zh": "彼得兔和班傑明的盛宴，第一集：採集堅果。",
        "segments": [0, 1],
    },
    {
        "chapter": 0,
        "en": "Peter and Benjamin were planning a harvest feast.",
        "zh": "彼得和班傑明正在計劃一場豐收盛宴。",
        "segments": [2],
    },
    {
        "chapter": 0,
        "en": '"We need berries," Peter said.',
        "zh": "「我們需要莓果。」彼得說。",
        "segments": [3],
    },
    {
        "chapter": 0,
        "en": '"Let\'s gather some nuts too," Benjamin said.',
        "zh": "「我們也採一些堅果吧。」班傑明說。",
        "segments": [4],
    },
    {
        "chapter": 0,
        "en": '"A harvest feast must have nuts."',
        "zh": "「豐收盛宴一定要有堅果。」",
        "segments": [5],
    },
    {
        "chapter": 0,
        "en": "The bunnies gathered some berries.",
        "zh": "兔子們採了一些莓果。",
        "segments": [6],
    },
    {
        "chapter": 0,
        "en": "Then they looked for nuts.",
        "zh": "然後他們去找堅果。",
        "segments": [7],
    },
    {
        "chapter": 0,
        "en": "Peter and Benjamin saw lots of squirrels.",
        "zh": "彼得和班傑明看到很多松鼠。",
        "segments": [8],
    },
    {
        "chapter": 0,
        "en": "The squirrels were gathering nuts for winter.",
        "zh": "松鼠們正在為冬天採集堅果。",
        "segments": [9],
    },
    {
        "chapter": 0,
        "en": "It was hard work.",
        "zh": "那是很辛苦的工作。",
        "segments": [10],
    },
    {
        "chapter": 0,
        "en": "Peter and Benjamin put their nuts in a pile.",
        "zh": "彼得和班傑明把堅果堆成一堆。",
        "segments": [11],
    },
    {
        "chapter": 0,
        "en": '"We have a big pile now," Peter said.',
        "zh": "「我們現在有一大堆了。」彼得說。",
        "start": 91.6,
        "end": 95.32,
    },
    {
        "chapter": 0,
        "en": '"Hey!" shouted a squirrel. It was Timmy Tiptoes.',
        "zh": "「嘿！」一隻松鼠大喊。那是踮腳尖的提米。",
        "start": 95.32,
        "end": 99.54,
    },
    {
        "chapter": 0,
        "en": "Timmy ran toward the bunnies. He pointed at their big pile.",
        "zh": "提米朝兔子們跑過去。他指著他們的一大堆堅果。",
        "segments": [14, 15],
    },
    {
        "chapter": 0,
        "en": '"Are you stealing my nuts?" he asked.',
        "zh": "「你們在偷我的堅果嗎？」他問。",
        "segments": [16],
    },
    {
        "chapter": 0,
        "en": "Timmy looked at Benjamin and Peter.",
        "zh": "提米看著班傑明和彼得。",
        "segments": [17],
    },
    {
        "chapter": 0,
        "en": '"No," Peter said. "We collected these nuts."',
        "zh": "「沒有。」彼得說。「這些堅果是我們採的。」",
        "segments": [18, 19],
    },
    {
        "chapter": 0,
        "en": '"Hmph," Timmy looked mad. "I put my nuts right there."',
        "zh": "「哼。」提米看起來很生氣。「我把我的堅果放在那裡。」",
        "segments": [20, 21],
    },
    {
        "chapter": 0,
        "en": '"Well, these are our nuts," Benjamin said.',
        "zh": "「不，這些是我們的堅果。」班傑明說。",
        "segments": [22],
    },
    {
        "chapter": 0,
        "en": 'Timmy frowned. "Then where are my nuts?"',
        "zh": "提米皺起眉頭。「那我的堅果在哪裡？」",
        "segments": [23, 24],
    },
    {
        "chapter": 0,
        "en": 'Benjamin shrugged. "I don\'t know."',
        "zh": "班傑明聳聳肩。「我不知道。」",
        "segments": [25, 26],
    },
    {
        "chapter": 0,
        "en": '"But we will find out," Peter said.',
        "zh": "「但我們會查出來的。」彼得說。",
        "segments": [27],
    },
    # chapter 1
    {
        "chapter": 1,
        "en": "Peter and Benjamin Have a Feast, Episode Two: The Nut Thief.",
        "zh": "彼得兔和班傑明的盛宴，第二集：偷堅果的小偷。",
        "segments": [28, 29],
    },
    {
        "chapter": 1,
        "en": "Peter and Benjamin looked for the missing nuts.",
        "zh": "彼得和班傑明尋找不見的堅果。",
        "segments": [30],
    },
    {
        "chapter": 1,
        "en": "Timmy gathered new ones.",
        "zh": "提米採集了新的堅果。",
        "segments": [31],
    },
    {
        "chapter": 1,
        "en": '"The squirrels are very busy," Peter said. "They are gathering lots of nuts."',
        "zh": "「松鼠們很忙。」彼得說。「他們在採集很多堅果。」",
        "segments": [32, 33],
    },
    {
        "chapter": 1,
        "en": '"Winter is coming," Benjamin said. "They need lots of nuts."',
        "zh": "「冬天要來了。」班傑明說。「他們需要很多堅果。」",
        "segments": [34, 35],
        "end_offset": -1.8,
    },
    {
        "chapter": 1,
        "en": '"Hey!" a squirrel suddenly shouted. "Look at my pile!"',
        "zh": "「嘿！」一隻松鼠突然大喊。「看看我那堆！」",
        "segments": [36, 37],
        "start_offset": -1.8,
    },
    {
        "chapter": 1,
        "en": 'A second squirrel cried, "Who stole my nuts?" A third squirrel yelled.',
        "zh": "第二隻松鼠喊：「誰偷了我的堅果？」第三隻松鼠也大叫。",
        "segments": [38, 39],
    },
    {
        "chapter": 1,
        "en": "More squirrels came running.",
        "zh": "更多松鼠跑了過來。",
        "segments": [40],
    },
    {
        "chapter": 1,
        "en": 'One squirrel shouted at Timmy Tiptoes. "Did you steal our nuts?" she cried.',
        "zh": "一隻松鼠對著踮腳尖的提米大喊：「你偷了我們的堅果嗎？」她喊著。",
        "segments": [41, 42],
    },
    {
        "chapter": 1,
        "en": '"No," Timmy said. "Someone took some of my nuts too."',
        "zh": "「沒有。」提米說。「也有人偷了我的一些堅果。」",
        "segments": [43, 44],
    },
    {
        "chapter": 1,
        "en": '"There is a nut thief!" the squirrels shouted back and forth.',
        "zh": "「有一個堅果小偷！」松鼠們你一言我一語地大喊。",
        "segments": [45, 46],
    },
    {
        "chapter": 1,
        "en": 'Just then, Peter spotted a fat squirrel. "Look, Benjamin," Peter whispered. "It\'s Silvertail."',
        "zh": "就在這時，彼得發現了一隻胖松鼠。「看，班傑明。」彼得小聲說。「是銀尾巴！」",
        "segments": [47, 48, 49],
    },
    {
        "chapter": 1,
        "en": "Silvertail slipped over to the nut piles.",
        "zh": "銀尾巴溜到堅果堆旁。",
        "segments": [50],
    },
    {
        "chapter": 1,
        "en": "The squirrels were still fighting. They did not see Silvertail. He took nuts from a pile.",
        "zh": "松鼠們還在吵架。他們沒看到銀尾巴。他從一堆裡拿走了堅果。",
        "segments": [51, 52, 53],
    },
    {
        "chapter": 1,
        "en": "Silvertail hid the nuts under a log.",
        "zh": "銀尾巴把堅果藏在一根木頭下面。",
        "segments": [54],
    },
    {
        "chapter": 1,
        "en": 'Then he laughed. "I have lots of nuts for winter. I don\'t have to work at all!"',
        "zh": "然後他笑了。「我有很多過冬的堅果。我根本不用工作！」",
        "segments": [55, 57, 58],
    },
    # chapter 2
    {
        "chapter": 2,
        "en": "Peter and Benjamin Have a Feast, Episode Three: Silvertail.",
        "zh": "彼得兔和班傑明的盛宴，第三集：銀尾巴。",
        "segments": [60, 61],
    },
    {
        "chapter": 2,
        "en": 'Peter looked at Benjamin. "Silvertail is the nut thief."',
        "zh": "彼得看著班傑明。「銀尾巴就是偷堅果的小偷。」",
        "segments": [62, 63],
    },
    {
        "chapter": 2,
        "en": 'The bunnies ran to the squirrels. "We found the nut thief," Peter said.',
        "zh": "兔子們跑向松鼠們。「我們找到偷堅果的小偷了。」彼得說。",
        "segments": [64, 65],
    },
    {
        "chapter": 2,
        "en": '"Go away," a squirrel said. "This is not bunny business."',
        "zh": "「走開。」一隻松鼠說。「這不關兔子的事。」",
        "segments": [66, 67],
    },
    {
        "chapter": 2,
        "en": 'Another yelled, "It is squirrel business."',
        "zh": "另一隻大喊：「這是松鼠的事。」",
        "segments": [68],
    },
    {
        "chapter": 2,
        "en": 'Timmy looked at the bunnies. "Who is the nut thief?" he asked.',
        "zh": "提米看著兔子們。「誰是偷堅果的小偷？」他問。",
        "segments": [69, 70],
    },
    {
        "chapter": 2,
        "en": '"Come with us," Benjamin said. "We will show you." Timmy followed the bunnies.',
        "zh": "「跟我們來。」班傑明說。「我們帶你看。」提米跟著兔子們。",
        "segments": [71, 72, 73],
    },
    {
        "chapter": 2,
        "en": "They showed him Silvertail's hiding spot. Timmy's eyes got big.",
        "zh": "他們帶他去看銀尾巴的藏匿處。提米的眼睛瞪得大大的。",
        "start": 398.14,
        "end": 408.02,
    },
    {
        "chapter": 2,
        "en": '"Wow," he said. "Silvertail is stealing our nuts. We must stop him."',
        "zh": "「哇。」他說。「銀尾巴在偷我們的堅果。我們必須阻止他。」",
        "start": 408.02,
        "end": 415.24,
    },
    {
        "chapter": 2,
        "en": 'Benjamin saw a hollow tree. It had a hole in its trunk. "Hmm," Benjamin said. "I have an idea."',
        "zh": "班傑明看到一棵空心的樹。樹幹上有一個洞。「嗯。」班傑明說。「我有一個主意。」",
        "segments": [78, 79, 80, 81],
    },
    {
        "chapter": 2,
        "en": "The bunnies got some nuts.",
        "zh": "兔子們拿了一些堅果。",
        "segments": [82],
    },
    {
        "chapter": 2,
        "en": "They hopped to the hollow tree. Then they pushed the nuts into the hole.",
        "zh": "他們跳到那棵空心的樹旁。然後他們把堅果推進洞裡。",
        "segments": [83, 84],
    },
    {
        "chapter": 2,
        "en": '"Now let\'s find Silvertail," Benjamin said.',
        "zh": "「現在我們去找銀尾巴吧。」班傑明說。",
        "segments": [85],
    },
    {
        "chapter": 2,
        "en": 'Silvertail was taking a nap. "Hi, Silvertail!" Peter woke him up.',
        "zh": "銀尾巴正在睡午覺。「嗨，銀尾巴！」彼得把他叫醒。",
        "segments": [86, 87, 88],
    },
    {
        "chapter": 2,
        "en": '"We found lots of nuts. Would you like some?"',
        "zh": "「我們找到很多堅果。你想要一些嗎？」",
        "segments": [89, 90],
    },
    {
        "chapter": 2,
        "en": '"Yes," Silvertail licked his lips. "Where are they?"',
        "zh": "「好啊。」銀尾巴舔了舔嘴唇。「它們在哪裡？」",
        "segments": [91, 92, 93],
    },
    # chapter 3
    {
        "chapter": 3,
        "en": "Peter and Benjamin Have a Feast, Episode 4: The Harvest Feast.",
        "zh": "彼得兔和班傑明的盛宴，第四集：豐收盛宴。",
        "segments": [94, 95],
    },
    {
        "chapter": 3,
        "en": "The bunnies brought Silvertail to the tree.",
        "zh": "兔子們把銀尾巴帶到那棵樹旁。",
        "segments": [96],
    },
    {
        "chapter": 3,
        "en": 'Silvertail looked in the hole. "I don\'t see any nuts."',
        "zh": "銀尾巴往洞裡看。「我沒看到任何堅果。」",
        "segments": [97, 98],
    },
    {
        "chapter": 3,
        "en": 'Silvertail bent deeper. "Where are—" "Yikes!" Silvertail fell into the hole.',
        "zh": "銀尾巴彎得更深。「它們在哪——」「哎呀！」銀尾巴掉進了洞裡。",
        "segments": [99, 100, 101, 102],
    },
    {
        "chapter": 3,
        "en": '"Help!" he cried. "Oh, I\'m stuck!" The bunnies laughed.',
        "zh": "「救命！」他大叫。「噢，我卡住了！」兔子們笑了。",
        "segments": [103, 104, 105],
    },
    {
        "chapter": 3,
        "en": '"The nut thief is trapped," Peter said. "Goodbye, Silvertail," Benjamin said.',
        "zh": "「偷堅果的小偷被困住了。」彼得說。「再見，銀尾巴。」班傑明說。",
        "segments": [106, 107],
    },
    {
        "chapter": 3,
        "en": "The bunnies told the squirrels about Silvertail. The squirrels stopped fighting.",
        "zh": "兔子們把銀尾巴的事告訴了松鼠們。松鼠們停止了吵架。",
        "segments": [108, 109],
    },
    {
        "chapter": 3,
        "en": '"I have a great idea," Timmy said. "Let\'s share our nuts."',
        "zh": "「我有一個好主意。」提米說。「我們來分享堅果吧。」",
        "segments": [110, 111],
    },
    {
        "chapter": 3,
        "en": "The squirrels shared all the nuts. Timmy gave some to the bunnies.",
        "zh": "松鼠們分享了所有的堅果。提米分了一些給兔子們。",
        "segments": [112, 113],
    },
    {
        "chapter": 3,
        "en": '"Thank you for helping us," Timmy said. "We can save these nuts for our feast," Peter said.',
        "zh": "「謝謝你們幫忙我們。」提米說。「我們可以把這些堅果留著辦盛宴。」彼得說。",
        "segments": [114, 115, 116, 117],
    },
    {
        "chapter": 3,
        "en": "At last, it was time for the harvest feast. All the squirrels came.",
        "zh": "終於到了豐收盛宴的時刻。所有的松鼠都來了。",
        "segments": [118, 119],
    },
    {
        "chapter": 3,
        "en": 'Timmy rubbed his belly. "These nut pies are delicious!"',
        "zh": "提米揉了揉肚子。「這些堅果派太好吃了！」",
        "segments": [120],
        "end_offset": 4.0,
    },
    {
        "chapter": 3,
        "en": 'Then someone else appeared. Peter gasped. "Silvertail!"',
        "zh": "然後又出現了一個人。彼得倒抽一口氣。「銀尾巴！」",
        "segments": [122, 123, 124],
    },
    {
        "chapter": 3,
        "en": 'Benjamin laughed. "He\'s not fat anymore." Silvertail frowned at the bunnies.',
        "zh": "班傑明笑了。「他不再胖了。」銀尾巴對兔子們皺眉。",
        "segments": [125, 126, 127],
    },
    {
        "chapter": 3,
        "en": '"You trapped me in the tree! And where... where are all my nuts?"',
        "zh": "「你們把我困在樹裡！還有，我所有的堅果……我所有的堅果都到哪去了？」",
        "segments": [128, 129],
    },
    {
        "chapter": 3,
        "en": 'Peter pointed to the nut pies. "Right there." Everyone but Silvertail laughed.',
        "zh": "彼得指著堅果派。「就在那裡。」除了銀尾巴，大家都笑了。",
        "segments": [130, 131, 132],
    },
]


def load_segments() -> list[dict]:
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    return data["segments"]


def timing_for(entry: dict, segments: list[dict]) -> tuple[float, float]:
    if "start" in entry and "end" in entry:
        return round(entry["start"], 2), round(entry["end"], 2)
    idxs = entry.get("segments") or []
    if not idxs:
        return 0.94, 3.32
    start = segments[idxs[0]]["start"] + entry.get("start_offset", 0)
    end = segments[idxs[-1]]["end"] + entry.get("end_offset", 0)
    if "start" in entry:
        start = entry["start"]
    if "end" in entry:
        end = entry["end"]
    return round(start, 2), round(end, 2)


def format_ts(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_curated_srt(segments: list[dict]) -> str:
    lines: list[str] = []
    for i, entry in enumerate(SENTENCE_MAP, 1):
        start, end = timing_for(entry, segments)
        lines.append(str(i))
        lines.append(f"{format_ts(start)} --> {format_ts(end)}")
        lines.append(entry["en"].replace('"', '"'))
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def js_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def build_js_array(segments: list[dict]) -> str:
    rows = []
    for i, entry in enumerate(SENTENCE_MAP, 1):
        start, end = timing_for(entry, segments)
        rows.append(
            f'    {{ id:\'s{i}\', chapter:{entry["chapter"]}, '
            f'en:"{js_escape(entry["en"])}", zh:"{entry["zh"]}", start:{start}, end:{end} }},'
        )
    return "\n".join(rows)


if __name__ == "__main__":
    segs = load_segments()
    print("=== DEFAULT_SENTENCES ===")
    print(build_js_array(segs))
    SRT_PATH.write_text(build_curated_srt(segs), encoding="utf-8")
    print(f"\nWrote curated SRT: {SRT_PATH}", flush=True)
