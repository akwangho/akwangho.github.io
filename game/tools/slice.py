#!/usr/bin/env python3
"""Slice the monkey sprite sheet into individual transparent PNGs."""
import numpy as np
from PIL import Image
from collections import deque
import os

SRC = "assets/monkey-sheet.png"
OUT = "assets/sprites"
os.makedirs(OUT, exist_ok=True)

img = Image.open(SRC).convert("RGB")
W, H = img.size
arr = np.asarray(img).astype(np.int16)

bg = np.median(np.stack([arr[0, 0], arr[0, -1], arr[-1, 0], arr[-1, -1]]), axis=0)
diff = np.abs(arr - bg).sum(axis=2)
fg = diff > 40

# Exterior flood fill -> transparency mask
exterior = np.zeros((H, W), dtype=bool)
dq = deque()
for x in range(W):
    for y in (0, H - 1):
        if not fg[y, x] and not exterior[y, x]:
            exterior[y, x] = True; dq.append((y, x))
for y in range(H):
    for x in (0, W - 1):
        if not fg[y, x] and not exterior[y, x]:
            exterior[y, x] = True; dq.append((y, x))
while dq:
    y, x = dq.popleft()
    for ny, nx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
        if 0 <= ny < H and 0 <= nx < W and not exterior[ny, nx] and not fg[ny, nx]:
            exterior[ny, nx] = True; dq.append((ny, nx))

alpha = np.where(exterior, 0, 255).astype(np.uint8)
rgba = np.dstack([np.asarray(img), alpha])
solid = fg & ~exterior

def components_in(x0, y0, x1, y1, min_area=300, merge_pad=4, erase=None):
    """Detect sprite boxes inside a window. erase=(ex0,ey0,ex1,ey1) full-res rect."""
    m = solid[y0:y1, x0:x1].copy()
    if erase:
        ex0, ey0, ex1, ey1 = erase
        m[max(0, ey0-y0):max(0, ey1-y0), max(0, ex0-x0):max(0, ex1-x0)] = False
    hh, ww = m.shape
    seen = np.zeros((hh, ww), dtype=bool)
    boxes = []
    for sy in range(hh):
        for sx in range(ww):
            if m[sy, sx] and not seen[sy, sx]:
                stack = [(sy, sx)]; seen[sy, sx] = True
                mny = mnx = 10**9; mxy = mxx = -1
                area = 0
                while stack:
                    cy, cx = stack.pop(); area += 1
                    mny = min(mny, cy); mxy = max(mxy, cy)
                    mnx = min(mnx, cx); mxx = max(mxx, cx)
                    for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                        if 0 <= ny < hh and 0 <= nx < ww and m[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; stack.append((ny, nx))
                boxes.append([mnx, mny, mxx + 1, mxy + 1, area])
    def ov(a, b):
        return not (a[2] + merge_pad < b[0] or b[2] + merge_pad < a[0] or
                    a[3] + merge_pad < b[1] or b[3] + merge_pad < a[1])
    merged = True
    while merged:
        merged = False
        out = []
        while boxes:
            b = boxes.pop()
            i = 0
            while i < len(boxes):
                if ov(b, boxes[i]):
                    o = boxes.pop(i)
                    b = [min(b[0],o[0]), min(b[1],o[1]), max(b[2],o[2]), max(b[3],o[3]), b[4]+o[4]]
                    merged = True; i = 0
                else:
                    i += 1
            out.append(b)
        boxes = out
    boxes = [b for b in boxes if b[4] >= min_area]
    boxes.sort(key=lambda b: b[0])
    return [(x0 + b[0], y0 + b[1], x0 + b[2], y0 + b[3]) for b in boxes]

def save(name, box):
    x0, y0, x1, y1 = box
    im = Image.fromarray(rgba[y0:y1, x0:x1])
    im.save(f"{OUT}/{name}.png")
    print(f"{name}: {im.size[0]}x{im.size[1]}  box=({x0},{y0},{x1},{y1})")

# ---------- player (right-facing where noted; game flips for left) ----------
save("idle",       (136, 24, 225, 142))
save("idle2",      (258, 24, 341, 141))
save("skid",       (498, 22, 576, 142))   # left profile; flip in game
save("walk_r1",    (486, 162, 556, 274))
save("walk_r2",    (590, 162, 669, 273))
save("run_r1",     (480, 292, 559, 398))
save("run_r2",     (588, 292, 667, 396))
save("jump_r",     (702, 418, 781, 509))
save("fall_r",     (608, 542, 680, 614))
save("hurt",       (948, 58, 1098, 184))
save("ko",         (1140, 104, 1275, 181))
save("dead",       (1356, 58, 1452, 182))
save("powerup",    (950, 270, 1093, 396))
save("powerdown",  (1152, 282, 1231, 386))

# ---------- tiles ----------
save("tile_grass",  (714, 926, 803, 1004))
save("tile_brick",  (824, 928, 907, 1004))
save("tile_qblock", components_in(925, 910, 1035, 1010)[0])
save("tile_pipe",   components_in(1040, 910, 1140, 1010)[0])
save("tile_ladder", components_in(1155, 895, 1250, 1010)[0])
# flag: erase divider line left of pole before detecting (right stub filtered by area)
fb = components_in(1275, 868, 1380, 1010, erase=(1275, 868, 1293, 892))[0]
save("tile_flag", fb)
save("tile_water",  components_in(1375, 915, 1480, 1010)[0])

# ---------- items ----------
its = components_in(1292, 262, 1528, 378, min_area=900)
for name, b in zip(["item_star", "item_mushroom", "item_qblock"], its):
    save(name, b)

# ---------- effects ----------
save("fx_star",      (36, 926, 92, 983))
save("fx_sparkle",   (124, 926, 206, 987))
save("fx_explosion", (350, 924, 428, 986))
save("fx_fireball",  (462, 930, 531, 976))
save("fx_smoke",     (568, 926, 639, 992))

# ---------- faces (HUD) ----------
for i, fbox in enumerate(components_in(940, 480, 1500, 575, min_area=1000)[:5]):
    save(f"face{i+1}", fbox)
print("done")
