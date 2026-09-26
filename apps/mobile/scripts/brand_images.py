#!/usr/bin/env python3
"""
Renders the Android app's brand images from the GO10 TV wordmark (the web
navbar's lime dot + "GO10 TV", Bricolage Grotesque ExtraBold, on the app
background): the launcher icon, the adaptive-icon foreground, the splash
mark and the Android TV launcher banner.

    python3 apps/mobile/scripts/brand_images.py [out_dir]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
FONT = ROOT / "node_modules/@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf"
DEFAULT_OUT = ROOT / "apps/mobile/assets/images"

# apps/web/src/styles/tokens.css
BG = (8, 9, 12, 255)
TEXT = (242, 244, 240, 255)
ACCENT = (198, 242, 78, 255)
CLEAR = (0, 0, 0, 0)


def draw_mark(image: Image.Image, lines: list[str], font_px: int) -> None:
    """Centres the wordmark: a lime dot before the first line; later lines in the accent colour."""
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(FONT), font_px)
    dot = round(font_px * 0.34)
    dot_gap = round(font_px * 0.2)
    line_gap = round(font_px * 0.14)
    boxes = [draw.textbbox((0, 0), line, font=font) for line in lines]
    heights = [bottom - top for _, top, _, bottom in boxes]
    widths = [right - left for left, _, right, _ in boxes]
    y = (image.height - (sum(heights) + line_gap * (len(lines) - 1))) / 2
    # One text column, the dot hanging in front of the first line: every line
    # is centred on the column, and the block (dot included) on the image.
    lead = dot + dot_gap
    column = max(widths)
    column_x = (image.width - (lead + column)) / 2 + lead
    for index, (line, (left, top, _, _)) in enumerate(zip(lines, boxes)):
        x = column_x + (column - widths[index]) / 2
        if index == 0:
            middle = y + heights[0] / 2
            draw.ellipse([x - lead, middle - dot / 2, x - dot_gap, middle + dot / 2], fill=ACCENT)
        draw.text((x - left, y - top), line, font=font, fill=TEXT if index == 0 else ACCENT)
        y += heights[index] + line_gap


def render(out_dir: Path) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    specs = {
        # Legacy launchers and Expo's `icon`: full bleed.
        "icon": ("icon.png", (1024, 1024), BG, ["GO10", "TV"], 250),
        # Adaptive foreground over `backgroundColor`: inside the 66 % safe zone.
        "adaptive": ("adaptive-icon.png", (1024, 1024), CLEAR, ["GO10", "TV"], 165),
        # expo-splash-screen's image, on the same background colour.
        "splash": ("splash-icon.png", (512, 512), CLEAR, ["GO10", "TV"], 120),
        # Android TV launcher banner (320x180 dp, drawn at xhdpi).
        "banner": ("tv-banner.png", (640, 360), BG, ["GO10 TV"], 104),
    }
    paths = {}
    for name, (file_name, size, background, lines, font_px) in specs.items():
        image = Image.new("RGBA", size, background)
        draw_mark(image, lines, font_px)
        path = out_dir / file_name
        image.save(path, optimize=True)
        paths[name] = path
    return paths


if __name__ == "__main__":
    for path in render(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT).values():
        print(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path)
