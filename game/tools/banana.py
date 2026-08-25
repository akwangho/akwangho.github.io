#!/usr/bin/env python3
"""Generate a pixel-art banana sprite (coin replacement) from a hand map.

A short, plump crescent arc (~210 deg sweep): curved from tip to tip like a
banana should be, tilted 45 degrees clockwise (mouth faces upper-right).
"""
from PIL import Image

MAP = [
    "......S.........",
    "......S.........",
    "......##........",
    "....##L#........",
    "...#LLY#........",
    "..#LLY#.........",
    "..#LY#..........",
    "..#LY#..........",
    "..#LY#..........",
    "..#LYD#.........",
    "..#LYYD#....#...",
    "..#LLYYD####Y#..",
    "...#LLYYDDDY#...",
    "....##LYYYY#....",
    "......#####.....",
    "................",
]

COLORS = {
    "#": (74, 46, 18, 255),
    "Y": (247, 197, 49, 255),
    "L": (255, 226, 130, 255),
    "D": (214, 142, 40, 255),
    "S": (94, 62, 24, 255),
}

N = 16
img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
px = img.load()
for y, row in enumerate(MAP):
    for x, ch in enumerate(row):
        if ch in COLORS:
            px[x, y] = COLORS[ch]

img.resize((64, 64), Image.NEAREST).save("assets/sprites/banana.png")
img.resize((256, 256), Image.NEAREST).save("/tmp/banana_big.png")
print("banana saved")
