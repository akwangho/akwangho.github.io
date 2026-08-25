#!/usr/bin/env python3
"""Theme-exclusive enemy sprites: mummy (pyramid), penguin (ice), lava bubble."""
import os
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "sprites")
OL = (46, 26, 12, 255)

def build(mp, pal, scale=4):
    rows = mp.strip("\n").split("\n")
    h, w = len(rows), max(len(r) for r in rows)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in pal:
                px[x, y] = pal[ch]
    return img.resize((w * scale, h * scale), Image.NEAREST)

MUMMY = """
...#########...
..#WWWWWWWWW#..
.#WWLLWWWLLWW#.
.#WL#WLW#WLWW#.
#WWLLLLLLLLLWW#
#WW#L#####L#WW#
#WWW#L###L#WWW#
.#WWWWWWWWWWW#.
.#WLLWWWWLLWW#.
.#WLLLWWLLLWW#.
..#WWWWWWWWW#..
..#W#W#W#W#W#..
...#W#W#W#W#...
....########...
"""

PENGUIN = """
.....######....
....#BBBBBB#...
...#BBWWWBBB#..
...#BWKBWKWB#..
..#BBWWWWWWBB#.
..#BBWWOOOWBB#.
.#BBBWWWWWWBBB#
.#BBWWWWWWWBB#.
.#BWWWWWWWWB#..
.#BWOOOOWWOB#..
.#BWWWWWWWOB#..
..#BWWWWWWB#...
...#BWWWWB#....
....#BBWWB#....
.....BBWWB.....
....#BOOOB#....
"""

LAVA = """
......####......
....##OYYO##....
...#OYYYYYYO#...
..#OYYRYYRYYO#..
.#OYYRYYRYYYYO#.
.#OYYYYYYYYYYO#.
.#OYRYYYYRYYO#..
..#OYYYYYYYYO#..
..#OYYOYYOYYO#..
...#OYYOYYO#...
....##OOOO##....
......####......
"""

jobs = [
    ("mummy.png", MUMMY, {"#": OL, "W": (238, 232, 210, 255), "L": (196, 186, 158, 255)}, 4),
    ("penguin.png", PENGUIN, {"#": OL, "B": (40, 44, 60, 255), "W": (255,255,255,255),
                              "O": (255,150,40,255), "K": (20,20,28,255)}, 4),
    ("lava_bubble.png", LAVA, {"#": OL, "O": (226,88,34,255), "Y": (255,200,64,255),
                               "R": (170,48,20,255)}, 4),
]
for fn, mp, pal, sc in jobs:
    build(mp, pal, sc).save(os.path.join(OUT, fn))
    print("saved", fn)
