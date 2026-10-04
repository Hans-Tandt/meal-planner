"""Turns the raw screenshots into the manual's figures.

Run after shoot.mjs:   py manual/figures/annotate.py
- draws a gold box + navy numbered circle around each marker (positions come from raw/meta.json)
- puts two screens side by side where one figure shows a two-step flow
- writes the small mascot pictures used on the cover and beside TIP / NOTE / TRAP
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
RAW = HERE / "raw"
OUT = HERE
APP_IMG = HERE.parent.parent / "app" / "img"

NAVY = (31, 58, 95)
GOLD = (183, 137, 43)
FRAME = (200, 208, 220)
FONT = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 30)
ARROW_FONT = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 90)

meta = json.loads((RAW / "meta.json").read_text(encoding="utf-8"))


def annotate(name):
    """Raw screenshot with its markers drawn on, plus a thin frame."""
    im = Image.open(RAW / f"{name}.png").convert("RGB")
    info = meta[name]
    ox, oy = (info["clip"]["x"], info["clip"]["y"]) if info["clip"] else (0, 0)
    scale = im.width / (info["clip"]["width"] if info["clip"] else 390)
    d = ImageDraw.Draw(im)
    for m in info["markers"]:
        pad = 6
        x0 = (m["x"] - ox - pad) * scale
        y0 = (m["y"] - oy - pad) * scale
        x1 = (m["x"] - ox + m["w"] + pad) * scale
        y1 = (m["y"] - oy + m["h"] + pad) * scale
        x0, y0 = max(x0, 3), max(y0, 3)
        x1, y1 = min(x1, im.width - 4), min(y1, im.height - 4)
        d.rounded_rectangle((x0, y0, x1, y1), radius=18, outline=GOLD, width=6)
        r = 25
        cx = min(max(x0, r + 4), im.width - r - 4)
        cy = min(max(y0, r + 4), im.height - r - 4)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=NAVY, outline="white", width=4)
        d.text((cx, cy), str(m["n"]), font=FONT, fill="white", anchor="mm")
    if info.get("crop"):  # keep only the open panel
        top = max(0, round(info["crop"]["top"] * scale))
        bottom = min(im.height, round(info["crop"]["bottom"] * scale))
        im = im.crop((0, top, im.width, bottom))
    framed = Image.new("RGB", (im.width + 6, im.height + 6), FRAME)
    framed.paste(im, (3, 3))
    return framed


def side_by_side(left, right, gap=120):
    h = max(left.height, right.height)
    out = Image.new("RGB", (left.width + gap + right.width, h), "white")
    out.paste(left, (0, 0))
    out.paste(right, (left.width + gap, 0))
    d = ImageDraw.Draw(out)
    d.text((left.width + gap / 2, h / 2), "\u2192", font=ARROW_FONT, fill=GOLD, anchor="mm")
    return out


figures = {
    "fig_week": annotate("week"),
    "fig_add_meal": side_by_side(annotate("day-empty"), annotate("editor")),
    "fig_day": annotate("day-quick"),
    "fig_plan": side_by_side(annotate("plan"), annotate("confirm")),
    "fig_shop": annotate("shop"),
    "fig_identify": annotate("identify"),
    "fig_menu": annotate("menu"),
    "fig_lock": annotate("lock"),
}
for name, im in figures.items():
    im.save(OUT / f"{name}.png", optimize=True)
    print(name, im.size)

# Clean three-screen picture for the GitHub README (no markers)
screens = [Image.open(RAW / f"{n}.png").convert("RGB") for n in ("week", "plan", "shop")]
gap = 40
row = Image.new("RGB", (sum(s.width for s in screens) + gap * 2, screens[0].height), "white")
x = 0
for s_im in screens:
    framed = Image.new("RGB", (s_im.width, s_im.height), FRAME)
    framed.paste(s_im.crop((2, 2, s_im.width - 2, s_im.height - 2)), (2, 2))
    row.paste(framed, (x, 0))
    x += s_im.width + gap
row = row.resize((row.width // 2, row.height // 2), Image.LANCZOS)
docs = HERE.parent.parent / "docs"
docs.mkdir(exist_ok=True)
row.save(docs / "screenshots.png", optimize=True)
print("docs/screenshots.png", row.size)

# Mascot pictures (transparent PNG, small files)
mascot = OUT / "mascot"
mascot.mkdir(exist_ok=True)
for pose, h, out in (("wave", 640, "cover"), ("happy", 240, "tip"), ("main", 240, "note"), ("thinking", 240, "trap")):
    im = Image.open(APP_IMG / f"chef-{pose}-512.webp").convert("RGBA")
    im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS) if h < im.height else im
    im.save(mascot / f"{out}.png", optimize=True)
    print("mascot", out, im.size)
