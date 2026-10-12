"""Crops and annotates the Netlify screenshots for Appendix B.

The raw screenshots (manual/figures/netlify/raw/*.jpg) were taken in Chrome at 1568x749 with the
owner's details replaced by placeholders (project "our-meal-planner", team "My team", "Your name",
"you@example.com", project ID xxxx...) before capture. Netlify's screens exist in English only,
so these figures serve every language of the manual.

Run:  py manual/figures/netlify.py   -> manual/figures/netlify/fig_nf_*.png
Coordinates below are in the raw 1568x749 frame.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent / "netlify"
RAW = HERE / "raw"
NAVY, GOLD, FRAME = (31, 58, 95), (183, 137, 43), (200, 208, 220)
S = 2  # upscale for a sharp print
FONT = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 15 * S)

FIGS = {
    # name: (raw file, crop box, [(n, box)], [cover boxes (painted with a nearby colour)])
    "fig_nf_projects": ("projects", (0, 0, 1390, 495), [
        (1, (14, 140, 212, 163)),
        (2, (270, 301, 1359, 470)),
    ], []),
    "fig_nf_overview": ("overview", (55, 45, 995, 430), [
        (1, (423, 86, 614, 107)),
        (2, (253, 177, 424, 206)),
        (3, (758, 252, 975, 422)),
    ], []),
    "fig_nf_config": ("config-name", (60, 90, 1215, 612), [
        (1, (79, 145, 139, 172)),
        (2, (273, 569, 427, 598)),
    ], []),
    "fig_nf_rename": ("rename", (530, 220, 1024, 530), [
        (1, (550, 323, 1003, 354)),
        (2, (550, 358, 745, 374)),
        (3, (551, 479, 604, 508)),
    ], [((916, 300, 1040, 321), (900, 290)), ((962, 328, 997, 350), (930, 338))]),   # password-manager tooltip + icon: (box, colour sample point)
    "fig_nf_visibility": ("visibility", (60, 80, 1215, 525), [
        (1, (79, 148, 233, 172)),
        (2, (273, 357, 1188, 381)),
        (3, (273, 470, 375, 499)),
    ], []),
    "fig_nf_deploys": ("deploys", (55, 45, 1390, 630), [
        (1, (66, 149, 125, 171)),
        (2, (273, 330, 401, 349)),
        (3, (273, 448, 1362, 615)),
    ], []),
}

for name, (raw, crop, marks, covers) in FIGS.items():
    im = Image.open(RAW / f"{raw}.jpg").convert("RGB")
    d = ImageDraw.Draw(im)
    for box, sample in covers:
        d.rectangle(box, fill=im.getpixel(sample))
    if raw == "rename":   # the tooltip hid part of the input's top border: redraw it in the border's colour
        border = im.getpixel((600, 322))
        d.rectangle((760, 322, 1001, 323), fill=border)
        d.rectangle((1000, 322, 1001, 352), fill=border)
    cx0, cy0, cx1, cy1 = crop
    im = im.crop(crop).resize(((cx1 - cx0) * S, (cy1 - cy0) * S), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    for n, (x0, y0, x1, y1) in marks:
        pad = 5
        bx0, by0 = (x0 - cx0 - pad) * S, (y0 - cy0 - pad) * S
        bx1, by1 = (x1 - cx0 + pad) * S, (y1 - cy0 + pad) * S
        bx0, by0 = max(bx0, 3), max(by0, 3)
        bx1, by1 = min(bx1, im.width - 4), min(by1, im.height - 4)
        d.rounded_rectangle((bx0, by0, bx1, by1), radius=8 * S, outline=GOLD, width=3 * S)
        r = 13 * S
        ccx = min(max(bx0, r + 4), im.width - r - 4)
        ccy = min(max(by0, r + 4), im.height - r - 4)
        d.ellipse((ccx - r, ccy - r, ccx + r, ccy + r), fill=NAVY, outline="white", width=2 * S)
        d.text((ccx, ccy), str(n), font=FONT, fill="white", anchor="mm")
    framed = Image.new("RGB", (im.width + 6, im.height + 6), FRAME)
    framed.paste(im, (3, 3))
    framed.save(HERE / f"{name}.png", optimize=True)
    print(name, framed.size)
