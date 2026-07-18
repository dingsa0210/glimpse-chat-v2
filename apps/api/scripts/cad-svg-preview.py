import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

source = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
max_width = int(sys.argv[3]) if len(sys.argv) > 3 else 3200
max_height = int(sys.argv[4]) if len(sys.argv) > 4 else 2600
svg = source.read_text(encoding="utf-8")
match = re.search(r'viewBox="([^\"]+)"', svg)
ratio = 1.4
if match:
    values = match.group(1).split()
    if len(values) == 4:
        width, height = abs(float(values[2])), abs(float(values[3]))
        if width > 0 and height > 0:
            ratio = width / height
render_width = max(800, min(max_width, int(max_height * ratio)))
render_height = max(600, min(max_height, int(render_width / ratio)))
output.parent.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": render_width, "height": render_height}, device_scale_factor=1)
    page.set_content(f"<!doctype html><style>html,body{{margin:0;background:#fff;overflow:hidden}}svg{{display:block;width:{render_width}px!important;height:{render_height}px!important}}</style>{svg}", wait_until="load", timeout=180000)
    page.screenshot(path=str(output), full_page=False, timeout=180000)
    browser.close()
