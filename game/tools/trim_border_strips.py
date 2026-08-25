#!/usr/bin/env python3
"""Trim light debris strips hugging the canvas borders.

Sheet slicing sometimes leaves a 1-2 px sliver of the neighbouring artwork
attached just outside a sprite's dark outline (e.g. a white line under the
question block). Such debris sits inside the outermost 2-px band of the
canvas, is light gray/white, and has darker material directly inward.

Rule: inside each 2-px border band, any run of >=4 consecutive light
(sat<=40, lum>=170) opaque pixels whose inward neighbours are NOT light
gets cleared to transparent. Interior content is never touched.

Run:  python3 tools/trim_border_strips.py [--apply]   (default: dry run)
"""
import os
import sys
import numpy as np
from PIL import Image

D = os.path.join(os.path.dirname(__file__), "..", "assets", "sprites")
APPLY = "--apply" in sys.argv

def light_mask(a):
    r, g, b, al = a[:,:,0], a[:,:,1], a[:,:,2], a[:,:,3]
    mx = np.maximum(np.maximum(r,g),b); mn = np.minimum(np.minimum(r,g),b)
    lum = (r*299 + g*587 + b*114)//1000
    return (al == 255) & ((mx-mn) <= 40) & (lum >= 200)

def clean(path):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).astype(np.int64)
    al = a[:,:,3].copy()
    light = light_mask(a)
    h, w = light.shape
    removed = 0
    bands = []
    bands.append((slice(0, 2), slice(None)))          # top
    bands.append((slice(h-2, h), slice(None)))       # bottom
    bands.append((slice(None), slice(0, 2)))         # left
    bands.append((slice(None), slice(w-2, w)))      # right
    for ys, xs in bands:
        band = light[ys, xs]
        sub = a[ys, xs]
        # inward neighbours (2 px further in)
        if ys.start == 0:   inner = light[2:4, :]
        elif ys.start == h-2: inner = light[h-4:h-2, :]
        elif xs.start == 0: inner = light[:, 2:4]
        else: inner = light[:, w-4:w-2]
        kill = band & ~inner
        n = int(kill.sum())
        if n:
            al[ys, xs] = np.where(kill, 0, al[ys, xs])
            removed += n
    if removed and APPLY:
        out = a.copy()
        out[:,:,3] = al
        Image.fromarray(out.astype(np.uint8)).save(path)
    return removed

total = 0
for fn in sorted(os.listdir(D)):
    if not fn.endswith(".png"):
        continue
    n = clean(os.path.join(D, fn))
    if n:
        print(f"{fn[:-4]:<16} {n:>5} px trimmed")
    total += n
print("total trimmed:", total)
if not APPLY:
    print("(dry run - pass --apply to write)")
