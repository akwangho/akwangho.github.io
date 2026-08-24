#!/usr/bin/env python3
"""Detect sprite bounding boxes in the monkey sprite sheet."""
import numpy as np
from PIL import Image
from collections import deque
import sys

SRC = "assets/monkey-sheet.png"

img = Image.open(SRC).convert("RGB")
W, H = img.size
arr = np.asarray(img).astype(np.int16)

# Background color: sample corners
corners = [arr[0, 0], arr[0, -1], arr[-1, 0], arr[-1, -1]]
bg = np.median(np.stack(corners), axis=0)
print("bg color:", bg)

diff = np.abs(arr - bg).sum(axis=2)
fg = diff > 40  # foreground mask

# Exterior = background-connected region (BFS from borders on ~fg)
exterior = np.zeros((H, W), dtype=bool)
dq = deque()
for x in range(W):
    for y in (0, H - 1):
        if not fg[y, x] and not exterior[y, x]:
            exterior[y, x] = True
            dq.append((y, x))
for y in range(H):
    for x in (0, W - 1):
        if not fg[y, x] and not exterior[y, x]:
            exterior[y, x] = True
            dq.append((y, x))
while dq:
    y, x = dq.popleft()
    for ny, nx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
        if 0 <= ny < H and 0 <= nx < W and not exterior[ny, nx] and not fg[ny, nx]:
            exterior[ny, nx] = True
            dq.append((ny, nx))

solid = fg & ~exterior  # actual sprites (fg already excludes near-bg)

# Connected components on downscaled mask for speed
f = 2
small = solid[::f, ::f]
sh, sw = small.shape
labels = np.zeros((sh, sw), dtype=np.int32)
cur = 0
boxes = []
for sy in range(sh):
    for sx in range(sw):
        if small[sy, sx] and labels[sy, sx] == 0:
            cur += 1
            dq = deque([(sy, sx)])
            labels[sy, sx] = cur
            miny = maxy = sy
            minx = maxx = sx
            count = 0
            while dq:
                cy, cx = dq.popleft()
                count += 1
                miny = min(miny, cy); maxy = max(maxy, cy)
                minx = min(minx, cx); maxx = max(maxx, cx)
                for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                    if 0 <= ny < sh and 0 <= nx < sw and small[ny, nx] and labels[ny, nx] == 0:
                        labels[ny, nx] = cur
                        dq.append((ny, nx))
            # full-res bbox
            fx0, fy0, fx1, fy1 = minx*f, miny*f, (maxx+1)*f, (maxy+1)*f
            # trim precisely at full res
            sub = solid[fy0:fy1, fx0:fx1]
            ys, xs = np.where(sub)
            if len(ys) == 0:
                continue
            by0, by1 = fy0 + ys.min(), fy0 + ys.max() + 1
            bx0, bx1 = fx0 + xs.min(), fx0 + xs.max() + 1
            area = int(sub.sum())
            boxes.append((by0, bx0, by1, bx1, area))

# Merge boxes that overlap or nearly touch (sprite parts)
def overlaps(a, b, pad=4):
    ay0, ax0, ay1, ax1, _ = a
    by0, bx0, by1, bx1, _ = b
    return not (ax1 + pad < bx0 or bx1 + pad < ax0 or ay1 + pad < by0 or by1 + pad < ay0)

merged = True
while merged:
    merged = False
    out = []
    while boxes:
        b = boxes.pop()
        i = 0
        while i < len(boxes):
            if overlaps(b, boxes[i]):
                o = boxes.pop(i)
                b = (min(b[0], o[0]), min(b[1], o[1]), max(b[2], o[2]), max(b[3], o[3]), b[4]+o[4])
                merged = True
                i = 0
            else:
                i += 1
        out.append(b)
    boxes = out

boxes.sort(key=lambda b: (b[0] // 40, b[1]))
print(f"{len(boxes)} components")
for b in boxes:
    y0, x0, y1, x1, area = b
    print(f"y={y0:4d}-{y1:4d} x={x0:4d}-{x1:4d} w={x1-x0:3d} h={y1-y0:3d} area={area}")
