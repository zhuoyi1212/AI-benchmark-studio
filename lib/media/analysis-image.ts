import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { analysisImagePolicyVersion } from "./analysis-image-paths";
export { analysisImagePolicyVersion, analysisImagePaths } from "./analysis-image-paths";

export const maxAnalysisImageBytes = 4 * 1024 * 1024;
const maxSourceBytes = 50 * 1024 * 1024;
const maxInputPixels = 100_000_000;
const maxEdge = 6000;

export class AnalysisImageError extends Error {
  constructor(message: string) { super(message); this.name = "AnalysisImageError"; }
}

export const analysisImageSchema = z.object({
  policyVersion: z.literal(analysisImagePolicyVersion),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.enum(["image/png", "image/jpeg"]),
  sizeBytes: z.number().int().positive().max(maxAnalysisImageBytes),
  sourceWidth: z.number().int().positive(), sourceHeight: z.number().int().positive(),
  width: z.number().int().positive().max(maxEdge), height: z.number().int().positive().max(maxEdge),
  encoding: z.enum(["original", "lossless", "jpeg"]),
  quality: z.number().int().min(85).max(95).nullable(),
  storagePath: z.string().min(1),
}).strict();
export type AnalysisImage = z.infer<typeof analysisImageSchema>;

export async function prepareAnalysisImage(bytes: Uint8Array, mimeType: string) {
  if (!bytes.length || bytes.length > maxSourceBytes) throw new AnalysisImageError("图片为空或超过 50 MB，请检查原文件。");
  try {
    const { default: sharp } = await import("sharp");
    const source = Buffer.from(bytes);
    const pipeline = sharp(source, { limitInputPixels: maxInputPixels, failOn: "warning", animated: false });
    const metadata = await pipeline.metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format ?? "") || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) {
      throw new AnalysisImageError("无法处理这张图片，请上传静态 PNG、JPEG 或 WebP。");
    }
    if (`image/${metadata.format}` !== mimeType) throw new AnalysisImageError("图片实际格式与声明不一致，请重新上传。");
    const oriented = metadata.autoOrient;
    const width = oriented?.width ?? metadata.width;
    const height = oriented?.height ?? metadata.height;
    const base = pipeline.autoOrient().resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true }).timeout({ seconds: 20 });
    const sourceSha256 = digest(source);
    function result(data: Buffer, info: { width: number; height: number }, format: "png" | "jpeg", encoding: "original" | "lossless" | "jpeg", quality: number | null) {
      return { bytes: data, manifest: {
        policyVersion: analysisImagePolicyVersion as typeof analysisImagePolicyVersion, sourceSha256, sha256: digest(data),
        mimeType: format === "png" ? "image/png" as const : "image/jpeg" as const,
        sizeBytes: data.length, sourceWidth: metadata.width!, sourceHeight: metadata.height!,
        width: info.width, height: info.height, encoding, quality,
      } };
    }
    // Decode even small images: a correct magic header alone does not prove readability.
    const png = await base.clone().png({ compressionLevel: 9, palette: false }).toBuffer({ resolveWithObject: true });
    if (source.length <= maxAnalysisImageBytes && width <= maxEdge && height <= maxEdge && !metadata.orientation && metadata.format !== "webp") {
      return result(source, { width, height }, metadata.format as "png" | "jpeg", "original", null);
    }
    if (png.data.length <= maxAnalysisImageBytes) return result(png.data, png.info, "png", "lossless", null);
    // Keep the complete image and fine colour edges. Never blur, crop, sharpen or redraw.
    for (const quality of [95, 90, 85]) {
      const jpeg = await base.clone().flatten({ background: "#ffffff" }).jpeg({ quality, chromaSubsampling: "4:4:4" }).toBuffer({ resolveWithObject: true });
      if (jpeg.data.length <= maxAnalysisImageBytes) return result(jpeg.data, jpeg.info, "jpeg", "jpeg", quality);
    }
    throw new AnalysisImageError("图片细节过多，无法在保留清晰度的前提下适配分析，请上传较小的原图后重试。");
  } catch (error) {
    if (error instanceof AnalysisImageError) throw error;
    throw new AnalysisImageError("图片无法解码或尺寸过大，请检查原图后重新上传。");
  }
}

export function digest(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
