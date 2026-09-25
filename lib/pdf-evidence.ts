import "server-only";

import { dirname, join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";

export class PdfEvidenceError extends Error {}

export const maxPdfEvidencePages = 32;
export const maxPdfEvidenceBytes = 20 * 1024 * 1024;

export async function extractPdfText(bytes: Uint8Array, characterBudget = 120_000): Promise<string | null> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
  });
  try {
    const pdf = await loading.promise;
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      try {
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => "str" in item ? item.str : "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) pages.push(`[PDF page ${number}] ${text}`);
        if (pages.join("\n").length > characterBudget) throw new PdfEvidenceError("PDF 文本超出本次分析大小上限，请拆分后重试。");
      } finally {
        page.cleanup();
      }
    }
    const text = pages.join("\n");
    return text.length >= 20 ? text : null;
  } catch (error) {
    if (error instanceof PdfEvidenceError) throw error;
    return null;
  } finally {
    await loading.destroy();
  }
}

// Render actual pages in memory. These are transport representations of the
// original PDF, never newly generated or persisted experiment artifacts.
export async function renderPdfEvidence(bytes: Uint8Array, pageBudget = maxPdfEvidencePages, byteBudget = maxPdfEvidenceBytes): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const root = dirname(require.resolve("pdfjs-dist/package.json"));
  const loading = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    cMapUrl: join(root, "cmaps") + "/",
    cMapPacked: true,
    standardFontDataUrl: join(root, "standard_fonts") + "/",
    wasmUrl: join(root, "wasm") + "/",
  });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > pageBudget) throw new PdfEvidenceError(`PDF 与截图混合分析最多支持 ${maxPdfEvidencePages} 页 PDF，请拆分测试材料后重试；未省略任何页面。`);
    const images: string[] = [];
    let encodedBytes = 0;
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const original = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 2400 / Math.max(original.width, original.height));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        // PDF.js declares DOM canvas types; Node Canvas implements the rendering
        // operations but does not carry unrelated browser element properties.
        await page.render({ canvas: null, canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D, viewport }).promise;
        const image = `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
        encodedBytes += image.length;
        if (encodedBytes > byteBudget) throw new PdfEvidenceError("PDF 页面图片超出本次分析大小上限，请拆分测试材料后重试；未省略任何页面。");
        images.push(image);
      } finally {
        canvas.width = 1;
        canvas.height = 1;
        page.cleanup();
      }
    }
    return images;
  } catch (error) {
    if (error instanceof PdfEvidenceError) throw error;
    throw new PdfEvidenceError("PDF 页面无法读取，请检查文件是否损坏或有密码保护后重试。");
  } finally {
    await loading.destroy();
  }
}
