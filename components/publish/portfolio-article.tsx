"use client";

import Link from "next/link";
import { Clipboard, Download, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { WorkflowSteps } from "@/components/workflow-steps";
import { Button } from "@/components/ui/button";
import { formatCommunityPostForCopy } from "@/lib/community-post-formatter";
import type { PublishWorkspace } from "@/lib/services/publish.service";
import type { ProjectWorkflowState } from "@/lib/types/workflow-navigation";

export function PortfolioArticle({ workspace, workflowState, quick, onEdit }: {
  workspace: PublishWorkspace;
  workflowState: ProjectWorkflowState;
  quick: boolean;
  onEdit?: () => void;
}) {
  const post = workspace.pack!.post!;
  const images = [...post.screenshotRecommendations].sort((a, b) => a.order - b.order)
    .flatMap(item => {
      const image = workspace.screenshots.find(image => image.artifactId === item.artifactId);
      return image ? [{ ...image, claim: item.supportsClaim }] : [];
    });
  const copy = async () => {
    await navigator.clipboard.writeText(formatCommunityPostForCopy({ ...post, tags: post.tags.join(" ") }));
    toast.success("社区帖子已复制");
  };
  return <div className={quick ? "" : "page-shell max-w-[1320px]"}>
    {!quick && <WorkflowSteps projectId={workspace.projectId} workflowState={workflowState} />}
    <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-medium tracking-widest text-blue-600">社区内容</p><p className="mt-2 text-sm text-muted-foreground">{workspace.projectName}</p></div>
      <div className="flex items-center gap-2">
        {onEdit && <><Button variant="ghost" size="sm" asChild><Link href={`/projects/${workspace.projectId}/history`}>版本记录</Link></Button><Button variant="outline" size="sm" onClick={onEdit}><Pencil className="h-3.5 w-3.5" />编辑文章</Button></>}
        <Button size="sm" onClick={copy}><Clipboard className="h-3.5 w-3.5" />复制全文</Button>
      </div>
    </div>
    <div className={images.length ? "grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_300px]" : "mx-auto max-w-4xl"}>
      <article aria-label="社区文章" className="min-w-0 rounded-2xl border bg-white px-6 py-9 shadow-sm sm:px-10 sm:py-12">
        <p className="mb-5 text-xs tracking-widest text-slate-400">AI BENCHMARK STUDIO</p>
        <h1 className="max-w-3xl text-balance text-2xl font-semibold leading-relaxed tracking-tight text-slate-950 sm:text-[30px]">{post.title}</h1>
        <div className="my-7 h-px bg-slate-100" />
        <div className="space-y-6 text-[15px] leading-[2] text-slate-700">
          {post.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index} className="whitespace-pre-wrap break-words">{paragraph}</p>)}
          {post.interactionQuestion && !post.body.includes(post.interactionQuestion) && <p>{post.interactionQuestion}</p>}
        </div>
        <div className="mt-9 flex flex-wrap gap-x-3 gap-y-2 text-xs text-blue-600">{post.tags.map(tag => <span key={tag}>#{tag.replace(/^#/, "")}</span>)}</div>
        <div className="mt-8 border-t pt-5"><Link href={`/projects/${workspace.projectId}/test`} className="inline-flex min-h-9 items-center gap-1.5 text-xs text-muted-foreground hover:text-blue-600">查看原始测试<ExternalLink className="h-3 w-3" /></Link></div>
      </article>
      {images.length > 0 && <aside aria-label="原始测试配图" className="space-y-5">
        <p className="text-xs text-muted-foreground">原始测试配图 · {images.length} 张</p>
        {images.map((image, index) => <figure key={image.artifactId} className="overflow-hidden rounded-xl border bg-white">
          <a href={image.fileUrl} target="_blank" rel="noreferrer" aria-label={`查看配图 ${index + 1} 原图`} className="block bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600"><img src={image.fileUrl} alt={image.claim ?? `${image.productName} 原始测试配图 ${index + 1}`} className="max-h-[480px] w-full object-contain" /></a>
          <figcaption className="flex items-start justify-between gap-3 p-4"><p className="text-xs leading-6 text-slate-500">{image.claim ?? image.testCaseTitle}</p><a href={image.fileUrl} download={image.fileName} target="_blank" rel="noreferrer" aria-label={`下载配图 ${index + 1}`} className="shrink-0 rounded p-2 text-slate-400 hover:bg-slate-50 hover:text-blue-600"><Download className="h-4 w-4" /></a></figcaption>
        </figure>)}
      </aside>}
    </div>
  </div>;
}
