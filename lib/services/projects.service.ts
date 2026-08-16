import "server-only";

import { projectsRepository, type ProjectProgressRow } from "@/lib/repositories/projects.repository";
import type { ProjectRow } from "@/lib/types/database";

export type ProjectSummary = Pick<ProjectRow, "id" | "name" | "intent" | "status" | "created_at" | "updated_at"> & {
  progress: { completed: number; total: number; percent: number };
};

const completedStatuses = new Set<ProjectProgressRow["status"]>(["uploaded", "ready_for_review"]);

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  const projects = await projectsRepository.listActive();
  const runs = await projectsRepository.listProgressRows(projects.map((project) => project.id));
  const runsByProject = Map.groupBy(runs, (run) => run.project_id);

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    intent: project.intent,
    status: project.status,
    created_at: project.created_at,
    updated_at: project.updated_at,
    progress: calculateProgress(runsByProject.get(project.id) ?? []),
  }));
}

export async function getProjectSummary(projectId: string): Promise<ProjectSummary | null> {
  const project = await projectsRepository.findActiveById(projectId);
  if (!project) return null;
  const runs = await projectsRepository.listProgressRows([project.id]);
  return {
    id: project.id,
    name: project.name,
    intent: project.intent,
    status: project.status,
    created_at: project.created_at,
    updated_at: project.updated_at,
    progress: calculateProgress(runs),
  };
}

function calculateProgress(runs: ProjectProgressRow[]) {
  const total = runs.length;
  const completed = runs.filter((run) => completedStatuses.has(run.status)).length;
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}
