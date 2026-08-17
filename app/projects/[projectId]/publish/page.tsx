import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PublishEditor } from "@/app/projects/[projectId]/publish/publish-editor";
import { getPublishWorkspace } from "@/lib/services/publish.service";

export const maxDuration = 300;

export default async function PublishPage({ params }: { params: Promise<{ projectId: string }> }) {
  await connection();
  const { projectId } = await params;
  const workspace = await getPublishWorkspace(projectId);
  if (!workspace) redirect(`/projects/${projectId}/report`);
  return <PublishEditor workspace={workspace} />;
}
