"""Verify the delivered DOCX against Markdown, original images and rendered PDF."""

import hashlib
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/portfolio/AI产品经理作品集.md"
DOCUMENT = SOURCE.with_suffix(".docx")
QA = ROOT / "outputs/portfolio-document-qa-final"
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def normalized(text):
    return re.sub(r"\s+", "", text)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify():
    source = SOURCE.read_text()
    expected_sections = re.findall(r"^## (.+)$", source, flags=re.M)
    assert len(expected_sections) == 6
    with ZipFile(DOCUMENT) as archive:
        body = ET.fromstring(archive.read("word/document.xml"))
        styles = ET.fromstring(archive.read("word/styles.xml"))
        text = normalized("".join(item.text or "" for item in body.findall(".//w:t", NS)))
        for line in source.splitlines():
            line = line.strip()
            if not line or line == "<!-- page -->" or line.startswith("!["):
                continue
            if line.startswith("|"):
                values = [part.strip() for part in line.strip("|").split("|")]
                if all(re.fullmatch(r":?-+:?", part) for part in values):
                    continue
            else:
                values = [re.sub(r"^#{1,3} |^- ", "", line)]
            for value in values:
                value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
                assert normalized(value) in text, f"Missing source content in DOCX: {value[:40]}"
        assert len(body.findall('.//w:br[@w:type="page"]', NS)) == 5
        assert not styles.findall(".//w:pBdr", NS)
        assert not body.findall(".//w:pBdr", NS)
        images = [archive.read(name) for name in archive.namelist() if name.startswith("word/media/")]
        originals = [SOURCE.parent / path for path in re.findall(r"!\[[^\]]*\]\(([^)]+)\)", source)]
        assert len(images) == len(originals) == 2
        assert sorted(hashlib.sha256(image).hexdigest() for image in images) == sorted(sha256(path) for path in originals)
    pdf = PdfReader(QA / "AI产品经理作品集.pdf")
    assert len(pdf.pages) == 6, "Unexpected overflow or blank page"
    for index, heading in enumerate(expected_sections):
        assert normalized(heading) in normalized(pdf.pages[index].extract_text()), f"Section on wrong page: {heading}"
        assert (QA / f"page-{index + 1}.png").is_file()
    for index in range(15):
        page = 2 if index <= 7 else 3
        assert f"N{index:02}" in pdf.pages[page].extract_text()
    report = {
        "source": str(SOURCE.relative_to(ROOT)),
        "document": str(DOCUMENT.relative_to(ROOT)),
        "sourceSha256": sha256(SOURCE),
        "documentSha256": sha256(DOCUMENT),
        "pages": len(pdf.pages),
        "workflowNodes": 15,
        "sourceTextPreserved": True,
        "originalScreenshotsPreserved": 2,
        "titleParagraphBorders": 0,
        "pageHeadings": expected_sections,
    }
    (QA / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    verify()
