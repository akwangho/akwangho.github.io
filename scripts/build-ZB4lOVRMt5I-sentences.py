#!/usr/bin/env python3
"""Smart-merge Whisper segments for Peter Rabbit + Benjamin Bunny full story."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from subtitle_utils import (
    SEGMENT_CHAPTER_BOUNDARIES,
    fallback_bounds,
    join_segment_texts,
    normalize_spoken_line,
    range_bounds,
    remap_sentence_map,
    sentences_to_srt,
    spoken_from_token_sequence,
    spoken_from_word_range,
    token_overlap,
)

JSON_PATH = ROOT / "scripts/.cache/ZB4lOVRMt5I.json"
OUT_PATH = ROOT / "scripts/.cache/ZB4lOVRMt5I-sentences.json"
SRT_PATH = ROOT / "eng/sub/2026-06-27-Peter-Rabbit-Benjamin-Bunny-Full-Story.srt"

# (segment_lo, segment_hi, tokens) for word-exact timing.
WORD_SEQUENCE_OVERRIDES: dict[int, tuple[int, int, list[str]]] = {
    56: (75, 77, ["rabbit", "cried", "the", "farmer"]),
    125: (273, 274, ["you", "are", "in", "big", "trouble", "benjamin", "he", "said"]),
    126: (273, 275, ["later", "that", "day", "the", "farmer", "returned", "from", "town", "what", "happened", "he", "cried"]),
    127: (274, 276, [
        "small", "footprints", "were", "everywhere", "the", "scarecrow's", "clothes", "were",
        "gone", "and", "the", "cat", "was", "locked", "in", "the", "greenhouse",
    ]),
    128: (275, 277, ["mrs.", "rabbit", "was", "upset", "with", "peter", "but", "she", "was", "glad", "to", "see", "him"]),
    129: (276, 277, ["you're", "safe", "peter", "she", "said", "and", "you", "got", "your", "clothes", "back"]),
}

# Fallback time ranges when sequences span ambiguous segment joins.
WORD_TIMING_OVERRIDES: dict[int, tuple[float, float]] = {
    124: (1255.84, 1273.58),
}

CHAPTERS = [
    {"chapter": 0, "label": "彼得兔 第一集：兔媽媽進城", "emoji": "🐰"},
    {"chapter": 1, "label": "彼得兔 第二集：溜進菜園", "emoji": "🥬"},
    {"chapter": 2, "label": "彼得兔 第三集：大追逐", "emoji": "🏃"},
    {"chapter": 3, "label": "彼得兔 第四集：菜園大門", "emoji": "🚪"},
    {"chapter": 4, "label": "班傑明 第一集：農夫進城", "emoji": "🐇"},
    {"chapter": 5, "label": "班傑明 第二集：稻草人", "emoji": "🌾"},
    {"chapter": 6, "label": "班傑明 第三集：菜園散步", "emoji": "🧅"},
    {"chapter": 7, "label": "班傑明 第四集：貓與回家", "emoji": "🐱"},
]

# Curated teaching sentences: segment indices (0-based, inclusive), polished en + zh.
SENTENCE_MAP: list[dict] = [
    # ── ch0: Mrs. Rabbit goes to town ──
    {
        "chapter": 0,
        "en": "The Tale of Peter Rabbit, Episode 1: Mrs. Rabbit Goes into Town.",
        "zh": "彼得兔的故事，第一集：兔媽媽進城。",
        "segments": [0],
    },
    {"chapter": 0, "en": "Mrs. Rabbit had four little bunnies.", "zh": "兔媽媽有四隻小兔子。", "segments": [1]},
    {
        "chapter": 0,
        "en": "Their names were Mopsy, Flopsy, Cottontail, and Peter.",
        "zh": "他們的名字是莫普西、弗洛普西、棉尾巴和彼得。",
        "segments": [2],
    },
    {"chapter": 0, "en": "They lived in a hole under a tree.", "zh": "他們住在一棵樹下的洞裡。", "segments": [3]},
    {
        "chapter": 0,
        "en": 'One day Mrs. Rabbit said, "We need bread." "I\'ll go into town to buy some."',
        "zh": "有一天兔媽媽說：「我們需要麵包。」「我要進城去買一些。」",
        "segments": [4, 5],
    },
    {"chapter": 0, "en": "She grabbed her basket and an umbrella.", "zh": "她拿起籃子和雨傘。", "segments": [6]},
    {"chapter": 0, "en": "Mrs. Rabbit looked at her bunnies.", "zh": "兔媽媽看著她的小兔子們。", "segments": [7]},
    {"chapter": 0, "en": '"I will be back soon," she said.', "zh": "「我很快就回來。」她說。", "segments": [8]},
    {"chapter": 0, "en": '"Can we go outside?" Peter asked.', "zh": "「我們可以出去嗎？」彼得問。", "segments": [9]},
    {
        "chapter": 0,
        "en": '"Yes," said his mother, "but don\'t go into the farmer\'s garden."',
        "zh": "「可以。」媽媽說，「但別進農夫的菜園。」",
        "segments": [10],
    },
    {
        "chapter": 0,
        "en": "Your father went there, and he never came home.",
        "zh": "你爸爸以前去過那裡，再也沒有回來。",
        "segments": [11],
    },
    {"chapter": 0, "en": '"Okay," said the bunnies.', "zh": "「好的。」小兔子們說。", "segments": [12]},
    {"chapter": 0, "en": "Mrs. Rabbit headed off to town.", "zh": "兔媽媽出發進城去了。", "segments": [13]},
    {
        "chapter": 0,
        "en": "The bunnies put on their jackets and shoes. Then they went outside.",
        "zh": "小兔子們穿上外套和鞋子，然後到了外面。",
        "segments": [14, 15],
    },
    {
        "chapter": 0,
        "en": '"Let\'s hop down the path," Mopsy said.',
        "zh": "「我們沿著小路跳吧。」莫普西說。",
        "segments": [16],
    },
    {"chapter": 0, "en": '"I see a blackberry bush."', "zh": "「我看到一棵黑莓叢。」", "segments": [17]},
    {
        "chapter": 0,
        "en": '"Yum," said Flopsy and Cottontail.',
        "zh": "「好吃！」弗洛普西和棉尾巴說。",
        "segments": [18],
    },
    {
        "chapter": 0,
        "en": "Flopsy, Mopsy, and Cottontail ran to the bush.",
        "zh": "弗洛普西、莫普西和棉尾巴跑到叢林旁。",
        "segments": [19],
    },
    {
        "chapter": 0,
        "en": "Peter's sisters started to pick blackberries.",
        "zh": "彼得的姐妹們開始採黑莓。",
        "segments": [20],
    },
    {
        "chapter": 0,
        "en": "I don't want blackberries, Peter thought.",
        "zh": "我才不要黑莓，彼得心想。",
        "segments": [21],
    },
    {
        "chapter": 0,
        "en": "I'm going to the farmer's garden.",
        "zh": "我要去農夫的菜園。",
        "segments": [22],
    },
    # ── ch1: Into the Garden ──
    {
        "chapter": 1,
        "en": "The Tale of Peter Rabbit, Episode 2: Into the Garden.",
        "zh": "彼得兔的故事，第二集：溜進菜園。",
        "segments": [23],
    },
    {"chapter": 1, "en": "Peter hopped through the woods.", "zh": "彼得跳過樹林。", "segments": [24]},
    {"chapter": 1, "en": "A path led to the farmer's gate.", "zh": "一條小路通往農夫的柵欄門。", "segments": [25]},
    {
        "chapter": 1,
        "en": "Peter squeezed under the gate and looked around.",
        "zh": "彼得從門下擠過去，四處張望。",
        "segments": [26],
    },
    {
        "chapter": 1,
        "en": '"Green leaves everywhere," Peter said.',
        "zh": "「到處都是綠葉。」彼得說。",
        "segments": [27],
    },
    {"chapter": 1, "en": "Peter wandered through the garden.", "zh": "彼得在菜園裡閒逛。", "segments": [28]},
    {
        "chapter": 1,
        "en": "He ate some lettuce, green beans, and radishes.",
        "zh": "他吃了一些生菜、四季豆和蘿蔔。",
        "segments": [29, 30, 31],
    },
    {
        "chapter": 1,
        "en": '"These vegetables are delicious," Peter said.',
        "zh": "「這些蔬菜真好吃。」彼得說。",
        "segments": [32],
    },
    {"chapter": 1, "en": '"I\'ll eat some more."', "zh": "「我要再吃一些。」", "segments": [33]},
    {"chapter": 1, "en": "Then he hopped around a corner.", "zh": "然後他跳過轉角。", "segments": [34]},
    {
        "chapter": 1,
        "en": 'Peter gasped. The farmer gasped too. "A rabbit!"',
        "zh": "彼得倒抽一口氣。農夫也倒抽一口氣。「一隻兔子！」",
        "segments": [35, 36, 37],
    },
    {
        "chapter": 1,
        "en": "Peter ran. The farmer grabbed his rake and chased him.",
        "zh": "彼得跑了起來。農夫抓起耙子追他。",
        "segments": [38, 39, 40],
    },
    {
        "chapter": 1,
        "en": '"Stop, thief!" cried the farmer.',
        "zh": "「站住，小偷！」農夫大喊。",
        "segments": [41],
    },
    {"chapter": 1, "en": "He swung his rake at Peter.", "zh": "他揮耙子打向彼得。", "segments": [42]},
    {
        "chapter": 1,
        "en": "Peter ran as fast as he could. His heart beat fast.",
        "zh": "彼得用尽全力奔跑，心怦怦直跳。",
        "segments": [43, 44],
    },
    {
        "chapter": 1,
        "en": "He lost one shoe near the cabbages and his other shoe near the potatoes.",
        "zh": "他在高麗菜旁掉了一隻鞋，在馬鈴薯旁掉了另一隻。",
        "segments": [45, 46],
    },
    {
        "chapter": 1,
        "en": '"Oh no!" cried Peter. He looked around.',
        "zh": "「糟了！」彼得大叫。他四處張望。",
        "segments": [47, 48],
    },
    {"chapter": 1, "en": "Suddenly, he ran into a net.", "zh": "突然，他撞進一張網裡。", "segments": [49]},
    {
        "chapter": 1,
        "en": '"The big buttons on my jacket got caught!" cried Peter.',
        "zh": "「我外套的大扣子卡住了！」彼得大叫。",
        "segments": [50],
    },
    {
        "chapter": 1,
        "en": "He kicked and twisted, but it was no help.",
        "zh": "他踢啊扭啊，但一點用也沒有。",
        "segments": [51],
    },
    {"chapter": 1, "en": '"I\'m stuck!" cried Peter.', "zh": "「我卡住了！」彼得大叫。", "segments": [52]},
    # ── ch2: The Chase ──
    {
        "chapter": 2,
        "en": "The Tale of Peter Rabbit, Episode 3: The Chase.",
        "zh": "彼得兔的故事，第三集：大追逐。",
        "segments": [53],
    },
    {
        "chapter": 2,
        "en": '"I\'m stuck in this net!" cried Peter.',
        "zh": "「我卡在這張網裡了！」彼得大叫。",
        "segments": [54, 55],
    },
    {"chapter": 2, "en": "Some birds flew over to Peter.", "zh": "幾隻鳥飛到彼得身邊。", "segments": [56]},
    {
        "chapter": 2,
        "en": '"They tried to help him," called one bird.',
        "zh": "「他們想幫他。」一隻鳥說。",
        "segments": [57],
    },
    {"chapter": 2, "en": '"Jacket!" shouted another.', "zh": "「外套！」另一隻鳥大喊。", "segments": [58]},
    {
        "chapter": 2,
        "en": "Peter stopped crying. Quickly, he slipped out of his jacket. Now, he was free.",
        "zh": "彼得停止哭泣，很快從外套裡溜了出來。現在他自由了。",
        "segments": [59, 60, 61],
    },
    {
        "chapter": 2,
        "en": "But the farmer was still chasing him. Peter ran away fast.",
        "zh": "但農夫還在追他。彼得飛快逃跑。",
        "segments": [62, 63],
    },
    {
        "chapter": 2,
        "en": '"Get back here!" cried the farmer.',
        "zh": "「給我回來！」農夫大喊。",
        "segments": [64, 65],
    },
    {
        "chapter": 2,
        "en": "Peter dashed into a shed. It was filled with garden tools.",
        "zh": "彼得衝進一間小棚屋，裡面放滿了園藝工具。",
        "segments": [66, 67],
    },
    {
        "chapter": 2,
        "en": "Peter leaped into a watering can. The can was filled with icy water.",
        "zh": "彼得跳進澆水壺裡。壺裡裝滿了冰冷的水。",
        "segments": [68, 70],
    },
    {"chapter": 2, "en": '"Ooh," Peter said.', "zh": "「噢。」彼得說。", "segments": [71]},
    {
        "chapter": 2,
        "en": 'The farmer rushed into the shed. "Where is that rabbit?" he said.',
        "zh": "農夫衝進小棚屋。「那隻兔子在哪？」他說。",
        "segments": [72, 73],
    },
    {
        "chapter": 2,
        "en": "Peter shivered. He heard the farmer moving things around. The man was looking for Peter.",
        "zh": "彼得發抖。他聽見農夫在搬動東西，那個人正在找彼得。",
        "segments": [74, 75, 76],
    },
    {
        "chapter": 2,
        "en": '"Rabbit," the farmer muttered.',
        "zh": "「兔子。」農夫低聲說。",
        "segments": [77],
    },
    {
        "chapter": 2,
        "en": "The farmer's footsteps were close now.",
        "zh": "農夫的腳步聲現在很近了。",
        "segments": [78],
    },
    {"chapter": 2, "en": '"Uh-oh," Peter whispered.', "zh": "「糟了。」彼得小聲說。", "segments": [79]},
    {
        "chapter": 2,
        "en": "He felt a tickle in his nose. The tickle grew worse.",
        "zh": "他覺得鼻子癢癢的，癢意越來越強。",
        "segments": [80, 81],
    },
    {"chapter": 2, "en": "Peter sneezed.", "zh": "彼得打了一個噴嚏。", "segments": [82]},
    {"chapter": 2, "en": '"Aha!" cried the farmer.', "zh": "「啊哈！」農夫大喊。", "segments": [83]},
    # ── ch3: The Garden Gate ──
    {
        "chapter": 3,
        "en": "The Tale of Peter Rabbit, Episode 4: The Garden Gate.",
        "zh": "彼得兔的故事，第四集：菜園大門。",
        "segments": [84, 85],
    },
    {
        "chapter": 3,
        "en": "Peter jumped out of the watering can.",
        "zh": "彼得從澆水壺裡跳了出來。",
        "segments": [86],
    },
    {"chapter": 3, "en": '"Hey!" cried the farmer.', "zh": "「嘿！」農夫大喊。", "segments": [87]},
    {
        "chapter": 3,
        "en": "Peter ran and ran. Finally, the farmer stopped chasing him.",
        "zh": "彼得跑啊跑。終於，農夫不再追他了。",
        "segments": [88, 89],
    },
    {"chapter": 3, "en": "Now, Peter was lost.", "zh": "現在，彼得迷路了。", "segments": [90]},
    {
        "chapter": 3,
        "en": '"Where\'s the gate?" he asked a mouse. But the mouse ran away.',
        "zh": "「門在哪裡？」他問一隻老鼠。但老鼠跑走了。",
        "segments": [91, 92],
    },
    {
        "chapter": 3,
        "en": "Suddenly, Peter gasped. The cat was watching fish in the pond.",
        "zh": "突然，彼得倒抽一口氣。貓咪正在池塘邊看魚。",
        "segments": [93, 94],
    },
    {
        "chapter": 3,
        "en": '"She didn\'t see Peter," Peter whispered. He quietly slipped away.',
        "zh": "「她沒看到彼得。」彼得小聲說。他悄悄溜走了。",
        "segments": [95, 96],
    },
    {"chapter": 3, "en": '"The gate," Peter said.', "zh": "「大門。」彼得說。", "segments": [97]},
    {
        "chapter": 3,
        "en": "Peter heard a noise. He climbed onto a wheelbarrow to see.",
        "zh": "彼得聽到一聲響。他爬上手推車想看清楚。",
        "segments": [98, 99],
    },
    {
        "chapter": 3,
        "en": "The farmer was working in the onion patch. Then Peter saw something else and cried out. Peter shot across the garden.",
        "zh": "農夫正在洋蔥田裡工作。然後彼得看到了別的東西，大叫一聲。彼得飛快穿過菜園。",
        "segments": [100, 102, 103, 104],
    },
    {
        "chapter": 3,
        "en": 'The farmer chased him. "Stop, Rabbit!" But Peter was too fast.',
        "zh": "農夫追著他跑。「站住，兔子！」但彼得跑得太快了。",
        "segments": [105, 106, 107],
    },
    {
        "chapter": 3,
        "en": "He squeezed under the gate and ran home.",
        "zh": "他從門下擠過去，跑回了家。",
        "segments": [108],
    },
    {
        "chapter": 3,
        "en": 'Mrs. Rabbit scolded Peter. "Naughty rabbit. You lost your jacket and shoes."',
        "zh": "兔媽媽責備彼得。「淘氣的兔子。你把外套和鞋子弄丟了。」",
        "segments": [109, 110, 111],
    },
    {
        "chapter": 3,
        "en": "The other bunnies ate bread and blackberries. But Peter didn't get any.",
        "zh": "其他小兔子吃了麵包和黑莓。但彼得什麼也沒分到。",
        "segments": [112, 113],
    },
    {
        "chapter": 3,
        "en": "Peter sneezed. Mrs. Rabbit gave him medicine and sent him to bed.",
        "zh": "彼得打了一個噴嚏。兔媽媽給他吃了藥，叫他上床睡覺。",
        "segments": [114, 115, 116],
    },
    # ── ch4: Benjamin Ep1 ──
    {
        "chapter": 4,
        "en": "The Tale of Benjamin Bunny, Episode 1: The Farmer Goes to Town.",
        "zh": "班傑明兔的故事，第一集：農夫進城。",
        "segments": [117, 118, 119],
    },
    {"chapter": 4, "en": "Benjamin Bunny sat by the road.", "zh": "班傑明兔坐在路邊。", "segments": [120]},
    {
        "chapter": 4,
        "en": "A horse walked along the road. The horse was pulling a wagon.",
        "zh": "一匹馬沿著路走來，拉著一輛馬車。",
        "segments": [122, 123],
    },
    {
        "chapter": 4,
        "en": "Farmer and his wife, Benjamin thought. They are going to town.",
        "zh": "是農夫和他老婆，班傑明心想。他們要進城了。",
        "segments": [124, 125],
    },
    {
        "chapter": 4,
        "en": "Benjamin smiled. I'll find my cousin, Peter.",
        "zh": "班傑明笑了。我要去找我的表弟彼得。",
        "segments": [126, 127],
    },
    {
        "chapter": 4,
        "en": "Benjamin ran to Peter's tree and peeked inside.",
        "zh": "班傑明跑到彼得的樹洞旁，往裡面偷看。",
        "segments": [128, 129],
    },
    {
        "chapter": 4,
        "en": "Mrs. Rabbit was knitting. I don't want to see her, Benjamin thought.",
        "zh": "兔媽媽正在織毛衣。我不想讓她看見，班傑明心想。",
        "segments": [130, 131],
    },
    {
        "chapter": 4,
        "en": "He saw Flopsy, Mopsy, and Cottontail. Peter, Benjamin thought.",
        "zh": "他看到了弗洛普西、莫普西和棉尾巴。彼得，班傑明心想。",
        "segments": [132, 133],
    },
    {
        "chapter": 4,
        "en": "He went to the other side of the tree, crawled down a hole, and there was Peter.",
        "zh": "他繞到樹的另一邊，從洞爬下去，彼得就在那裡。",
        "segments": [134, 135, 136],
    },
    {
        "chapter": 4,
        "en": "He was wearing a red handkerchief. He looked sad.",
        "zh": "他圍著一條紅手帕，看起來好難過。",
        "segments": [137, 138],
    },
    {
        "chapter": 4,
        "en": '"What happened to you?" Benjamin asked.',
        "zh": "「你怎麼了？」班傑明問。",
        "segments": [139],
    },
    {
        "chapter": 4,
        "en": "Peter sniffed. I went to the farmer's garden yesterday, and the farmer chased me.",
        "zh": "彼得吸了吸鼻子。我昨天去了農夫的菜園，農夫追著我跑。",
        "segments": [140, 141, 142, 143],
    },
    {
        "chapter": 4,
        "en": '"News," said Benjamin. "The farmer and his wife went to town. We can look for your clothes."',
        "zh": "「有個消息。」班傑明說。「農夫和他老婆進城去了。我們可以去找你的衣服。」",
        "segments": [144, 145, 146],
    },
    # ── ch5: The Scarecrow ──
    {
        "chapter": 5,
        "en": "The Tale of Benjamin Bunny, Episode 2: The Scarecrow.",
        "zh": "班傑明兔的故事，第二集：稻草人。",
        "segments": [147, 148],
    },
    {
        "chapter": 5,
        "en": "Benjamin and Peter walked through the woods. At last, they saw a stone wall.",
        "zh": "班傑明和彼得穿過樹林。終於，他們看到一堵石牆。",
        "segments": [149, 150],
    },
    {
        "chapter": 5,
        "en": '"Farmer\'s garden," Peter said.',
        "zh": "「農夫的菜園。」彼得說。",
        "segments": [151],
    },
    {
        "chapter": 5,
        "en": "The two rabbits climbed onto the wall. Peter gasped.",
        "zh": "兩隻兔子爬上石牆。彼得倒抽一口氣。",
        "segments": [152, 153],
    },
    {
        "chapter": 5,
        "en": '"Look at that scarecrow. It\'s wearing my jacket and shoes."',
        "zh": "「看那個稻草人。它穿著我的外套和鞋子。」",
        "segments": [154, 155],
    },
    {
        "chapter": 5,
        "en": '"Let\'s get them back," Benjamin said. "I don\'t know," Peter said. "We\'ll be fine," Benjamin said.',
        "zh": "「我們去拿回來吧。」班傑明說。「我不知道。」彼得說。「我們不會有事的。」班傑明說。",
        "segments": [156, 157, 158],
    },
    {
        "chapter": 5,
        "en": "He grabbed a pear tree, slid down into the garden, and Peter followed.",
        "zh": "他抓住梨樹滑進菜園，彼得跟著下去。",
        "segments": [159, 160, 161],
    },
    {
        "chapter": 5,
        "en": "Benjamin and Peter ran to the scarecrow. Peter took his shoes off the scarecrow.",
        "zh": "班傑明和彼得跑到稻草人那裡。彼得從稻草人身上拿下鞋子。",
        "segments": [162, 163],
    },
    {
        "chapter": 5,
        "en": 'Water poured out of them. "I guess it rained last night," Peter said.',
        "zh": "水從鞋子裡倒了出來。「我想昨晚下雨了。」彼得說。",
        "segments": [164, 165],
    },
    {
        "chapter": 5,
        "en": 'Peter took off the handkerchief and put on his jacket. "My jacket shrank in the rain," he said.',
        "zh": "彼得解下手帕，穿上外套。「我的外套被雨淋縮水了。」他說。",
        "segments": [166, 167, 168],
    },
    {
        "chapter": 5,
        "en": "The scarecrow was also wearing a hat. Benjamin tried it on.",
        "zh": "稻草人還戴著一頂帽子。班傑明試戴了一下。",
        "segments": [169, 170],
    },
    {
        "chapter": 5,
        "en": '"It\'s much too big," he said. "That\'s the farmer\'s hat," Peter said. He looked around nervously.',
        "zh": "「太大了。」他說。「那是農夫的帽子。」彼得說。他緊張地四處張望。",
        "segments": [171, 172, 173],
    },
    {
        "chapter": 5,
        "en": '"We should leave now," Peter said. "No," Benjamin said. "I want to get some onions."',
        "zh": "「我們現在該走了。」彼得說。「不要。」班傑明說。「我想摘一些洋蔥。」",
        "segments": [174, 175, 176],
    },
    # ── ch6: A Walk in the Garden ──
    {
        "chapter": 6,
        "en": "The Tale of Benjamin Bunny, Episode 3: A Walk in the Garden.",
        "zh": "班傑明兔的故事，第三集：菜園散步。",
        "segments": [177, 178],
    },
    {
        "chapter": 6,
        "en": 'Benjamin held up Peter\'s handkerchief. "We can carry onions in this," he said.',
        "zh": "班傑明舉起彼得的手帕。「我們可以用這個裝洋蔥。」他說。",
        "segments": [179, 180, 181],
    },
    {
        "chapter": 6,
        "en": "Benjamin went into an onion patch and pulled up an onion.",
        "zh": "班傑明走進洋蔥田，拔起一顆洋蔥。",
        "segments": [182, 183],
    },
    {
        "chapter": 6,
        "en": '"This is a nice one," Benjamin said. He pulled up another onion.',
        "zh": "「這顆真不錯。」班傑明說。他又拔起一顆洋蔥。",
        "segments": [185, 186],
    },
    {
        "chapter": 6,
        "en": "Peter looked around. His nose wiggled.",
        "zh": "彼得四處張望。他的鼻子動了動。",
        "segments": [187, 188],
    },
    {
        "chapter": 6,
        "en": "Benjamin pulled up more onions and rolled them onto the handkerchief.",
        "zh": "班傑明拔了更多洋蔥，把它們滾到手帕上。",
        "segments": [189, 190],
    },
    {
        "chapter": 6,
        "en": '"Let\'s go," Peter said. "This garden isn\'t safe." "It\'s fine," Benjamin said. "I come here all the time with Father."',
        "zh": "「我們走吧。」彼得說。「這個菜園不安全。」「沒問題的。」班傑明說。「我經常跟爸爸一起來這裡。」",
        "segments": [191, 192, 193, 194],
    },
    {
        "chapter": 6,
        "en": 'Benjamin ate a lettuce leaf. "Mmm," he said.',
        "zh": "班傑明吃了一片生菜葉。「嗯。」他說。",
        "segments": [195, 196],
    },
    {
        "chapter": 6,
        "en": "Benjamin walked deeper into the garden. Peter grabbed the handkerchief and ran after his cousin.",
        "zh": "班傑明往菜園深處走去。彼得抓起手帕，追著表弟跑。",
        "segments": [198, 199, 200],
    },
    {
        "chapter": 6,
        "en": '"What\'s that noise?" Peter asked. "Is the farmer coming?"',
        "zh": "「那是什麼聲音？」彼得問。「是農夫來了嗎？」",
        "segments": [201, 202, 203],
    },
    {
        "chapter": 6,
        "en": '"It\'s nothing," Benjamin said. Benjamin kept walking, and Peter followed.',
        "zh": "「沒什麼。」班傑明說。班傑明繼續往前走，彼得跟著。",
        "segments": [204, 205, 206],
    },
    {
        "chapter": 6,
        "en": 'They walked past flower pots and garden tools. Suddenly, Benjamin gasped. "I see a cat!"',
        "zh": "他們走過花盆和園藝工具。突然，班傑明倒抽一口氣。「我看到一隻貓！」",
        "segments": [207, 208, 209],
    },
    {
        "chapter": 6,
        "en": "He and Peter slipped under a basket and waited.",
        "zh": "他和彼得溜到籃子底下等著。",
        "segments": [210, 211],
    },
    {
        "chapter": 6,
        "en": "The cat jumped onto the basket. Then she sat down.",
        "zh": "貓跳上籃子，然後坐了下來。",
        "segments": [214, 215],
    },
    # ── ch7: Cat and Home ──
    {
        "chapter": 7,
        "en": "The Tale of Benjamin Bunny, Episode 4: The Cat and the Basket.",
        "zh": "班傑明兔的故事，第四集：貓與籃子。",
        "segments": [216, 217],
    },
    {
        "chapter": 7,
        "en": 'The cat sat on the basket. "When will she leave?" Benjamin whispered. "Father will be looking for me."',
        "zh": "貓坐在籃子上。「她什麼時候才會走？」班傑明小聲問。「爸爸會來找我的。」",
        "segments": [218, 219, 220],
    },
    {
        "chapter": 7,
        "en": '"These onions smell awful," Peter whispered. Tears filled his eyes.',
        "zh": "「這些洋蔥聞起來好難受。」彼得小聲說。他的眼裡充滿了淚水。",
        "segments": [221, 222, 223],
    },
    {
        "chapter": 7,
        "en": "The cat did not leave. She sat on the basket for five hours.",
        "zh": "貓沒有離開。她在籃子上坐了五個小時。",
        "segments": [224, 225],
    },
    {
        "chapter": 7,
        "en": 'At last, they heard something. "Benjamin?" Someone called.',
        "zh": "終於，他們聽到了動靜。「班傑明？」有人喊著。",
        "segments": [226, 227, 228],
    },
    {
        "chapter": 7,
        "en": '"That\'s Father," Benjamin whispered. The cat looked up at the wall.',
        "zh": "「是爸爸。」班傑明小聲說。貓抬頭看向石牆。",
        "segments": [229, 230],
    },
    {
        "chapter": 7,
        "en": "Suddenly, a large rabbit jumped down. He pushed the cat inside the greenhouse and locked the door.",
        "zh": "突然，一隻大兔子跳了下來。他把貓推進溫室裡，鎖上了門。",
        "segments": [231, 232, 234],
    },
    {
        "chapter": 7,
        "en": '"You are in big trouble, Benjamin," his father said.',
        "zh": "「班傑明，你麻煩大了。」他爸爸說。",
        "segments": [235, 236],
    },
    {
        "chapter": 7,
        "en": 'Later that day, the farmer returned from town. "What happened?" he cried.',
        "zh": "那天稍晚，農夫從城裡回來了。「發生什麼事了？」他大叫。",
        "segments": [237, 238, 239],
    },
    {
        "chapter": 7,
        "en": "Small footprints were everywhere. The scarecrow's clothes were gone. And the cat was locked in the greenhouse.",
        "zh": "到處都是小小的腳印。稻草人的衣服不見了。貓被鎖在溫室裡。",
        "segments": [240, 241, 242],
    },
    {
        "chapter": 7,
        "en": "Mrs. Rabbit was upset with Peter, but she was glad to see him.",
        "zh": "兔媽媽對彼得很生氣，但見到他還是很高興。",
        "segments": [243, 244],
    },
    {
        "chapter": 7,
        "en": '"You\'re safe, Peter," she said. "And you got your clothes back."',
        "zh": "「你平安就好，彼得。」她說。「而且你把衣服也找回來了。」",
        "segments": [245, 246],
    },
]

SKIP_SEGMENT_RE = re.compile(
    r"^(?:clop(?:,\s*clop)*\.?|scritch(?:,\s*scratch)?\.?|splash\.?|"
    r"sniff(?:,\s*sniff)*\.?|shoo!|(?:then,?\s*)?bang!|yummy!|"
    r"\[(?:music|laughter|applause)\])$",
    re.I,
)


def load_segments() -> list[dict]:
    return json.loads(JSON_PATH.read_text(encoding="utf-8"))["segments"]


def timing_for(entry: dict, segments: list[dict]) -> tuple[float, float]:
    idxs = entry.get("segments") or []
    if not idxs:
        return 0.0, 0.0
    return range_bounds(segments, idxs)


def en_for(entry: dict, segments: list[dict]) -> str:
    idxs = entry.get("segments") or []
    if not idxs:
        return entry["en"]
    spoken = join_segment_texts(segments, idxs)
    return spoken or entry["en"]


def covered_segments() -> set[int]:
    covered: set[int] = set()
    for entry in SENTENCE_MAP:
        for i in entry.get("segments", []):
            covered.add(i)
    return covered


def validate_coverage(segments: list[dict]) -> None:
    covered = covered_segments()
    skipped = {i for i, s in enumerate(segments) if SKIP_SEGMENT_RE.match(s["text"].strip())}
    missing = [i for i in range(len(segments)) if i not in covered and i not in skipped]
    if missing:
        print(f"Warning: uncovered segments ({len(missing)}): {missing[:20]}")


def target_counts_by_chapter() -> dict[int, int]:
    counts: dict[int, int] = {}
    for entry in SENTENCE_MAP:
        ch = entry["chapter"]
        counts[ch] = counts.get(ch, 0) + 1
    return counts


def split_evenly(items: list, n: int) -> list[list]:
    if n <= 0:
        return []
    if not items:
        return [[] for _ in range(n)]
    out: list[list] = [[] for _ in range(n)]
    for i, item in enumerate(items):
        out[min(i * n // len(items), n - 1)].append(item)
    return [g for g in out if g]


def build_from_remapped(segments: list[dict]) -> list[dict]:
    mapped = remap_sentence_map(segments, SENTENCE_MAP)
    sentences: list[dict] = []
    for i, entry in enumerate(mapped, 1):
        idxs = entry.get("segments") or []
        if idxs:
            en = join_segment_texts(segments, idxs)
            start, end = range_bounds(segments, idxs)
            raw_len = sum(len(segments[i]["text"]) for i in idxs)
            if token_overlap(entry["en"], en) < 0.35 and raw_len > 80:
                fb_idxs, fb_start, fb_end, fb_en = fallback_bounds(entry, segments)
                if fb_idxs and fb_en:
                    idxs = fb_idxs
                    start, end = fb_start, fb_end
                    en = fb_en
            elif token_overlap(entry["en"], en) < 0.2 and len(en.split()) > 12:
                fb_idxs, fb_start, fb_end, fb_en = fallback_bounds(entry, segments)
                if fb_idxs:
                    idxs = fb_idxs
                    start, end = fb_start, fb_end
                    en = fb_en
        else:
            fb_idxs, start, end, en = fallback_bounds(entry, segments)
            idxs = fb_idxs
            if not en:
                en = entry["en"]
        if i in WORD_SEQUENCE_OVERRIDES:
            seg_lo, seg_hi, tokens = WORD_SEQUENCE_OVERRIDES[i]
            seq = spoken_from_token_sequence(segments, seg_lo, seg_hi, tokens)
            if seq:
                en, start, end = seq
        elif i in WORD_TIMING_OVERRIDES:
            start, end = WORD_TIMING_OVERRIDES[i]
            spoken = spoken_from_word_range(segments, start, end)
            if spoken:
                en = spoken
        sentences.append(
            {
                "id": f"s{i}",
                "chapter": entry["chapter"],
                "en": en,
                "zh": entry["zh"],
                "start": start,
                "end": end,
            }
        )
    return sentences


def build_sentences(segments: list[dict]) -> list[dict]:
    if segments and segments[0].get("words") is not None:
        return build_from_remapped(segments)
    sentences = []
    for i, entry in enumerate(SENTENCE_MAP, 1):
        start, end = timing_for(entry, segments)
        sentences.append(
            {
                "id": f"s{i}",
                "chapter": entry["chapter"],
                "en": en_for(entry, segments),
                "zh": entry["zh"],
                "start": start,
                "end": end,
            }
        )
    return sentences


def main() -> None:
    segments = load_segments()
    sentences = build_sentences(segments)
    payload = {
        "source_json": str(JSON_PATH),
        "language": "en",
        "chapters": CHAPTERS,
        "sentences": sentences,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    SRT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SRT_PATH.write_text(sentences_to_srt(sentences), encoding="utf-8")

    chapter_counts: dict[int, int] = {}
    for s in sentences:
        chapter_counts[s["chapter"]] = chapter_counts.get(s["chapter"], 0) + 1

    print(f"Segments: {len(segments)}")
    print(f"Sentences: {len(sentences)}")
    print("Chapter counts:")
    for ch in CHAPTERS:
        n = chapter_counts.get(ch["chapter"], 0)
        print(f"  ch{ch['chapter']} ({ch['label']}): {n}")
    print(f"\nOutput: {OUT_PATH}")
    print(f"SRT: {SRT_PATH}")


if __name__ == "__main__":
    main()
