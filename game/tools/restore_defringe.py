#!/usr/bin/env python3
"""Restore sprites from sheet, then apply corrected defringe."""
import numpy as np
from PIL import Image
from collections import deque
import os
import subprocess

# ---------- step 1: restore originals from sheet ----------
print("== re-slicing from sheet ==")
subprocess.run(["python3", "tools/slice.py"], check=True)

# ---------- step 2: re-assemble tile_flag (remove divider stub) ----------
print("== flag assembly ==")
img = Image.open("assets/monkey-sheet.png").convert("RGB")
arr = np.asarray(img).astype(np.int16)
BG = np.array([246.5, 239.0, 221.5])

def cut(box):
    x0, y0, x1, y1 = box
    a = arr[y0:y1, x0:x1]
    d = np.abs(a - BG).sum(axis=2)
    al = np.where(d > 40, 255, 0).astype(np.uint8)
    return Image.fromarray(np.dstack([a.astype(np.uint8), al]))

canvas = Image.new("RGBA", (79, 129), (0, 0, 0, 0))
pole = cut((1293, 893, 1372, 1004))
ball = cut((1293, 875, 1318, 893))
canvas.paste(pole, (0, 18), pole)
canvas.paste(ball, (0, 0), ball)
canvas.save("assets/sprites/tile_flag.png")
print("flag reassembled")

# ---------- step 3: corrected defringe ----------
print("== defringe ==")
SHEET_DERIVED = [
    "idle", "idle2", "skid", "walk_r1", "walk_r2", "run_r1", "run_r2", "jump_r", "fall_r",
    "hurt", "ko", "dead", "powerup", "powerdown",
    "tile_grass", "tile_brick", "tile_qblock", "tile_pipe", "tile_ladder", "tile_water",
    "tile_flag", "flag_cloth",
    "item_star", "item_mushroom", "item_qblock",
    "fx_sparkle", "fx_smoke", "fx_fireball", "fx_explosion", "fx_star",
    "face1", "face2", "face3", "face4", "face5",
]
# sprites without cream/face colors -> allow aggressive solid-pocket removal
NO_CREAM = {"item_star", "item_qblock", "tile_qblock", "fx_sparkle", "fx_fireball",
            "tile_water", "tile_ladder", "flag_cloth", "tile_flag"}

def lum(rgb):
    return 0.3 * rgb[:, :, 0] + 0.59 * rgb[:, :, 1] + 0.11 * rgb[:, :, 2]

def neighbors_transparent(alpha):
    t = alpha == 0
    n = np.zeros_like(t)
    n[1:, :] |= t[:-1, :]
    n[:-1, :] |= t[1:, :]
    n[:, 1:] |= t[:, :-1]
    n[:, :-1] |= t[:, 1:]
    return n

for name in SHEET_DERIVED:
    path = f"assets/sprites/{name}.png"
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im).astype(np.int16)
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3].copy()
    L = 0.3 * rgb[:, :, 0] + 0.59 * rgb[:, :, 1] + 0.11 * rgb[:, :, 2]
    S = rgb.max(axis=2) - rgb.min(axis=2)
    D = np.abs(rgb - BG).sum(axis=2)

    # halo erosion
    eaten = 0
    for _ in range(4):
        boundary = (alpha > 0) & neighbors_transparent(alpha)
        eat = boundary & ((D < 160) | ((L > 135) & (S < 60)))
        if not eat.any():
            break
        eaten += int(eat.sum())
        alpha[eat] = 0

    # pocket removal: near-bg components ADJACENT TO TRANSPARENCY only
    nearbg = (D < 14) & (alpha > 0)
    touch = nearbg & neighbors_transparent(alpha)
    h, w = alpha.shape
    seen = np.zeros((h, w), dtype=bool)
    removed = 0
    for sy in range(h):
        for sx in range(w):
            if touch[sy, sx] and not seen[sy, sx]:
                dq = deque([(sy, sx)])
                seen[sy, sx] = True
                comp = [(sy, sx)]
                while dq:
                    cy, cx = dq.popleft()
                    for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                        if 0 <= ny < h and 0 <= nx < w and nearbg[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            dq.append((ny, nx))
                            comp.append((ny, nx))
                for cy, cx in comp:
                    alpha[cy, cx] = 0
                    removed += 1

    # aggressive solid-pocket removal for sprites without cream colors
    extra = 0
    if name in NO_CREAM:
        nearbg2 = (D < 20) & (alpha > 0)
        seen2 = np.zeros((h, w), dtype=bool)
        for sy in range(h):
            for sx in range(w):
                if nearbg2[sy, sx] and not seen2[sy, sx]:
                    dq = deque([(sy, sx)])
                    seen2[sy, sx] = True
                    comp = [(sy, sx)]
                    while dq:
                        cy, cx = dq.popleft()
                        for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                            if 0 <= ny < h and 0 <= nx < w and nearbg2[ny, nx] and not seen2[ny, nx]:
                                seen2[ny, nx] = True
                                dq.append((ny, nx))
                                comp.append((ny, nx))
                    if 6 <= len(comp) <= 800:
                        ys = [p[0] for p in comp]; xs = [p[1] for p in comp]
                        fill = len(comp) / max(1, (max(ys)-min(ys)+1) * (max(xs)-min(xs)+1))
                        if fill >= 0.55:
                            for cy, cx in comp:
                                alpha[cy, cx] = 0
                                extra += 1

    out = arr.copy()
    out[:, :, 3] = alpha
    Image.fromarray(out.astype(np.uint8)).save(path)
    print(f"{name}: halo={eaten} pocket={removed} extra={extra}")

# ---------- step 4: regenerate derived tiles ----------
print("== derived tiles ==")
g = Image.open("assets/sprites/tile_grass.png")
g.crop((22, 36, 66, 75)).resize((48, 48), Image.NEAREST).save("assets/sprites/tile_dirt.png")

w = np.asarray(Image.open("assets/sprites/tile_water.png").convert("RGBA")).astype(np.int16)
rgbw, aw = w[:, :, :3], w[:, :, 3]
lumw = rgbw[:, :, 0] + rgbw[:, :, 1] + rgbw[:, :, 2]
out = np.zeros_like(w)
out[:, :, 0] = np.clip(150 + lumw * 0.3, 0, 255)
out[:, :, 1] = np.clip(lumw * 0.18 - 20, 0, 255)
out[:, :, 2] = np.clip(lumw * 0.05, 0, 255)
Image.fromarray(np.dstack([out.astype(np.uint8), aw.astype(np.uint8)])).save("assets/sprites/tile_lava.png")
print("derived ok")
