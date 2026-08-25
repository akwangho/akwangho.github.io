#!/usr/bin/env python3
"""Generate the new gameplay sprites (shell, fly enemy, piranha, boss,
hammer, big banana) in the same chunky pixel style as the rest of the set."""
import os
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "sprites")

# palette
OL = (46, 26, 12, 255)      # outline
GN = (72, 178, 80, 255)     # shell green
GD = (34, 110, 48, 255)     # shell green dark
CR = (255, 240, 214, 255)   # cream spots
PU = (168, 92, 196, 255)    # purple body
PD = (110, 52, 140, 255)    # purple dark
RD = (226, 68, 58, 255)     # plant red
WH = (255, 255, 255, 255)   # white
ST = (60, 150, 60, 255)     # stem green
GD2 = (247, 197, 49, 255)   # gold
GDD = (200, 148, 20, 255)   # gold dark
TA = (232, 190, 138, 255)   # tan face
GY = (120, 120, 128, 255)   # hammer gray

def build(map_str, pal, scale=4):
    rows = [r for r in map_str.strip("\n").split("\n")]
    h, w = len(rows), max(len(r) for r in rows)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in pal:
                px[x, y] = pal[ch]
    return img.resize((w * scale, h * scale), Image.NEAREST)

SHELL = """
................
....########....
..##GGGGGGGG##..
.#GGGGGGGGGGGG#.
.#GGWGGGGGGWGG#.
#GGWWGGGGGGWWGG#
#GGGWGGGGGWGGGG#
#GGGGGGGGGGGGGG#
#DGGDGGDGGDGGDD#
#DDDDDDDDDDDDDD#
.#DCWWWDDWWWCD#.
..############..
................
"""

FLY = """
.#............#.
###..........###
#WP#........#PW#
.####......####.
..#####OO#####..
...###OOOO###...
..##OOWWWOOO##..
..#OOW#OO#WOO#..
...#OOOOOOOO#...
....##OOOO##....
......#OO#......
.......##.......
"""

PLANT = """
.....######.....
....#RRRRRR#....
...#RRWRRWRR#...
..#RRRRRRRRRR#..
..#RWWWWWWWWR#..
.#RRRWRRRRWRRR#.
.#RRRRRRRRRRRR#.
.#RRRRRRRRRRRR#.
..#RRRRRRRRRR#..
..#RWWWWWWWWR#...
...#RRRRRRRR#...
....########....
......#SS#......
.....#SSSS#.....
.....#SSSS#.....
.....#SSSS#.....
.....#SSSS#.....
.....#SSSS#.....
.....#SSSS#.....
.....#SSSS#.....
....#SSSSS#.....
"""

BOSS = """
........####........
.......#YYYY#.......
......#YYYYYY#......
.....##TTTTTT##.....
....#TTWTTTWTTT#....
....#TTTTTTTTTT#....
...#TT#TTTTTT#TT#...
...#T#TTTTTTTT#T#..
..#GGGGG##GGGGGG#..
.#GGDGGGGGGGGDGGG#..
.#GGDGGGGGGGGDGGG#..
#GGGDGGGGGGGGDGGGG#.
#GGGGGGGGGGGGGGGGG#.
#GGGGDGGGGGGDGGGGG#.
#GGGGGGGGGGGGGGGGG#.
.#GGGGGGGGGGGGGGG#..
.#GGGGGGGGGGGGGGG#..
.#DDGGGGGGGGGGGDD#..
..#DDDDDDDDDDDDD#...
..#DD#.#DDDD#. #DD#.
..#DD#..#DD#...#DD#.
"""

HAMMER = """
..#GGG#...
.#GGGGG#..
.#GGGGG#..
..#####...
...#HH#...
...#HH#...
...#HH#...
...#HH#...
"""


jobs = [
    ("shell.png",       SHELL,     {"#": OL, "G": GN, "W": CR, "D": GD, "C": CR}, 5),
    ("enemy_fly.png",   FLY,       {"#": OL, "O": PU, "W": WH, "P": PD}, 5),
    ("plant.png",       PLANT,     {"#": OL, "R": RD, "W": WH, "S": ST}, 4),
    ("boss.png",        BOSS,      {"#": OL, "Y": GD2, "T": TA, "W": WH, "G": GN, "D": GD}, 5),
    ("hammer.png",      HAMMER,    {"#": OL, "G": GY, "H": (146, 96, 44, 255)}, 6),
]
for fn, mp, pal, sc in jobs:
    img = build(mp, pal, sc)
    img.save(os.path.join(OUT, fn))
    print("saved", fn, img.size)
