"""WCAG 2.1 contrast of every text and outline pair in palette.json (research R1).

Usage: python contrast.py palette.json
Each pair is printed; "FAILS: none" when every pair is at or above its threshold.
"""

import json
import sys

TEXT = ["ink", "muted", "primary-text", "credit-text", "debt-text"]
GROUNDS = ["bg", "surface", "surface-2"]
# (foreground, background, minimum ratio); 0 means measured for the docs, no minimum
PAIRS = [
    ("on-primary", "primary", 4.5),
    ("on-block", "block", 4.5),
    ("on-block-muted", "block", 4.5),
    ("toast-fg", "toast-bg", 4.5),
    ("toast-action", "toast-bg", 4.5),
    ("on-fill", "ai", 4.5),
    ("control-line", "bg", 3),
    ("control-line", "surface", 3),
    ("control-line", "surface-2", 3),
    ("card-edge", "bg", 0),
    ("card-edge", "surface", 0),
    ("surface", "bg", 0),
    ("sticker-shadow", "bg", 3),
]


def luminance(hex_colour: str) -> float:
    """Relative luminance of a #rrggbb colour."""
    digits = hex_colour.lstrip("#")
    channels = [int(digits[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def ratio(a: str, b: str) -> float:
    """Contrast ratio between two colours, the lighter one on top."""
    light, dark = sorted((luminance(a), luminance(b)), reverse=True)
    return (light + 0.05) / (dark + 0.05)


def check(name: str, theme: dict[str, str]) -> list[str]:
    """Print every pair of one theme and return the ones under their minimum."""
    print(f"== {name}")
    fails = []
    pairs = [(fg, bg, 4.5) for fg in TEXT for bg in GROUNDS] + PAIRS
    for fg, bg, minimum in pairs:
        r = ratio(theme[fg], theme[bg])
        flag = "" if r >= minimum else "  <-- FAIL"
        print(f"  {fg:14} on {bg:9} {r:5.2f}{flag}")
        if r < minimum:
            fails.append(f"{fg}/{bg} {r:.2f}")
    return fails


def main() -> None:
    with open(sys.argv[1], encoding="utf-8") as file:
        themes = json.load(file)
    for name, theme in themes.items():
        fails = check(name, theme)
        print("  FAILS:", ", ".join(fails) if fails else "none")


if __name__ == "__main__":
    main()
