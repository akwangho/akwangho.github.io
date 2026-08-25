#!/usr/bin/env python3
"""Remove white/beige halos and enclosed background pockets from sheet-derived sprites."""
import numpy as np
from PIL import Image
from collections import deque
import os

BG = np.array([246.5, 239.0, 221.5])

SHEET_DERIVED = [
    "idle", "idle2", "skid", "walk_r1", "walk_r2", "run_r1", "run_r2", "jump_r", "fall_r",
    "hurt", "ko", "dead", "powerup", "powerdown",
    "tile_grass", "tile_brick", "tile_qblock", "tile_pipe", "tile_ladder", "tile_water",
    "tile_flag", "flag_cloth",
    "item_star", "item_mushroom", "item_qblock",
    "fx_sparkle", "fx_smoke", "fx_fireball", "fx_explosion", "fx_star",
    "face1", "face2", "face3", "face4", "face5",
]

def lum(rgb):
    return 0.3 * rgb[:, :, 0] + 0.59 * rgb[:, :, 1] + 0.11 * rgb[:, :, 2]

def sat(rgb):
    return rgb[:, :, :3].max(axis=2) - rgb[:, :, :3].min(axis=2)

def diff_bg(rgb):
    return np.abs(rgb - BG).sum(axis=2)

def neighbors_transparent(alpha):
    t = alpha == 0
    n = np.zeros_like(t)
    n[1:, :] |= t[:-1, :]
    n[:-1, :] |= t[1:, :]
    n[:, 1:] |= t[:, :-1]
    n[:, :-1] |= t[:, 1:]
    return n

def remove_pockets(rgb, alpha, max_area=500, thresh=14):
    """Remove small enclosed opaque regions whose color is ~ background."""
    h, w = alpha.shape
    nearbg = (diff_bg(rgb) < thresh) & (alpha > 0)
    labels = np.zeros((h, w), dtype=np.int32)
    cur = 0
    for sy in range(h):
        for sx in range(w):
            if nearbg[sy, sx] and labels[sy, sx] == 0:
                cur += 1
                dq = deque([(sy, sx)])
                labels[sy, sx] = cur
                comp = [(sy, sx)]
                while dq:
                    cy, cx = dq.popleft()
                    for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                        if 0 <= ny < h and 0 <= nx < w and nearbg[ny, nx] and labels[ny, nx] == 0:
                            labels[ny, nx] = cur
                            dq.append((ny, nx))
                            comp.append((ny, nx))
                if len(comp) <= max_area:
                    for cy, cx in comp:
                        alpha[cy, cx] = 0
    return alpha

total_eaten = {}
for name in SHEET_DERIVED:
    path = f"assets/sprites/{name}.png"
    if not os.path.exists(path):
        continue
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im).astype(np.int16)
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3].copy()

    L = lum(rgb)
    S = sat(rgb)
    D = diff_bg(rgb)

    eaten = 0
    for it in range(4):
        boundary = (alpha > 0) & neighbors_transparent(alpha)
        eat = boundary & ((D < 160) | ((L > 135) & (S < 60)))
        if not eat.any():
            break
        eaten += int(eat.sum())
        alpha[eat] = 0

    alpha = remove_pockets(rgb, alpha)
    eaten_pocket = int(((alpha == 0) & (arr[:, :, 3] > 0)).sum())

    out = arr.copy()
    out[:, :, 3] = alpha
    Image.fromarray(out.astype(np.uint8)).save(path)
    total_eaten[name] = (eaten, eaten_pocket)

for k, v in total_eaten.items():
    print(f"{k}: halo={v[0]} pocket={v[1]}")
print("defringe done")
