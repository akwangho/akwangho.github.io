#!/usr/bin/env python3
"""Fill enclosed transparent pockets inside sprites.

Any fully/partially transparent pixel that is NOT connected to the image
border through transparency is a see-through hole (slicing artefact): in-game
it renders as a background-coloured dot on top of the artwork. This tool
fills every such pocket onion-style - each hole pixel takes the most common
fully-opaque neighbour colour, peeling inward until the pocket is solid.

Border-connected transparency (the actual silhouette) is never touched.

Run:  python3 tools/fill_pockets.py [--apply]   (default: dry run)
"""
import os
import sys
from collections import Counter, deque
import numpy as np
from PIL import Image

D = os.path.join(os.path.dirname(__file__), "..", "assets", "sprites")
APPLY = "--apply" in sys.argv

def fill(path):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).astype(np.int64)
    r, g, b, al = a[:,:,0], a[:,:,1], a[:,:,2], a[:,:,3]
    t = al < 255
    h, w = t.shape
    outside = np.zeros_like(t)
    dq = deque()
    for x in range(w):
        for y in (0, h-1):
            if t[y,x] and not outside[y,x]: outside[y,x]=True; dq.append((y,x))
    for y in range(h):
        for x in (0, w-1):
            if t[y,x] and not outside[y,x]: outside[y,x]=True; dq.append((y,x))
    while dq:
        y,x = dq.popleft()
        for ny,nx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
            if 0<=ny<h and 0<=nx<w and t[ny,nx] and not outside[ny,nx]:
                outside[ny,nx]=True; dq.append((ny,nx))
    holes = t & ~outside
    n_hole = int(holes.sum())
    if not n_hole:
        return 0
    filled = 0
    while holes.any():
        # boundary hole pixels: hole px with >=2 fully-opaque neighbours
        op = al == 255
        def shift(m, dy, dx):
            out = np.zeros_like(m)
            out[max(0,-dy):h-max(0,dy), max(0,-dx):w-max(0,dx)] = \
                m[max(0,dy):h+min(0,dy), max(0,dx):w+min(0,dx)]
            return out
        opneigh = shift(op,1,0).astype(int)+shift(op,-1,0).astype(int)+ \
                  shift(op,0,1).astype(int)+shift(op,0,-1).astype(int)
        boundary = holes & (opneigh >= 2)
        if not boundary.any():
            boundary = holes & (opneigh >= 1)
        if not boundary.any():
            break
        ys, xs = np.nonzero(boundary)
        for y, x in zip(ys, xs):
            votes = Counter()
            for ny,nx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
                if 0<=ny<h and 0<=nx<w and al[ny,nx]==255:
                    votes[(r[ny,nx],g[ny,nx],b[ny,nx],al[ny,nx])] += 1
            (nr,ng,nb,na),_ = votes.most_common(1)[0]
            r[y,x], g[y,x], b[y,x], al[y,x] = nr, ng, nb, na
            holes[y,x] = False
            filled += 1
    if filled and APPLY:
        out = np.stack([r,g,b,al], axis=2).astype(np.uint8)
        Image.fromarray(out).save(path)
    return filled

total = 0
for fn in sorted(os.listdir(D)):
    if not fn.endswith(".png"):
        continue
    n = fill(os.path.join(D, fn))
    if n:
        print(f"{fn[:-4]:<16} {n:>5} px filled")
    total += n
print("total filled:", total)
if not APPLY:
    print("(dry run - pass --apply to write)")
