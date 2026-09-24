import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import createLoader from "../scripts/lib/load-typescript.cjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const { renderProtocolInputArtifact, safeArtifactFileName } = createLoader(root)("@/lib/protocol-input-artifacts");

test("renders a stable downloadable PDF from a generated Protocol input", async () => {
  const pdf = await renderProtocolInputArtifact({
    name: "quarterly-source.pdf",
    type: "application/pdf",
    description: "A source document used by every product in the same test case.",
    content: "# Quarterly review\n\nRevenue reached 42 units while the appendix reports 39 units.\n\n## Regional table\n\nRegion | Q1 | Q2\nNorth | 10 | 14\nSouth | 12 | 6\n\nThe task is to identify the inconsistency and cite both locations.",
  });

  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1000);
  const parsed = await getDocument({ data: new Uint8Array(pdf) }).promise;
  assert.equal(parsed.numPages, 1);
});

test("preserves text inputs and normalizes unsafe download names", async () => {
  const text = await renderProtocolInputArtifact({ name: "notes", type: "text/plain", description: "fixture", content: "alpha,beta" });
  assert.equal(text.toString(), "alpha,beta");
  assert.equal(safeArtifactFileName("../source:notes", "text/csv"), "..-source-notes.csv");
});
