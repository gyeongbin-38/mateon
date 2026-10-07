"""Convert Chromium's painted page to standalone SVG; preserve font outlines.

Uses PyMuPDF (https://github.com/pymupdf/PyMuPDF), installed separately.
The PDF is an intermediate build artifact, never a screenshot wrapped in SVG.
"""
import json
import re
import sys
from pathlib import Path
import pymupdf

pdf_path, svg_path, width, height = sys.argv[1:]
width, height = int(width), int(height)
with pymupdf.open(pdf_path) as document:
    page = document[0]
    # Chromium uses 72 PDF points per 96 CSS pixels. Preserve that exact scale;
    # only crop the subpixel paper-size rounding at the outer viewport.
    svg = page.get_svg_image(matrix=pymupdf.Matrix(4 / 3, 4 / 3), text_as_path=True)
    svg = re.sub(r'width="[^"]+" height="[^"]+" viewBox="[^"]+"',
                 f'width="{width}" height="{height}" viewBox="0 0 {width} {height}"', svg, count=1)
    # Force overflow clipping at each page boundary, including nested boards.
    svg = svg.replace('<svg ', '<svg overflow="hidden" ', 1)
    Path(svg_path).write_text(svg, encoding='utf-8')
    print(json.dumps({'paths': svg.count('<path'), 'images': svg.count('<image'),
                      'width': width, 'height': height, 'pdfPages': len(document)}))
