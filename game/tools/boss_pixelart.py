#!/usr/bin/env python3
"""像素風 Boss 素材產生器。

為四位 Boss 各產生 32x32（放大 6 倍輸出 192x192）的像素畫影格：
  idle（基本待機，沿用原檔名）、_walk、_atk
以及專屬彈幕素材：proj_carrot / proj_star / proj_flame。
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "sprites")
N = 32          # 邏輯解析度
SCALE = 6       # 輸出 192x192


class Px:
    """低解析度像素畫布。"""

    def __init__(self, n=N):
        self.n = n
        self.buf = [[None] * n for _ in range(n)]

    def dot(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.n and 0 <= y < self.n:
            self.buf[y][x] = c

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.dot(xx, yy, c)

    def ell(self, cx, cy, rx, ry, c):
        for yy in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for xx in range(int(cx - rx) - 1, int(cx + rx) + 2):
                dx, dy = xx - cx, yy - cy
                if (dx / max(rx, 0.01)) ** 2 + (dy / max(ry, 0.01)) ** 2 <= 1.0:
                    self.dot(xx, yy, c)

    def tri(self, x, y, w, h, c, flip=False):
        for r in range(h):
            ww = max(1, int(w * (r + 1) / h))
            sx = x + w - ww if flip else x
            self.rect(sx, y + r, ww, 1, c)

    def render(self, path):
        im = Image.new("RGBA", (self.n, self.n), (0, 0, 0, 0))
        dr = ImageDraw.Draw(im)
        for y in range(self.n):
            for x in range(self.n):
                c = self.buf[y][x]
                if c:
                    dr.point((x, y), fill=c)
        im = im.resize((self.n * SCALE, self.n * SCALE), Image.NEAREST)
        im.save(os.path.join(OUT, path))
        return im


def preview(im, name, w=16):
    """ASCII 預覽，供主控台快速目檢。"""
    small = im.resize((w, w))
    ramp = " .:-=+*#%@"
    px = small.load()
    print(f"-- {name}")
    for y in range(w):
        line = ""
        for x in range(w):
            r, g, b, a = px[x, y]
            lum = (0.3 * r + 0.5 * g + 0.2 * b) / 255 if a > 60 else 0
            line += ramp[min(9, int(lum * 9.99))]
        print("   " + line)


# ---------------- 彼得兔（棕兔＋藍外套｜紅蘿蔔飛彈） ----------------
CK_R = dict(B=(74, 46, 22), b=(198, 142, 84), W=(248, 248, 248),
            J=(38, 88, 190), j=(86, 128, 224), P=(226, 90, 118),
            K=(24, 20, 18), C=(238, 126, 24), G=(52, 158, 52))


def rabbit(px, pose="idle"):
    ck = CK_R
    lean = {"idle": 0, "walk": 2, "atk": 3}[pose]
    # 耳朵
    for i in range(9):
        px.dot(11 + i * 0.4 - (2 if pose != "idle" else 0), 10 - i, ck["B"])
        px.dot(20 - i * 0.3 + (2 if pose == "atk" else 0), 10 - i, ck["B"])
        px.dot(11.5 + i * 0.35, 9.5 - i, ck["b"])
        px.dot(19.5 - i * 0.25, 9.5 - i, ck["b"])
    # 頭
    px.ell(16 + lean * 0.4, 13, 7, 6, ck["b"])
    px.rect(9, 13, 15, 2, ck["b"])
    px.dot(13 + lean, 12, ck["K"]); px.dot(19 + lean, 12, ck["K"])
    px.rect(15 + lean, 15, 3, 2, ck["W"]); px.dot(16 + lean, 15, ck["P"])
    if pose == "atk":                                   # 張嘴
        px.rect(14 + lean, 17, 5, 2, (90, 40, 30))
    # 身體（藍外套）
    px.ell(16 + lean, 21, 6, 5, ck["J"])
    px.rect(10 + lean, 19, 12, 5, ck["J"])
    for yy in range(18, 25):
        px.dot(16 + lean, yy, ck["j"])
    # 手臂
    if pose == "atk":                                   # 投擲紅蘿蔔
        px.rect(22 + lean, 17, 6, 2, ck["J"])
        px.tri(27 + lean, 14, 4, 5, ck["C"], flip=True)
        px.rect(29 + lean, 12, 2, 3, ck["G"])
    elif pose == "walk":
        px.rect(9 + lean, 20, 3, 2, ck["J"]); px.rect(21 + lean, 21, 3, 2, ck["J"])
    else:
        px.rect(9, 20, 2, 4, ck["J"]); px.rect(22, 20, 2, 4, ck["J"])
    # 腳
    if pose == "walk":
        px.ell(13, 27, 3, 2, ck["W"]); px.ell(20, 26, 3, 2, ck["W"])
    else:
        px.ell(13, 27, 3, 2, ck["W"]); px.ell(19, 27, 3, 2, ck["W"])


# ---------------- 西施惠（黃狗｜星星扇形） ----------------
CK_S = dict(Y=(232, 198, 74), y=(248, 232, 160), W=(250, 250, 245),
            R=(214, 48, 82), K=(30, 24, 20), P=(244, 160, 168),
            N=(122, 82, 44))


def shih(px, pose="idle"):
    ck = CK_S
    bob = 1 if pose == "walk" else 0
    # 耳朵（垂耳）
    px.ell(9, 12 + bob, 2.4, 4.5, ck["y"])
    px.ell(23, 12 + bob, 2.4, 4.5, ck["y"])
    # 頭
    px.ell(16, 13 + bob, 7, 6.4, ck["Y"])
    px.ell(16, 16 + bob, 4.6, 3.4, ck["W"])              # 白吻部
    px.dot(13, 12 + bob, ck["K"]); px.dot(19, 12 + bob, ck["K"])
    px.dot(11, 15 + bob, ck["P"]); px.dot(21, 15 + bob, ck["P"])
    px.dot(16, 15 + bob, ck["N"])
    px.ell(16, 6 + bob, 2.2, 2.2, ck["Y"])               # 頂髻
    px.dot(16, 5 + bob, ck["R"])                          # 玫瑰髮飾
    # 身體（洋裝）
    px.ell(16, 21 + bob, 5, 5, ck["Y"])
    px.rect(12, 19 + bob, 9, 2, ck["W"])                  # 白領
    px.tri(11, 22 + bob, 11, 6, ck["Y"])
    # 手臂
    if pose == "atk":                                     # 雙手張開放禮炮
        px.rect(6, 15, 5, 2, ck["Y"]); px.rect(22, 15, 5, 2, ck["Y"])
        px.tri(4, 13, 4, 4, ck["R"], flip=True)
        px.tri(25, 13, 4, 4, ck["R"])
        for sx, sy in [(3, 10), (28, 10), (6, 8), (25, 8)]:
            px.dot(sx, sy, (255, 224, 96)); px.dot(sx, sy - 1, (255, 255, 210))
    elif pose == "walk":
        px.rect(10, 20 + bob, 3, 2, ck["Y"]); px.rect(20, 19 + bob, 3, 2, ck["Y"])
    else:
        px.rect(10, 20, 2, 4, ck["Y"]); px.rect(21, 20, 2, 4, ck["Y"])
    # 腳
    px.ell(14, 28 + bob, 2.6, 1.8, ck["W"]); px.ell(18, 28 + bob, 2.6, 1.8, ck["W"])


# ---------------- 野貓軍團（灰紋貓｜衝刺撲擊） ----------------
CK_C = dict(G=(108, 116, 124), g=(168, 176, 184), D=(56, 62, 70),
            W=(246, 246, 240), K=(20, 18, 16), E=(120, 220, 96),
            P=(232, 120, 120))


def cats(px, pose="idle"):
    ck = CK_C
    squash = 3 if pose == "atk" else 0
    # 耳朵（三角）
    px.tri(9, 5 + squash // 2, 5, 5, ck["G"])
    px.tri(18, 5 + squash // 2, 5, 5, ck["G"], flip=True)
    px.tri(10, 6 + squash // 2, 3, 3, ck["P"])
    px.tri(19, 6 + squash // 2, 3, 3, ck["P"], flip=True)
    # 頭
    hy = 12 + squash
    px.ell(16, hy, 8, 6.5 - squash * 0.4, ck["G"])
    for sx in (13, 17, 21):                               # 條紋
        px.dot(sx, hy - 5, ck["D"]); px.dot(sx, hy - 4, ck["D"])
    px.dot(12, hy - 1, ck["E"]); px.dot(20, hy - 1, ck["E"])
    px.dot(13, hy, ck["K"]); px.dot(19, hy, ck["K"])
    px.rect(13, hy + 3, 7, 1, ck["W"])                    # 壞笑牙
    px.dot(16, hy + 2, ck["P"])
    # 身體
    by = 20 + squash
    px.ell(16, by, 7, 5 - squash * 0.5, ck["g"])
    for sx in (12, 17, 22):
        px.dot(sx, by - 1, ck["D"]); px.dot(sx, by + 1, ck["D"])
    # 尾巴
    if pose == "walk":
        for i in range(7): px.dot(25 - i * 0.4, by - 4 - i * 0.6, ck["G"])
    else:
        for i in range(6): px.dot(25, by - 1 - i, ck["G"])
    # 手／爪
    if pose == "atk":                                     # 前伸利爪
        px.rect(23, by - 2, 6, 2, ck["g"])
        for i in range(4): px.dot(29, by - 3 + i * 1.4, ck["W"])
    else:
        px.rect(9, by, 2, 3, ck["g"]); px.rect(22, by, 2, 3, ck["g"])
    # 腳
    px.ell(12, 27 + squash, 3, 2, ck["G"]); px.ell(20, 27 + squash, 3, 2, ck["G"])


# ---------------- 庫巴（龜王｜火焰吐息） ----------------
CK_B = dict(G=(66, 156, 56), D=(40, 104, 36), S=(232, 216, 160),
            O=(240, 160, 72), Y=(248, 232, 176), R=(192, 48, 40),
            W=(250, 250, 250), K=(20, 16, 14), F=(255, 144, 32), f=(255, 224, 96))


def bowser(px, pose="idle"):
    ck = CK_B
    open_mouth = pose == "atk"
    # 殼
    px.ell(14, 21, 9, 8, ck["G"])
    px.ell(14, 21, 6.5, 5.5, ck["S"])
    for sx in (7, 14, 21):                                # 殼釘
        px.tri(sx - 2, 11, 4, 4, ck["W"])
    # 頭
    px.ell(22, 11, 6, 5.4, ck["G"])
    px.ell(26, 13, 3.4, 2.6, ck["O"])                     # 吻部
    px.tri(18, 4, 3, 4, ck["Y"])                          # 角
    px.tri(24, 3, 3, 4, ck["Y"])
    px.rect(20, 8, 6, 2, ck["R"])                         # 紅髮
    px.dot(22, 10, ck["K"])
    if open_mouth:
        px.rect(24, 14, 6, 3, (120, 30, 24))              # 張口
        for i in range(5):                                # 噴出的火焰
            px.dot(30 + i * 0.8, 13 + (i % 2), ck["F"])
            px.dot(30 + i * 0.8, 14, ck["f"])
    else:
        px.rect(25, 14, 4, 1, (120, 30, 24))
    # 四肢
    px.ell(8, 27, 3.4, 2.4, ck["G"]); px.ell(19, 27, 3.4, 2.4, ck["G"])
    if pose == "walk":
        px.ell(6, 26, 3, 2.2, ck["G"]); px.ell(21, 28, 3, 2.2, ck["G"])
    px.rect(4, 18, 3, 5, ck["G"])                         # 左臂
    if pose != "atk":
        px.rect(24, 18, 3, 4, ck["G"])                    # 右臂（張口時讓位給火焰）


JOBS = [
    ("boss_rabbit", rabbit),
    ("boss_shih", shih),
    ("boss_cats", cats),
    ("boss_bowser", bowser),
]

for name, painter in JOBS:
    for pose, suffix in [("idle", ""), ("walk", "_walk"), ("atk", "_atk")]:
        px = Px()
        painter(px, pose)
        im = px.render(f"{name}{suffix}.png")
        preview(im, f"{name}{suffix}", w=14)

# ---------------- 彈幕素材 ----------------
px = Px(16)                                                 # 紅蘿蔔
for i in range(8):
    px.rect(3 + i // 2, 4 + i, max(1, 6 - i // 2), 1, (238, 126, 24))
px.rect(2, 2, 3, 3, (52, 158, 52)); px.dot(5, 2, (52, 158, 52))
preview(px.render("proj_carrot.png"), "proj_carrot", w=10)

px = Px(16)                                                 # 星星
cx = cy = 7
for i in range(-6, 7):
    w = 2 if abs(i) > 4 else 5 - abs(i)
    px.rect(cx - w, cy + i, w * 2, 1, (255, 214, 64))
px.rect(cx - 1, cy - 6, 2, 3, (255, 214, 64)); px.rect(cx - 1, cy + 4, 2, 3, (255, 214, 64))
preview(px.render("proj_star.png"), "proj_star", w=10)

px = Px(16)                                                 # 火焰
for i in range(9):
    w = max(1, 5 - i // 2)
    px.rect(8 - w // 2, 3 + i, w, 1, (255, 144, 32))
for i in range(4):
    px.rect(7 - i // 3, 6 + i, max(1, 3 - i), 1, (255, 224, 96))
preview(px.render("proj_flame.png"), "proj_flame", w=10)

print("pixel boss sprites generated ->", OUT)
