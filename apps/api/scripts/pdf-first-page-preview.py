import math
import sys
from pathlib import Path

import fitz

source = Path(sys.argv[1]).resolve()
target = Path(sys.argv[2]).resolve()
max_width = int(sys.argv[3]) if len(sys.argv) > 3 else 2400
max_height = int(sys.argv[4]) if len(sys.argv) > 4 else 3000

document = fitz.open(source)
if document.page_count < 1:
    raise RuntimeError("PDF has no pages")
page = document[0]
rect = page.rect
scale = min(max_width / max(1, rect.width), max_height / max(1, rect.height))
scale = max(0.25, min(4.0, scale))
target.parent.mkdir(parents=True, exist_ok=True)
page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False).save(target)
print(f"pages={document.page_count};width={round(rect.width * scale)};height={round(rect.height * scale)}")
