"""Draws the 'PC -> Netlify -> phone' diagram for Appendix B.
Run:  py manual/figures/make_diagram.py   -> manual/figures/fig_deploy.png
Pillow + Arial (LibreOffice's SVG import distorts arrows; see the skill's CONVENTIONS.md).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

S = 2                       # draw at 2x for a sharp print
W, H = 900, 250
NAVY, GOLD, GREEN = (31, 58, 95), (183, 137, 43), (46, 125, 50)
TINT, TEXT = (227, 233, 241), (26, 26, 26)
F_TITLE = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 21 * S)
F_BODY = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16 * S)
F_NUM = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 18 * S)
F_ARROW = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 15 * S)

im = Image.new("RGB", (W * S, H * S), "white")
d = ImageDraw.Draw(im)

boxes = [
    (20, "1", "Your PC", ["The folder named app", "(page, pictures, icons)"]),
    (330, "2", "Netlify", ["Puts the folder online", "at one web address"]),
    (640, "3", "Phones", ["Open the web address", "in Brave (Appendix A)"]),
]
BW, BY, BH = 240, 55, 150
for x, n, title, lines in boxes:
    d.rounded_rectangle((x * S, BY * S, (x + BW) * S, (BY + BH) * S), radius=14 * S, fill=TINT, outline=NAVY, width=2 * S)
    cx, cy = (x + 22) * S, (BY) * S
    d.ellipse((cx - 17 * S, cy - 17 * S, cx + 17 * S, cy + 17 * S), fill=NAVY, outline="white", width=3 * S)
    d.text((cx, cy), n, font=F_NUM, fill="white", anchor="mm")
    d.text(((x + BW / 2) * S, (BY + 45) * S), title, font=F_TITLE, fill=NAVY, anchor="mm")
    for i, line in enumerate(lines):
        d.text(((x + BW / 2) * S, (BY + 85 + i * 26) * S), line, font=F_BODY, fill=TEXT, anchor="mm")

def arrow(x0, x1, y, label):
    d.line((x0 * S, y * S, (x1 - 12) * S, y * S), fill=GOLD, width=4 * S)
    d.polygon([((x1) * S, y * S), ((x1 - 16) * S, (y - 9) * S), ((x1 - 16) * S, (y + 9) * S)], fill=GOLD)
    d.text(((x0 + x1) / 2 * S, (y - 20) * S), label, font=F_ARROW, fill=NAVY, anchor="mm")

arrow(262, 328, 130, "drag")
arrow(572, 638, 130, "address")

im.save(Path(__file__).with_name("fig_deploy.png"), optimize=True)
print("fig_deploy.png", im.size)
