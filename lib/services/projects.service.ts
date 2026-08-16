import "server-only";

import {
  projectsRepository,
  type CreateProjectRecord,
  type ProjectProductListRow,
  type ProjectProgressRow,
} from "@/lib/repositories/projects.repository";
import type { ProjectRow } from "@/lib/types/database";

export type ProjectProductSummary = {
  id: string;
  name: string;
  officialUrl: string | null;
  initials: string;
};

export type ProjectSummary = Pick<ProjectRow, "id" | "name" | "intent" | "status" | "created_at" | "updated_at"> & {
  progress: { completed: number; total: number; percent: number };
  products: ProjectProductSummary[];
};

const completedStatuses = new Set<ProjectProgressRow["status"]>(["uploaded", "ready_for_review"]);

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  const projects = await projectsRepository.listActive();
  const projectIds = projects.map((project) => project.id);
  const [runs, productRows] = await Promise.all([
    projectsRepository.listProgressRows(projectIds),
    projectsRepository.listProductRows(projectIds),
  ]);
  const runsByProject = Map.groupBy(runs, (run) => run.project_id);
  const productsByProject = Map.groupBy(productRows, (row) => row.project_id);

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    intent: project.intent,
    status: project.status,
    created_at: project.created_at,
    updated_at: project.updated_at,
    progress: calculateProgress(runsByProject.get(project.id) ?? []),
    products: mapProducts(productsByProject.get(project.id) ?? []),
  }));
}

export async function getProjectSummary(projectId: string): Promise<ProjectSummary | null> {
  const project = await projectsRepository.findActiveById(projectId);
  if (!project) return null;
  const [runs, productRows] = await Promise.all([
    projectsRepository.listProgressRows([project.id]),
    projectsRepository.listProductRows([project.id]),
  ]);
  return {
    id: project.id,
    name: project.name,
    intent: project.intent,
    status: project.status,
    created_at: project.created_at,
    updated_at: project.updated_at,
    progress: calculateProgress(runs),
    products: mapProducts(productRows),
  };
}

export async function createProject(record: CreateProjectRecord): Promise<string> {
  return projectsRepository.create({
    ...record,
    name: record.name.trim(),
    intent: record.intent.trim(),
    products: record.products.map((product) => ({
      name: product.name.trim(),
      officialUrl: product.officialUrl?.trim() || null,
    })),
  });
}

function calculateProgress(runs: ProjectProgressRow[]) {
  const total = runs.length;
  const completed = runs.filter((run) => completedStatuses.has(run.status)).length;
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

function mapProducts(rows: ProjectProductListRow[]): ProjectProductSummary[] {
  return [...rows]
    .sort((left, right) => left.display_order - right.display_order)
    .map((row) => ({
      id: row.product_id,
      name: row.submitted_name,
      officialUrl: row.submitted_official_url,
      initials: getInitials(row.submitted_name),
    }));
}

function getInitials(name: string) {
  const segments = name.trim().split(/\s+/).filter(Boolean);
  return segments.length > 1
    ? segments.slice(0, 2).map((segment) => segment[0]).join("").toUpperCase()
    : name.trim().slice(0, 2).toUpperCase();
}
