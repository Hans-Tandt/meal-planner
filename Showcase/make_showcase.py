"""Builds the Meal Planner showcase for hanstandt.be: 5 phone screens per language, no markers.

Source: the raw screenshots made by manual/figures/shoot.mjs (sample data only, "today" frozen),
so run that first for each language:  node manual/figures/shoot.mjs <en|fr|nl|de>
Run:  py Showcase/make_showcase.py   -> Showcase/<LANG>/NN_Name.png + .webp, and 00_Overview.png
"""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).parent
RAW = HERE.parent / "manual" / "figures" / "raw"
SCREENS = [("01_Week", "week"), ("02_AI_week_plan", "plan"), ("03_Shopping_list", "shop"),
           ("04_Choose_your_AI", "aikey"), ("05_Lock_screen", "lock")]
FRAME = (200, 208, 220)
WEB_WIDTH = 640           # gallery images on the site are 50-85 KB; this keeps a phone screen near that

for lang in ("en", "fr", "nl", "de"):
    out = HERE / lang.upper()
    out.mkdir(exist_ok=True)
    tiles = []
    for name, raw in SCREENS:
        im = Image.open(RAW / lang / f"{raw}.png").convert("RGB")
        framed = Image.new("RGB", (im.width + 4, im.height + 4), FRAME)
        framed.paste(im, (2, 2))
        framed.save(out / f"{name}.png", optimize=True)
        web = framed.resize((WEB_WIDTH, round(framed.height * WEB_WIDTH / framed.width)), Image.LANCZOS)
        web.save(out / f"{name}.webp", "WEBP", quality=80, method=6)
        tiles.append(framed)
    # 00: all screens on one picture
    gap, h = 40, 1100
    small = [t.resize((round(t.width * h / t.height), h), Image.LANCZOS) for t in tiles]
    sheet = Image.new("RGB", (sum(t.width for t in small) + gap * (len(small) + 1), h + 2 * gap), "white")
    x = gap
    for t in small:
        sheet.paste(t, (x, gap))
        x += t.width + gap
    sheet.save(out / "00_Overview.png", optimize=True)
    sizes = [(f.name, f.stat().st_size // 1024) for f in sorted(out.glob("*.webp"))]
    print(lang, sizes)
