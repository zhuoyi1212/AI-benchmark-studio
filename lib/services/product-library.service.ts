import "server-only";

import { z } from "zod";
import { isVisibleProductLibraryEntry } from "@/lib/product-library-visibility";
import { isInternalValidationProject } from "@/lib/project-visibility";
import { productLibraryRepository } from "@/lib/repositories/product-library.repository";
import type { ProductResearchSnapshotRow } from "@/lib/types/database";
import type { ResearchSource } from "@/lib/types/research";

const textListSchema = z.array(z.string());
const sourcesSchema = z.array(z.object({
  title: z.string(), url: z.string().url(),
  sourceType: z.enum(["official_website", "documentation", "pricing", "help_center", "blog", "other"]),
  snippet: z.string(), siteName: z.string().nullable(), publishedAt: z.string().nullable(),
}));

export type ProductLibraryItem = {
  id: string;
  name: string;
  officialUrl: string | null;
  logoUrl: string | null;
  latestSnapshot: null | {
    id: string; version: number; positioning: string; capabilities: string[]; limitations: string[];
    inputFormats: string[]; outputFormats: string[]; sources: ResearchSource[];
    researchedAt: string; validUntil: string; needsUpdate: boolean;
  };
  snapshotCount: number;
  projects: Array<{ id: string; name: string; status: string; createdAt: string; evaluationMode: "quick" | "professional" }>;
};

export type ProductOption = Pick<ProductLibraryItem, "id" | "name" | "officialUrl">;

export async function listProductOptions(): Promise<ProductOption[]> {
  return (await productLibraryRepository.listProducts()).filter(isVisibleProductLibraryEntry)
    .map(product => ({ id: product.id, name: product.name, officialUrl: product.official_url }));
}

export async function listProductLibrary(productId?: string): Promise<ProductLibraryItem[]> {
  const products = (await productLibraryRepository.listProducts(productId)).filter(isVisibleProductLibraryEntry);
  const productIds = products.map((product) => product.id);
  const [snapshots, links] = await Promise.all([
    productLibraryRepository.listSnapshots(productIds),
    productLibraryRepository.listProjectProducts(productIds),
  ]);
  const projects = (await productLibraryRepository.listProjects([...new Set(links.map((link) => link.project_id))]))
    .filter(project => !project.deleted_at && !isInternalValidationProject(project));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const snapshotsByProduct = Map.groupBy(snapshots, (snapshot) => snapshot.product_id);
  const linksByProduct = Map.groupBy(links, (link) => link.product_id);

  return products.map((product) => {
    const productSnapshots = snapshotsByProduct.get(product.id) ?? [];
    const latest = productSnapshots[0];
    return {
      id: product.id,
      name: product.name,
      officialUrl: product.official_url,
      logoUrl: product.logo_url,
      latestSnapshot: latest ? mapSnapshot(latest) : null,
      snapshotCount: productSnapshots.length,
      projects: (linksByProduct.get(product.id) ?? []).flatMap((link) => {
        const project = projectById.get(link.project_id);
        return project ? [{ id: project.id, name: project.name, status: project.status, createdAt: project.created_at, evaluationMode: project.evaluation_mode }] : [];
      }),
    };
  });
}

export async function getProductLibraryDetail(productId: string) {
  if (!z.string().uuid().safeParse(productId).success) return null;
  const [product] = await listProductLibrary(productId);
  if (!product) return null;
  const [snapshots, outputs] = await Promise.all([
    productLibraryRepository.listSnapshots([productId]),
    productLibraryRepository.listOutputs(product.projects.map(project => project.id)),
  ]);
  return { product, snapshots: snapshots.map(mapSnapshot), outputs };
}

function mapSnapshot(snapshot: ProductResearchSnapshotRow): NonNullable<ProductLibraryItem["latestSnapshot"]> {
  return {
    id: snapshot.id,
    version: snapshot.version,
    positioning: snapshot.positioning,
    capabilities: textListSchema.parse(snapshot.capabilities),
    limitations: textListSchema.parse(snapshot.limitations),
    inputFormats: textListSchema.parse(snapshot.input_formats),
    outputFormats: textListSchema.parse(snapshot.output_formats),
    sources: sourcesSchema.parse(snapshot.sources),
    researchedAt: snapshot.researched_at,
    validUntil: snapshot.valid_until,
    needsUpdate: Date.parse(snapshot.valid_until) <= Date.now(),
  };
}
