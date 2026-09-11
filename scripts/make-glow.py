#!/usr/bin/env python3

from PIL import Image, ImageFilter

SRC = "src/assets/favicon.png"
OUT = "public/glow-bg.png"
SCALE = 0.5
LOGO = int(1400 * SCALE)
PAD = int(150 * SCALE)
SIGMA = 40 * SCALE
CANVAS = LOGO + 2 * PAD
TOP = int((340 + 150) * SCALE)
HEIGHT = int(900 * SCALE)
FADE_START = int(80 * SCALE)
FADE_END = int(850 * SCALE)
OPACITY = 0.6


def main() -> None:
    src = Image.open(SRC).convert("RGBA").resize((LOGO, LOGO), Image.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(src, (PAD, PAD), src)
    canvas = canvas.filter(ImageFilter.GaussianBlur(SIGMA))

    glow = canvas.crop((0, TOP, CANVAS, TOP + HEIGHT))

    px = glow.load()
    for y in range(HEIGHT):
        if y <= FADE_START:
            k = 1.0
        elif y >= FADE_END:
            k = 0.0
        else:
            k = 1.0 - (y - FADE_START) / (FADE_END - FADE_START)
        k *= OPACITY
        for x in range(glow.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, int(a * k))

    glow.save(OUT, optimize=True)
    print(f"wrote {OUT} {glow.size}")


if __name__ == "__main__":
    main()
