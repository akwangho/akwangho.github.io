#!/usr/bin/env python3
"""Generate checkpoint pennant sprites (inactive gray / active gold)."""
import os
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "sprites")

OFF_MAP = """
############
#AAAAAAAAA##
#AAAAAAAAAA#
#AAAAAAAAAA#
#AAAAAAAAA##
#AAAAAAAA###
#AAAAAAA####
##AAAAA#####
"""
ON_MAP = """
############
#GGGGGGGGG##
#GGGGGGGGGG#
#GGGDDGGGGG#
#GGDDDDGGG##
#GGGGGGGG###
#GGGGGG#####
##GGGGG#####
"""

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

PAL_OFF = {"#": (46, 26, 12, 255), "A": (154, 160, 168, 255)}
PAL_ON  = {"#": (46, 26, 12, 255), "G": (255, 213, 79, 255), "D": (255, 240, 180, 255)}

build(OFF_MAP, PAL_OFF).save(os.path.join(OUT, "tile_checkpoint.png"))
build(ON_MAP, PAL_ON).save(os.path.join(OUT, "tile_checkpoint_on.png"))
print("checkpoint pennants saved")
