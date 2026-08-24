#!/usr/bin/env python3
"""Generate coconut enemy sprites + solid stone tile (pixel art)."""
from PIL import Image
import math

def ellipse_sprite(w, h, cx, cy, rx, ry, fill, outline, extra=None):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    inside = lambda x, y: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0
    for y in range(h):
        for x in range(w):
            if inside(x, y):
                edge = not (inside(x + 1, y) and inside(x - 1, y) and inside(x, y + 1) and inside(x, y - 1))
                px[x, y] = outline if edge else fill
    if extra:
        extra(px)
    return img

SHELL = (139, 90, 43, 255)
DARK = (74, 46, 18, 255)
LIGHT = (169, 116, 74, 255)
WHITE = (250, 246, 235, 255)
BLACK = (30, 20, 10, 255)

def eyes(angry=True):
    def draw(px):
        for ex in (4, 5, 10, 11):
            px[ex, 6] = WHITE
            px[ex, 7] = WHITE
        px[5, 7] = BLACK; px[10, 7] = BLACK
        if angry:
            px[4, 5] = BLACK; px[5, 5] = DARK
            px[10, 5] = DARK; px[11, 5] = BLACK
    return draw

def feet(lx_off, rx_off):
    def draw(px):
        for fx in range(2 + lx_off, 6 + lx_off):
            px[fx, 13] = DARK; px[fx, 14] = DARK
        for fx in range(10 - rx_off, 14 - rx_off):
            px[fx, 13] = DARK; px[fx, 14] = DARK
    return draw

def fibers(px):
    for (x, y) in ((3, 10), (12, 9), (7, 11), (4, 3), (11, 3)):
        px[x, y] = DARK

a = ellipse_sprite(16, 16, 7.5, 7.2, 6.6, 6.2, SHELL, DARK, extra=lambda px: (eyes()(px), feet(0, 0)(px), fibers(px)))
b = ellipse_sprite(16, 16, 7.5, 7.2, 6.6, 6.2, SHELL, DARK, extra=lambda px: (eyes()(px), feet(1, -1)(px), fibers(px)))

flat = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
fpx = flat.load()
for y in range(9, 14):
    for x in range(1, 15):
        if ((x - 7.5) / 6.9) ** 2 + ((y - 11.5) / 2.4) ** 2 <= 1.0:
            edge = y in (9, 13) or x in (1, 14)
            fpx[x, y] = DARK if edge else SHELL
fpx[4, 10] = BLACK; fpx[4, 11] = WHITE
fpx[11, 10] = BLACK; fpx[11, 11] = WHITE
fpx[5, 11] = BLACK; fpx[10, 11] = BLACK

a.resize((64, 64), Image.NEAREST).save("assets/sprites/enemy_a.png")
b.resize((64, 64), Image.NEAREST).save("assets/sprites/enemy_b.png")
flat.resize((64, 64), Image.NEAREST).save("assets/sprites/enemy_flat.png")

# solid stone block (stairs)
TAN = (217, 160, 102, 255)
TL = (240, 192, 136, 255)
BR = (139, 90, 43, 255)
OUT = (62, 39, 17, 255)
blk = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
bp = blk.load()
for y in range(16):
    for x in range(16):
        if x in (0, 15) or y in (0, 15):
            c = OUT
        elif x - y <= 1:
            c = TL
        elif x + y >= 15 + 8:
            c = BR
        else:
            c = TAN
        bp[x, y] = c
for (x, y) in ((3, 3), (12, 3), (3, 12), (12, 12)):
    bp[x, y] = OUT
blk.resize((64, 64), Image.NEAREST).save("assets/sprites/tile_solid.png")
print("enemy + solid tile saved")
