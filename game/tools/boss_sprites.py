#!/usr/bin/env python3
"""Process the four character images from ~/Downloads into boss sprites.

- removes near-uniform backgrounds via border flood-fill (skipped when the
  source already has transparency)
- auto-crops to content, pads to square, resizes to 192x192
"""
import os
from collections import deque
from PIL import Image

DL = os.path.expanduser("~/Downloads")
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "sprites")
TARGET = 192

JOBS = [
    ("boss_rabbit.png", os.path.join(DL, "比得兔.jpg"), "medallion"),
    ("boss_shih.png",   os.path.join(DL, "西施惠.webp"), "cutout"),
    ("boss_cats.png",   os.path.join(DL, "野貓軍團.png"), "cutout"),
    ("boss_bowser.png", os.path.join(DL, "庫巴.png"), "cutout"),
]

def remove_border_bg(im, tol=60):
    """Flood-fill from borders over colours close to the median border colour."""
    im = im.convert("RGBA")
    w, h = im.size
    src = im.load()
    border = []
    for x in range(0, w, max(1, w // 60)):
        border.append(src[x, 0]); border.append(src[x, h - 1])
    for y in range(0, h, max(1, h // 60)):
        border.append(src[0, y]); border.append(src[w - 1, y])
    opaque = [c for c in border if c[3] >= 128]
    if len(opaque) / max(1, len(border)) < 0.4:
        return im, 0.0                      # already mostly transparent
    med = sorted(opaque, key=lambda c: sum(c[:3]))[len(opaque) // 2]
    def close(c):
        return abs(c[0]-med[0]) + abs(c[1]-med[1]) + abs(c[2]-med[2]) <= tol
    seen = bytearray(w * h)
    dq = deque()
    for x in range(w):
        for y in (0, h-1):
            i = y*w+x
            if not seen[i] and close(src[x,y]): seen[i]=1; dq.append((y,x))
    for y in range(h):
        for x in (0, w-1):
            i = y*w+x
            if not seen[i] and close(src[x,y]): seen[i]=1; dq.append((y,x))
    while dq:
        y,x = dq.popleft()
        for ny,nx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
            if 0<=ny<h and 0<=nx<w:
                i = ny*w+nx
                if not seen[i] and close(src[nx,ny]):
                    seen[i]=1; dq.append((ny,nx))
    removed = 0
    for i in range(w*h):
        if seen[i]:
            src[i%w, i//w] = (0,0,0,0); removed += 1
    return im, removed/(w*h)

def autocrop(im):
    bb = im.getchannel("A").getbbox()
    return im.crop(bb) if bb else im

def squareize(im, size=TARGET):
    w, h = im.size
    side = max(w, h)
    s = min(1.0, size / side)
    im = im.resize((max(1,int(w*s)), max(1,int(h*s))), Image.LANCZOS)
    w, h = im.size
    out = Image.new("RGBA", (size, size), (0,0,0,0))
    out.alpha_composite(im, ((size-w)//2, (size-h)//2))
    return out

from PIL import ImageDraw

def medallion(im, size=TARGET):
    im = squareize(im.convert('RGBA'), size)
    out = Image.new("RGBA", (size, size), (0,0,0,0))
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((4, 4, size-4, size-4), fill=255)
    out.paste(im, (0, 0), mask)
    d2 = ImageDraw.Draw(out)
    d2.ellipse((3, 3, size-3, size-3), outline=(46,26,12,255), width=6)
    return out

for out_name, srcp, mode in JOBS:
    if not os.path.exists(srcp):
        print(f"MISSING source for {out_name}: {srcp}")
        continue
    im = Image.open(srcp)
    im.load()
    if mode == "medallion":
        fin = medallion(im.convert("RGB"))
        fin.save(os.path.join(OUT, out_name))
        print(f"{out_name:<18} medallion {fin.size}")
        continue
    im, frac = remove_border_bg(im)
    im2 = autocrop(im)
    opaque_px = sum(1 for p in im2.getchannel("A").getdata() if p >= 128)
    cov = opaque_px / (im2.size[0]*im2.size[1])
    fin = squareize(im2, TARGET)
    fin.save(os.path.join(OUT, out_name))
    print(f"{out_name:<18} bg_removed={frac:.0%} content_coverage={cov:.0%} final={fin.size}")
