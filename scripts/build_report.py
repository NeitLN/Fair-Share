"""Build the report PDF from docs/report/0*.md and print its page count (T-31, T-36).

The course limit is 12 pages for the eight sections; the cover and the table of contents are not
counted. Sections follow one another without page breaks, A4, 10.5 pt, images capped in height.

    pip install markdown-it-py playwright && python -m playwright install chromium
    python scripts/build_report.py [out.pdf]        # default: report.pdf in the current folder
"""

import re
import sys
from pathlib import Path

from markdown_it import MarkdownIt
from playwright.sync_api import sync_playwright

REPORT = Path(__file__).resolve().parent.parent / "docs" / "report"
LIMIT = 12

CSS = """
@page { size: A4; margin: 20mm 18mm; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; line-height: 1.35; }
h1 { font-size: 16pt; margin: 14pt 0 8pt; }
h2 { font-size: 13pt; margin: 12pt 0 6pt; }
h3 { font-size: 11.5pt; margin: 10pt 0 4pt; }
p, li { margin: 0 0 5pt; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0; font-size: 9.5pt; }
th, td { border: 1px solid #bbb; padding: 3pt 5pt; vertical-align: top; text-align: left; }
code { font-size: 9pt; }
pre { font-size: 8.5pt; background: #f4f4f4; padding: 6pt; white-space: pre-wrap; }
img { max-width: 100%; max-height: 85mm; display: block; margin: 6pt auto; }
td img { max-height: 62mm; }
"""


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "report.pdf").resolve()
    sections = sorted(REPORT.glob("0[1-8]-*.md"))
    md = MarkdownIt("commonmark", {"html": True}).enable("table")
    body = "".join(md.render(p.read_text(encoding="utf-8")) for p in sections)
    # <base> makes the images and links in the sections resolve from docs/report/
    html = (f"<!doctype html><html><head><meta charset='utf-8'><base href='{REPORT.as_uri()}/'>"
            f"<style>{CSS}</style></head><body>{body}</body></html>")
    page_html = out.with_suffix(".html")
    page_html.write_text(html, encoding="utf-8")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(page_html.as_uri(), wait_until="load")
        out.write_bytes(page.pdf(format="A4", print_background=True))
        browser.close()
    page_html.unlink()
    pages = len(re.findall(rb"/Type\s*/Page[^s]", out.read_bytes()))
    words = sum(len(re.findall(r"\w+", p.read_text(encoding="utf-8"))) for p in sections)
    print(f"{out}: {len(sections)} sections, {words} words, {pages} pages (limit {LIMIT})")
    sys.exit(0 if pages <= LIMIT else 1)


if __name__ == "__main__":
    main()
