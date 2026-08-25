from PIL import Image
import os, math
d = "assets/sprites"
files = sorted(os.listdir(d))
cell = 140
cols = 8
rows = math.ceil(len(files) / cols)
sheet = Image.new("RGB", (cols * cell, rows * cell + 20), (60, 120, 220))
from PIL import ImageDraw
dr = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(os.path.join(d, f)).convert("RGBA")
    im.thumbnail((cell - 10, cell - 26))
    x, y = (i % cols) * cell, (i // cols) * cell
    sheet.paste(im, (x + 5, y + 22), im)
    dr.text((x + 4, y + 4), f.replace(".png", ""), fill=(255, 255, 255))
sheet.save("/var/folders/jm/hpzs129x3y53zdzvfjkkzmg80000gn/T/opencode/contact_blue.png")
print(len(files), "sprites")
