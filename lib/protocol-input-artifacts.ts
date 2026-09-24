import "server-only";

import * as PDFDocumentModule from "pdfkit";

const PDFDocument = ("default" in PDFDocumentModule ? PDFDocumentModule.default : PDFDocumentModule) as typeof PDFDocumentModule.default;

export type StoredProtocolInputArtifact = {
  name: string;
  type: "application/pdf" | "text/plain" | "text/csv";
  description: string;
  content: string;
};

export async function renderProtocolInputArtifact(artifact: StoredProtocolInputArtifact): Promise<Buffer> {
  if (artifact.type !== "application/pdf") return Buffer.from(artifact.content, "utf8");

  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
      info: { Title: "AI Benchmark Studio input document", Author: "AI Benchmark Studio" },
      margins: { top: 64, right: 58, bottom: 64, left: 58 },
      size: "A4",
    });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    document.addPage();
    document.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text("Benchmark input document");
    document.moveDown(0.35);
    document.font("Helvetica").fontSize(9).fillColor("#64748b").text(artifact.description, { lineGap: 2 });
    document.moveDown(1.2);

    for (const block of artifact.content.split(/\n{2,}/)) {
      const text = block.trim();
      if (!text) continue;
      if (text.startsWith("# ")) {
        document.moveDown(0.5).font("Helvetica-Bold").fontSize(15).fillColor("#111827").text(text.slice(2));
      } else if (text.startsWith("## ")) {
        document.moveDown(0.35).font("Helvetica-Bold").fontSize(12).fillColor("#1f2937").text(text.slice(3));
      } else if (text.split("\n").every((line) => line.includes("|"))) {
        document.font("Courier").fontSize(8.5).fillColor("#334155").text(text, { lineGap: 3 });
      } else {
        document.font("Helvetica").fontSize(10).fillColor("#334155").text(text, { lineGap: 4, paragraphGap: 8 });
      }
    }

    const range = document.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      document.switchToPage(index);
      const bottomMargin = document.page.margins.bottom;
      document.page.margins.bottom = 0;
      document.font("Helvetica").fontSize(8).fillColor("#94a3b8");
      document.text("AI Benchmark Studio - standardized task input", 58, document.page.height - 34, { align: "left", lineBreak: false, width: 360 });
      document.text(`${index + 1} / ${range.count}`, 440, document.page.height - 34, { align: "right", lineBreak: false, width: 95 });
      document.page.margins.bottom = bottomMargin;
    }
    document.end();
  });
}

export function safeArtifactFileName(name: string, type: StoredProtocolInputArtifact["type"]) {
  const extension = type === "application/pdf" ? ".pdf" : type === "text/csv" ? ".csv" : ".txt";
  const normalized = name.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, "-").trim() || `task-input${extension}`;
  return normalized.toLowerCase().endsWith(extension) ? normalized : `${normalized}${extension}`;
}
