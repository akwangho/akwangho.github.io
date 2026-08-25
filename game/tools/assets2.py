#!/usr/bin/env python3
"""Generate pixel-art assets: curved banana, ice tile, fire flower."""
from PIL import Image
import numpy as np

# ---------------- curved banana (plump crescent arc, tilted 45deg cw) ----------------
BANANA = [
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
img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
px = img.load()
for y, row in enumerate(BANANA):
    for x, ch in enumerate(row):
        if ch in COLORS:
            px[x, y] = COLORS[ch]
img.resize((64, 64), Image.NEAREST).save("assets/sprites/banana.png")

# ---------------- ice tile (recolor solid) ----------------
s = np.asarray(Image.open("assets/sprites/tile_solid.png").convert("RGB")).astype(np.int16)
r, g, b = s[:, :, 0], s[:, :, 1], s[:, :, 2]
out = np.zeros_like(s)
out[:, :, 0] = np.clip(b * 0.75, 0, 255)
out[:, :, 1] = np.clip(g * 1.08, 0, 255)
out[:, :, 2] = np.clip(r * 0.85 + 70, 0, 255)
Image.fromarray(out.astype(np.uint8)).save("assets/sprites/tile_ice.png")

# ---------------- fire flower ----------------
FF = [
    "................",
    "....######......",
    "...#OOOOOO#.....",
    "..#OOYYYYOO#....",
    "..#OYWWWWYO#....",
    "..#OYWWWWYO#....",
    "..#OOYYYYOO#....",
    "...#OOOOOO#.....",
    "....##GG##......",
    ".....#GG#.......",
    "..##.#GG#.##....",
    ".#LL##GG##LL#...",
    "..##.#GG#.##....",
    ".....#GG#.......",
    "....#GGGG#......",
    "................",
]
FC = {
    "#": (60, 20, 10, 255),
    "O": (240, 90, 20, 255),
    "Y": (255, 200, 40, 255),
    "W": (255, 240, 180, 255),
    "G": (30, 140, 50, 255),
    "L": (90, 190, 70, 255),
}
ff = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
fp = ff.load()
for y, row in enumerate(FF):
    for x, ch in enumerate(row):
        if ch in FC:
            fp[x, y] = FC[ch]
ff.resize((64, 64), Image.NEAREST).save("assets/sprites/fireflower.png")

# preview
prev = Image.new("RGB", (560, 200), (40, 160, 90))
for i, (n, im) in enumerate([("banana", img), ("ice", Image.open("assets/sprites/tile_ice.png")), ("flower", ff)]):
    big = im.resize((160, 160), Image.NEAREST)
    prev.paste(big, (20 + i * 180, 20), big)
prev.save("/var/folders/jm/hpzs129x3y53zdzvfjkkzmg80000gn/T/opencode/newassets.png")
print("assets ok")
