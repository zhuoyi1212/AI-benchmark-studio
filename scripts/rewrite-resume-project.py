"""Replace only the AI project body in the supplied one-page resume PDF."""

import argparse
import hashlib
import io
import re
from pathlib import Path

import pdfplumber
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


def paragraphs(source):
    return [label + body for label, body in re.findall(r"^- \*\*([^*]+)\*\*(.+)$", source.read_text(), re.M)]


def wrap(text, width, font, size):
    # Keep Latin words together and prevent Chinese closing punctuation at line start.
    units = re.findall(r"[A-Za-z0-9]+|.", text)
    closing = set("，。、；：！？）》”’")
    grouped = []
    for unit in units:
        if unit in closing and grouped:
            grouped[-1] += unit
        else:
            grouped.append(unit)
    lines, current = [], ""
    for unit in grouped:
        if current and pdfmetrics.stringWidth(current + unit, font, size) > width:
            lines.append(current)
            current = unit
        else:
            current += unit
    if current:
        lines.append(current)
    return lines


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("original", type=Path)
    parser.add_argument("copy", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    assert args.original.resolve() != args.output.resolve(), "preserve source PDF"
    source_hash = hashlib.sha256(args.original.read_bytes()).hexdigest()
    with pdfplumber.open(args.original) as original:
        assert len(original.pages) == 1
        page = original.pages[0]
        text = page.crop((29, 618.5, 568, 688)).extract_text()
        assert "规范化开发" in text and "工作流设计" in text, "unexpected source layout"
        width, height = page.width, page.height

    font = "ResumeHeiti"
    pdfmetrics.registerFont(TTFont(font, "/System/Library/Fonts/STHeiti Light.ttc", subfontIndex=0))
    lines_by_item = [wrap(item, 525, font, 9) for item in paragraphs(args.copy)]
    assert len(lines_by_item) == 4
    assert sum(map(len, lines_by_item)) <= 6, "copy exceeds original body area"
    overlay = io.BytesIO()
    drawing = canvas.Canvas(overlay, pagesize=(width, height))
    drawing.setFillColorRGB(0.125, 0.125, 0.125)
    drawing.setStrokeColorRGB(0.125, 0.125, 0.125)
    baseline = height - 626.209
    last_baseline = baseline
    for lines in lines_by_item:
        drawing.circle(33.65, baseline + 2.5, 1, stroke=0, fill=1)
        for i, line in enumerate(lines):
            if i == 0:
                label, body = line.split("：", 1)
                label += "："
                drawing.saveState()
                drawing.setLineWidth(0.15)
                bold = drawing.beginText(39.359, baseline)
                bold.setFont(font, 9)
                bold.setTextRenderMode(2)
                bold.textOut(label)
                drawing.drawText(bold)
                drawing.restoreState()
                drawing.setFont(font, 9)
                drawing.drawString(39.359 + pdfmetrics.stringWidth(label, font, 9), baseline, body)
            else:
                drawing.setFont(font, 9)
                drawing.drawString(39.359, baseline, line)
            last_baseline = baseline
            baseline -= 11.28
        baseline -= 0.48
    assert height - last_baseline < 687, "replacement collides with next section"
    drawing.save()
    overlay.seek(0)

    writer = PdfWriter(clone_from=str(args.original))
    page = writer.pages[0]
    content = ContentStream(page.get_contents(), writer)
    # This source uses a top-origin page transform and independent text matrices.
    assert any(op == b"cm" and list(values) == [1, 0, 0, -1, 0, height]
               for values, op in content.operations[:5])
    rewritten, y, removed = [], None, 0
    for values, op in content.operations:
        if op == b"Tm":
            y = float(values[5])
        if op in (b"Tj", b"TJ", b"'", b'"') and y is not None and 619 < y < 687:
            removed += 1
            continue
        rewritten.append((values, op))
    assert removed > 20, "source text was not removed"
    content.operations = rewritten
    page.replace_contents(content)
    page.merge_page(PdfReader(overlay).pages[0])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("wb") as result:
        writer.write(result)
    assert hashlib.sha256(args.original.read_bytes()).hexdigest() == source_hash
    print(f"Replaced project body: {sum(map(len, lines_by_item))} lines; original preserved")


if __name__ == "__main__":
    main()
