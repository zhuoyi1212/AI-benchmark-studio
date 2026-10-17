"""Prove that all original article copies in the private snapshot reach the DOCX."""

import hashlib
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "docs/project-articles"
QA = ROOT / "outputs/project-article-qa-final"
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def norm(text):
    return re.sub(r"\s+", "", text)


def verify():
    raw = json.loads((ROOT / "outputs/article-compilation-private/snapshot.private.json").read_text())
    data = json.loads((FOLDER / "项目与文章汇编数据.json").read_text())
    ids = {p["id"] for p in data["projects"]}
    original = {r["id"]: r for r in raw["tables"]["publish_packs"] if r["project_id"] in ids and isinstance(r.get("community_post"), dict) and isinstance(r["community_post"].get("body"), str) and r["community_post"]["body"].strip()}
    included = {a["id"]: a for p in data["projects"] for a in p["articles"]}
    assert set(original) == set(included), "Article record omitted or added"
    expected_projects = {p["id"] for p in raw["tables"]["projects"] if not p["deleted_at"] and not re.match(r"^(\[E2E\](?:\s|$)|AUTO DEMO(?:\s|·|$)|快速模式复用验证(?:\s|$))", p["name"].strip(), re.I) and (any(r["project_id"] == p["id"] and any(a["test_run_id"] == r["id"] for a in raw["tables"]["test_artifacts"]) for r in raw["tables"]["test_runs"]) or any(r["project_id"] == p["id"] and (r.get("community_post") or {}).get("body") for r in raw["tables"]["publish_packs"]))}
    assert ids == expected_projects
    docx = FOLDER / "已测评项目与文章汇编.docx"
    with ZipFile(docx) as archive:
        body = ET.fromstring(archive.read("word/document.xml"))
        styles = ET.fromstring(archive.read("word/styles.xml"))
        doc_text = norm("".join(e.text or "" for e in body.findall(".//w:t", NS)))
        assert not styles.findall(".//w:pBdr", NS)
        for article_id, article in included.items():
            post = original[article_id]["community_post"]
            for field in ["title", "body", "tags", "interactionQuestion"]:
                assert article[field] == post.get(field, [] if field == "tags" else ""), f"Changed copy: {article_id}/{field}"
            for text in [article["title"], article["body"], article["interactionQuestion"], *article["tags"]]:
                assert norm(text) in doc_text, f"Missing DOCX content: {article_id}"
        for project in data["projects"]:
            for text in [project["name"], project["intent"], *(c["prompt"] for c in (project.get("protocol") or {}).get("cases", []))]:
                assert norm(text) in doc_text
    pdf = PdfReader(QA / "已测评项目与文章汇编.pdf")
    pages = [p.extract_text() for p in pdf.pages]
    assert len(list(QA.glob("page-*.png"))) == len(pages)
    assert all(len(norm(t)) > 30 for t in pages), "Unexpected blank page"
    report = {"capturedAt": data["capturedAt"], **data["totals"], "pages": len(pages), "rawVersionIdsMatch": True, "rawCopyFieldsUnchanged": True, "allBodiesInDocx": True, "allPromptsInDocx": True, "documentSha256": hashlib.sha256(docx.read_bytes()).hexdigest(), "dataSha256": hashlib.sha256((FOLDER / "项目与文章汇编数据.json").read_bytes()).hexdigest(), "articleIds": sorted(included)}
    (QA / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "articleIds"}, ensure_ascii=False))


if __name__ == "__main__":
    verify()
