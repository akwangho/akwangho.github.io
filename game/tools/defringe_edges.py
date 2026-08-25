#!/usr/bin/env python3
"""Remove light-gray anti-aliasing specks from sprite silhouettes.

A "speck" is a connected component (area <= MAX_AREA) of fully-opaque,
low-saturation, high-luminance pixels that touch transparency. Such pixels
are slicing anti-aliasing leftovers, not artwork. Each speck pixel is
RECOLOURED to the most common opaque non-speck neighbour colour, so the
silhouette is preserved exactly - no holes, no size change.

Large light components (e.g. the ladder's white rails) and whitelisted
soft-edged art (fx_smoke) are left untouched.

Run:  python3 tools/defringe_edges.py [--apply]   (default: dry run)
"""
import os
import sys
from collections import Counter, deque
import numpy as np
from PIL import Image

D = os.path.join(os.path.dirname(__file__), "..", "assets", "sprites")
MAX_AREA = 8
WHITELIST = {"fx_smoke"}   # soft-edged art: light rim is intentional
APPLY = "--apply" in sys.argv

def shift(m, dy, dx):
    out = np.zeros_like(m)
    h, w = m.shape
    out[max(0,-dy):h-max(0,dy), max(0,-dx):w-max(0,dx)] = \
        m[max(0,dy):h+min(0,dy), max(0,dx):w+min(0,dx)]
    return out

def clean(path):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).astype(np.int64)
    r, g, b, al = a[:,:,0], a[:,:,1], a[:,:,2], a[:,:,3]
    t = al < 128
    adj_t = np.zeros_like(t)
    adj_t[1:, :] |= t[:-1, :]; adj_t[:-1, :] |= t[1:, :]
    adj_t[:, 1:] |= t[:, :-1]; adj_t[:, :-1] |= t[:, 1:]
    mx = np.maximum(np.maximum(r,g),b); mn = np.minimum(np.minimum(r,g),b)
    m = (al == 255) & adj_t & ((mx-mn) <= 30) & (((r*299+g*587+b*114)//1000) >= 140)
    h, w = m.shape
    seen = np.zeros_like(m)
    recoloured = 0
    for y in range(h):
        for x in range(w):
            if not m[y,x] or seen[y,x]:
                continue
            q = deque([(y,x)]); seen[y,x] = True; comp = [(y,x)]
            while q:
                cy,cx = q.popleft()
                for ny,nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                    if 0<=ny<h and 0<=nx<w and m[ny,nx] and not seen[ny,nx]:
                        seen[ny,nx]=True; q.append((ny,nx)); comp.append((ny,nx))
            if len(comp) > MAX_AREA:
                continue
            # target colour: most common *solid* (non-gray) opaque neighbour colour,
            # so we never repaint a speck with another gray
            votes = Counter()
            for cy,cx in comp:
                probes = [(cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)]
                if len(comp) <= 2:      # tiny specks may need a wider probe
                    probes += [(cy-1,cx-1),(cy-1,cx+1),(cy+1,cx-1),(cy+1,cx+1),
                               (cy-2,cx),(cy+2,cx),(cy,cx-2),(cy,cx+2)]
                for ny,nx in probes:
                    if 0<=ny<h and 0<=nx<w and al[ny,nx]==255 and not m[ny,nx]:
                        nsat = max(r[ny,nx],g[ny,nx],b[ny,nx]) - min(r[ny,nx],g[ny,nx],b[ny,nx])
                        nlum = (r[ny,nx]*299 + g[ny,nx]*587 + b[ny,nx]*114)//1000
                        if nsat > 30 or nlum < 140:
                            votes[(r[ny,nx], g[ny,nx], b[ny,nx])] += 1
            if not votes:
                continue
            (nr,ng,nb),_ = votes.most_common(1)[0]
            for cy,cx in comp:
                r[cy,cx], g[cy,cx], b[cy,cx] = nr, ng, nb
            recoloured += len(comp)
    if recoloured and APPLY:
        out = np.stack([r,g,b,al], axis=2).astype(np.uint8)
        Image.fromarray(out).save(path)
    return recoloured

total = 0
for fn in sorted(os.listdir(D)):
    if not fn.endswith(".png") or fn[:-4] in WHITELIST:
        continue
    file_total = 0
    for _ in range(4):
        n = clean(os.path.join(D, fn))
        file_total += n
        if n == 0:
            break
    if file_total:
        print(f"{fn[:-4]:<16} {file_total:>5} px recoloured")
    total += file_total
print("total recoloured:", total)
if not APPLY:
    print("(dry run - pass --apply to write)")
