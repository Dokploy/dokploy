"""Generates assets/og.png, the 1200x630 social preview used by the public site.

Run from the repository root:

    python scripts/generate-og-image.py

Needs Pillow. Uses Segoe UI (Windows) and falls back to Arial or DejaVu Sans.
The image is text on a dark background; it deliberately does not use the
upstream Dokploy logo. `scripts/` is excluded from the Jekyll build.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1200, 630
BACKGROUND = (11, 13, 18)
PANEL = (20, 24, 33)
ACCENT = (99, 102, 241)
TITLE_COLOR = (244, 246, 250)
SUBTITLE_COLOR = (170, 178, 194)
FOOTER_COLOR = (120, 128, 146)

TITLE = "Dokploy Community Edition"
SUBTITLE = (
    "The self-hosted Dokploy fork: upstream fixes shipped early, "
    "built-in MCP server, native integrations"
)
FOOTER = "dokploy-community.devino.ca"

FONT_DIRS = [
    Path("C:/Windows/Fonts"),
    Path("/usr/share/fonts/truetype/dejavu"),
    Path("/Library/Fonts"),
]
BOLD_CANDIDATES = ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]
REGULAR_CANDIDATES = ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"]


def load_font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont:
    for directory in FONT_DIRS:
        for name in candidates:
            path = directory / name
            if path.exists():
                return ImageFont.truetype(str(path), size)
    raise SystemExit(f"None of the fonts {candidates} were found in {FONT_DIRS}")


def wrap(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def main() -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)

    # Inset panel with an accent bar on the left edge.
    draw.rounded_rectangle(
        (48, 48, WIDTH - 48, HEIGHT - 48), radius=28, fill=PANEL
    )
    draw.rounded_rectangle((48, 48, 62, HEIGHT - 48), radius=7, fill=ACCENT)

    left = 112
    max_width = WIDTH - left - 112

    title_font = load_font(BOLD_CANDIDATES, 74)
    subtitle_font = load_font(REGULAR_CANDIDATES, 40)
    footer_font = load_font(REGULAR_CANDIDATES, 30)

    title_lines = wrap(draw, TITLE, title_font, max_width)
    subtitle_lines = wrap(draw, SUBTITLE, subtitle_font, max_width)

    title_height = 96
    subtitle_height = 56
    block_height = len(title_lines) * title_height + 24 + len(subtitle_lines) * subtitle_height
    y = (HEIGHT - block_height) // 2 - 20

    for line in title_lines:
        draw.text((left, y), line, font=title_font, fill=TITLE_COLOR)
        y += title_height
    y += 24
    for line in subtitle_lines:
        draw.text((left, y), line, font=subtitle_font, fill=SUBTITLE_COLOR)
        y += subtitle_height

    draw.text((left, HEIGHT - 48 - 40 - 30), FOOTER, font=footer_font, fill=FOOTER_COLOR)

    output = Path(__file__).resolve().parent.parent / "assets" / "og.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True)
    print(f"wrote {output} ({output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
