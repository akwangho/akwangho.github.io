from PIL import Image
for name in ["idle", "powerup", "face1", "tile_qblock"]:
    im = Image.open(f"assets/sprites/{name}.png").convert("RGBA")
    s = 3 if im.width < 160 else 2
    big = im.resize((im.width * s, im.height * s), Image.NEAREST)
    canvas = Image.new("RGB", (big.width + 20, big.height + 20), (60, 120, 220))
    canvas.paste(big, (10, 10), big)
    canvas.save(f"/var/folders/jm/hpzs129x3y53zdzvfjkkzmg80000gn/T/opencode/chk_{name}.png")
print("ok")
