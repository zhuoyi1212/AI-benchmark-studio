"use client";

import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, Clipboard, Clock3, FileUp, LockKeyhole, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { WorkflowSteps } from "@/components/workflow-steps";
import { PageHeader } from "@/components/page-header";
import { ProductLogo } from "@/components/product-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getTestExecutionWorkspace } from "@/lib/mock/services";
import type { TestRun } from "@/lib/types/test-run";

export default function TestPage() {
  const workspace = getTestExecutionWorkspace("demo");
  const { project, protocol } = workspace;
  const [runs, setRuns] = useState<TestRun[]>(workspace.testRuns);
  const completed = useMemo(() => runs.filter((run) => run.status === "uploaded" || run.status === "ready_for_review").length, [runs]);
  const total = protocol.testCases.length * project.products.length;
  const progress = total === 0 ? 0 : completed / total * 100;
  const upload = (run: TestRun, productName: string) => {
    setRuns((current) => current.map((item) => item.id === run.id ? { ...item, status: "uploaded", artifacts: [{ id: `artifact-${item.id}`, fileName: `${item.productId}-${item.testCaseId}-output.pdf`, fileType: "application/pdf", fileUrl: `mock://${item.id}`, createdAt: new Date().toISOString() }] } : item));
    toast.success(`${productName} 测试结果已上传`, { description: "Mock 文件已记录，可随时替换。" });
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success("Prompt 已复制"); } catch { toast.success("Prompt 已复制（演示）"); } };
  return <TooltipProvider><div className="page-shell">
    <WorkflowSteps current={2} />
    <PageHeader eyebrow={`项目 / ${project.name}`} title="测试执行" description="按照锁定方案在各产品中完成测试，并上传未经人工编辑的原始结果。" action={<Badge variant="success"><LockKeyhole className="h-3 w-3" />Protocol 已锁定</Badge>} />
    <Card className="mb-7 p-5 shadow-none"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-600"><FileUp className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex justify-between"><span className="text-sm font-semibold">总体进度</span><span className="text-sm font-semibold tabular-nums">{completed} / {total} 项测试已完成</span></div><Progress className="mt-3" value={progress} /></div><span className="text-2xl font-semibold tabular-nums text-blue-700">{Math.round(progress)}%</span></div></Card>
    <div className="space-y-5">{protocol.testCases.map((testCase, caseIndex) => <section key={testCase.id}><div className="mb-2.5 flex items-center justify-between"><div className="flex items-center gap-3"><span className="font-mono text-[11px] font-medium text-blue-600">CASE {String(caseIndex + 1).padStart(2, "0")}</span><h2 className="text-sm font-semibold">{testCase.title}</h2></div><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={() => copy(testCase.prompt)}><Clipboard className="h-3.5 w-3.5" />复制 Prompt</Button></TooltipTrigger><TooltipContent>复制本 Case 的锁定 Prompt</TooltipContent></Tooltip></div><Card className="divide-y shadow-none">{project.products.map((product) => { const run = runs.find((item) => item.testCaseId === testCase.id && item.productId === product.id); const done = run?.status === "uploaded" || run?.status === "ready_for_review"; const artifact = run?.artifacts[0]; return <div key={product.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><ProductLogo initials={product.initials} name={product.name} className="h-8 w-8 rounded-md text-xs" /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{product.name}</div><div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">{done ? <><CheckCircle2 className="h-3 w-3 text-emerald-600" />结果文件 · {artifact?.fileName}</> : <><Clock3 className="h-3 w-3" />等待上传测试结果</>}</div></div>{done ? <Badge variant="success"><Check className="h-3 w-3" />已上传</Badge> : run && <Button variant="outline" size="sm" onClick={() => upload(run, product.name)}><UploadCloud className="h-3.5 w-3.5" />上传测试结果</Button>}</div>; })}</Card></section>)}</div>
    <div className="sticky bottom-5 z-20 mt-8 flex items-center justify-between rounded-lg border bg-white/95 p-3 shadow-lg backdrop-blur"><p className="hidden pl-2 text-xs text-muted-foreground sm:block">演示模式允许跳过未上传项进入盲评</p><Button className="w-full sm:w-auto" asChild><Link href="/projects/demo/review">开始 Blind Review<ArrowRight className="h-4 w-4" /></Link></Button></div>
  </div></TooltipProvider>;
}
