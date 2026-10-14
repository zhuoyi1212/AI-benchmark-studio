import { NavigationLink as Link } from "@/components/navigation-link";
import { connection } from "next/server";
import { listProjectSummaries, type ProjectSummary } from "@/lib/services/projects.service";
import type { ProjectStatus } from "@/lib/types/database";
import { AdminOnly } from "@/components/workspace-access";

export async function RecentProjectNav() {
  await connection();
  let projects: ProjectSummary[];
  try {
    projects = await listProjectSummaries();
  } catch {
    return <SidebarLink href="/projects" label="项目列表暂不可用" />;
  }
  if (projects.length === 0) return <AdminOnly><SidebarLink href="/projects/new" label="创建第一个测评" /></AdminOnly>;
  return (
    <nav aria-label="最近项目">
    {projects.map((project) => <Link key={project.id} href={project.evaluationMode === "quick" ? `/projects/${project.id}/quick` : getProjectHref(project.id, project.status)} className="group mt-2 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-slate-600 hover:bg-slate-100 hover:text-slate-950">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
      <span className="min-w-0 flex-1 truncate" title={project.name}>{project.name}</span>
      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground group-hover:text-slate-600">{project.progress.percent}%</span>
    </Link>)}
    </nav>
  );
}

export function RecentProjectNavSkeleton() {
  return <div className="mt-2 h-9 animate-pulse rounded-md bg-slate-100" aria-label="正在加载最近项目" />;
}

function SidebarLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="mt-2 block rounded-md px-2.5 py-2 text-[13px] text-slate-500 hover:bg-slate-100 hover:text-slate-950">{label}</Link>;
}

function getProjectHref(projectId: string, status: ProjectStatus) {
  if (["draft", "researching", "research_ready"].includes(status)) return `/projects/${projectId}/research`;
  if (["protocol_draft", "protocol_locked"].includes(status)) return `/projects/${projectId}/protocol`;
  if (status === "testing") return `/projects/${projectId}/test`;
  if (["reviewing", "review_locked"].includes(status)) return `/projects/${projectId}/review`;
  if (status === "completed") return `/projects/${projectId}/results`;
  if (status === "reported") return `/projects/${projectId}/report`;
  return `/projects/${projectId}/publish`;
}
