import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PublishEditor } from "@/app/projects/[projectId]/publish/publish-editor";
import { getPublishWorkspace } from "@/lib/services/publish.service";
import { getProjectWorkflowState } from "@/lib/services/workflow-navigation.service";

export const maxDuration = 300;

export default async function PublishPage({ params }: { params: Promise<{ projectId: string }> }) {
  await connection();
  const { projectId } = await params;
  const [workspace, workflowState] = await Promise.all([
    getPublishWorkspace(projectId),
    getProjectWorkflowState(projectId),
  ]);
  if (!workspace) redirect(`/projects/${projectId}/results`);
  if (!workflowState) redirect("/projects");
  return <PublishEditor workspace={workspace} workflowState={workflowState} />;
}
