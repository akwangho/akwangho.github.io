#!/usr/bin/env python3
"""Deep-clean every sprite in assets/sprites.

Conservative, evidence-based cleanup:
1. Snap every alpha value to fully transparent or fully opaque (kills any
   semi-transparent matte fringe; pixel-art should have hard edges).
2. Remove enclosed, perfectly flat pockets whose colour is essentially the
   original sheet background (246.5, 239, 221.5). Legit flat fills such as the
   enemies' eye whites (250,246,235) are deliberately OUTSIDE the tolerance.
3. Report everything; never touches shaded art content.

Run:  python3 tools/clean_sprites.py [--apply]   (default: dry run)
"""
import os
import sys
import numpy as np
from PIL import Image
from collections import deque

D = os.path.join(os.path.dirname(__file__), "..", "assets", "sprites")
BG = np.array([246.5, 239.0, 221.5])
APPLY = "--apply" in sys.argv

def clean(path):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).copy()
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    changed = {}

    # 1) alpha snap
    semi = (al > 0) & (al < 255)
    n_semi = int(semi.sum())
    if n_semi:
        al[semi] = np.where(al[semi] >= 128, 255, 0)
        changed["alpha_snapped"] = n_semi

    # 2) flat background-colour pockets (enclosed, uniform, ~exact bg)
    d = np.abs(r - BG[0]) + np.abs(g - BG[1]) + np.abs(b - BG[2])
    m = (al == 255) & (d <= 12)
    h, w = m.shape
    seen = np.zeros((h, w), bool)
    removed = 0
    for y in range(h):
        for x in range(w):
            if not m[y, x] or seen[y, x]:
                continue
            q = deque([(y, x)])
            seen[y, x] = True
            comp = []
            while q:
                cy, cx = q.popleft()
                comp.append((cy, cx))
                for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                    if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(comp) > 400:
                continue
            px = np.array([[r[y2, x2], g[y2, x2], b[y2, x2]] for y2, x2 in comp])
            if px.std(axis=0).max() < 1.5:  # perfectly flat fill only
                for y2, x2 in comp:
                    al[y2, x2] = 0
                removed += len(comp)
    if removed:
        changed["bg_pockets_removed"] = removed

    if changed and APPLY:
        Image.fromarray(a.astype(np.uint8)).save(path)
    return changed

total = {}
for fn in sorted(os.listdir(D)):
    if fn.endswith(".png"):
        ch = clean(os.path.join(D, fn))
        if ch:
            print(f"{fn[:-4]:<16} {ch}")
        for k, v in ch.items():
            total[k] = total.get(k, 0) + v
print("summary:", total if total else "all sprites already clean - nothing to change")
if not APPLY:
    print("(dry run - pass --apply to write changes)")
