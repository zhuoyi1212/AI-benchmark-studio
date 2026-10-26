"""Check searchable replacement text and pixel preservation outside the project."""

import argparse
import re
from pathlib import Path

import pdfplumber
from PIL import ImageChops, ImageDraw


def compact(text):
    return re.sub(r"\s+", "", text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("original", type=Path)
    parser.add_argument("rewritten", type=Path)
    parser.add_argument("copy", type=Path)
    parser.add_argument("--render-dir", type=Path, required=True)
    args = parser.parse_args()
    expected = [label + body for label, body in re.findall(
        r"^- \*\*([^*]+)\*\*(.+)$", args.copy.read_text(), re.M)]
    assert len(expected) == 4
    with pdfplumber.open(args.original) as original, pdfplumber.open(args.rewritten) as revised:
        assert len(original.pages) == len(revised.pages) == 1
        before, after = original.pages[0], revised.pages[0]
        assert (before.width, before.height) == (after.width, after.height)
        replacement = after.crop((29, 618.5, 568, 688))
        body = compact(replacement.extract_text())
        for item in expected:
            assert compact(item) in body, f"missing replacement paragraph: {item[:6]}"
        for old in ("规范化开发", "落地Next.js+Supabase应用", "由AI辅助调研"):
            assert compact(old) not in body, "old PDF text remains searchable"
        assert max(c["bottom"] for c in replacement.chars) < 688
        assert max(c["x1"] for c in replacement.chars) < 568

        def outside(page):
            return [(c["text"], *(round(c[k], 3) for k in ("x0", "top", "x1", "bottom")))
                    for c in page.chars if c["bottom"] < 618.5 or c["top"] > 688]

        assert outside(before) == outside(after), "text outside target changed"
        args.render_dir.mkdir(parents=True, exist_ok=True)
        old_image = before.to_image(resolution=144).original.convert("RGB")
        new_image = after.to_image(resolution=144).original.convert("RGB")
        new_image.save(args.render_dir / "revised-1.png")
        scale_x, scale_y = old_image.width / before.width, old_image.height / before.height
        region = (int(28 * scale_x), int(618.5 * scale_y),
                  int(569 * scale_x) + 1, int(688 * scale_y) + 1)
        for image in (old_image, new_image):
            ImageDraw.Draw(image).rectangle(region, fill="white")
        assert ImageChops.difference(old_image, new_image).getbbox() is None, "pixels outside target changed"
    print("PASS: one page, all 4 paragraphs searchable, old copy removed, no overflow, outside text and pixels unchanged")


if __name__ == "__main__":
    main()
