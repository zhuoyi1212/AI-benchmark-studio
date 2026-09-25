import "server-only";

import { z } from "zod";
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
  projects: Array<{ id: string; name: string; status: string; createdAt: string }>;
};

export async function listProductLibrary(): Promise<ProductLibraryItem[]> {
  const products = await productLibraryRepository.listProducts();
  const productIds = products.map((product) => product.id);
  const [snapshots, links] = await Promise.all([
    productLibraryRepository.listSnapshots(productIds),
    productLibraryRepository.listProjectProducts(productIds),
  ]);
  const projects = await productLibraryRepository.listProjects([...new Set(links.map((link) => link.project_id))]);
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
        return project ? [{ id: project.id, name: project.name, status: project.status, createdAt: project.created_at }] : [];
      }),
    };
  }).filter((item) => item.latestSnapshot !== null);
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
