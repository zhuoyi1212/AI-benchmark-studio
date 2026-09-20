"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardCheck, FileText, LockKeyhole, Scale, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WorkflowSteps } from "@/components/workflow-steps";
import { demoWorkflowState } from "@/lib/mock/workflow.mock";
import { PageHeader } from "@/components/page-header";
import { MockLoader } from "@/components/mock-loader";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getProject, getProtocol, PROTOCOL_STORAGE_KEY } from "@/lib/mock/services";
import type { TestProtocol } from "@/lib/types/protocol";

export default function ProtocolPage() {
  const router = useRouter();
  const project = getProject("demo");
  const initialProtocol = getProtocol(project.id);
  const [protocol, setProtocol] = useState<TestProtocol>(initialProtocol);
  const [selectedRubricId, setSelectedRubricId] = useState(initialProtocol.rubric[0]?.id ?? "");

  useEffect(() => {
    const stored = window.localStorage.getItem(PROTOCOL_STORAGE_KEY);
    setProtocol(getProtocol(project.id, stored));
  }, []);

  const selectedRubric = protocol.rubric.find((item) => item.id === selectedRubricId) ?? protocol.rubric[0];
  const totalTests = protocol.testCases.length * project.products.length;
  const totalWeight = useMemo(() => protocol.rubric.reduce((total, item) => total + item.weight, 0), [protocol.rubric]);
  const lockProtocol = () => {
    const locked: TestProtocol = { ...protocol, status: "locked", lockedAt: new Date().toISOString() };
    window.localStorage.setItem(PROTOCOL_STORAGE_KEY, JSON.stringify(locked));
    setProtocol(locked);
    router.push("/projects/demo/test");
  };

  return <TooltipProvider><div className="page-shell">
    <MockLoader label="正在生成测试方案..." />
    <WorkflowSteps projectId="demo" workflowState={demoWorkflowState} />
    <PageHeader eyebrow={`项目 / ${project.name}`} title={protocol.title} description="统一 Prompt、输入与评分标准，确保每个产品在相同条件下接受测试。" action={protocol.status === "locked" ? <Badge variant="success"><LockKeyhole className="h-3 w-3" />已锁定</Badge> : <Badge variant="warning"><FileText className="h-3 w-3" />草稿</Badge>} />
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-7">
        <section><div className="mb-3 flex items-center gap-2"><TargetIcon /><h2 className="section-title">测评目标</h2></div><Card className="p-5 text-sm leading-7 shadow-none">{protocol.goal}</Card></section>
        <section><div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-600" /><h2 className="section-title">测试规则</h2></div><Card className="grid gap-px overflow-hidden bg-border shadow-none sm:grid-cols-2"><div className="contents">{protocol.rules.map((rule, index) => <div key={rule.id} className="flex items-center gap-3 bg-white px-4 py-3.5 text-sm"><span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">{index + 1}</span>{rule.text}</div>)}</div></Card></section>
        <section><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-blue-600" /><h2 className="section-title">Test Cases</h2></div><span className="text-xs text-muted-foreground">{protocol.testCases.length} Cases × {project.products.length} Products = {totalTests} 项测试</span></div><div className="space-y-3">{protocol.testCases.map((testCase, index) => <Card key={testCase.id} className="px-5 shadow-none"><Accordion type="single" collapsible><AccordionItem value={testCase.id}><AccordionTrigger><div className="flex items-center gap-4"><span className="font-mono text-[11px] text-blue-600">CASE {String(index + 1).padStart(2, "0")}</span><span className="text-[15px] font-semibold">{testCase.title}</span></div></AccordionTrigger><AccordionContent><div className="grid gap-5 border-t pt-5 lg:grid-cols-2"><Detail title="测试目的" text={testCase.objective} /><Detail title="输入材料" text={testCase.inputDescription ?? "无额外输入材料"} /><div className="lg:col-span-2"><div className="eyebrow mb-2">Prompt</div><div className="rounded-md border bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-700">{testCase.prompt}</div></div><div className="lg:col-span-2"><div className="eyebrow mb-2">观察重点</div><div className="flex flex-wrap gap-2">{testCase.observationFocus.map((item) => <Badge key={item} variant="neutral">{item}</Badge>)}</div></div></div></AccordionContent></AccordionItem></Accordion></Card>)}</div></section>
      </div>
      <aside className="space-y-4 xl:sticky xl:top-6 xl:h-fit"><Card className="p-5 shadow-none"><div className="flex items-center gap-2"><Scale className="h-4 w-4 text-blue-600" /><h2 className="section-title">Rubric</h2></div><p className="mt-1.5 text-xs leading-5 text-muted-foreground">点击维度查看评分标准</p><div className="mt-5 space-y-1">{protocol.rubric.map((rubric) => <Tooltip key={rubric.id}><TooltipTrigger asChild><button onClick={() => setSelectedRubricId(rubric.id)} className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${selectedRubric?.id === rubric.id ? "bg-blue-50" : "hover:bg-slate-50"}`}><div className="flex justify-between text-xs"><span className="font-medium">{rubric.name}</span><span className="font-semibold tabular-nums text-blue-700">{rubric.weight}%</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${rubric.weight}%` }} /></div></button></TooltipTrigger><TooltipContent side="left">查看评分标准</TooltipContent></Tooltip>)}</div>{selectedRubric && <div className="mt-4 rounded-md border bg-slate-50 p-3"><div className="text-xs font-semibold">{selectedRubric.name} · 评分标准</div><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{selectedRubric.scoringStandard.excellent ?? selectedRubric.description}</p></div>}<div className="mt-4 flex justify-between border-t pt-4 text-xs font-semibold"><span>权重合计</span><span className={totalWeight === 100 ? "text-emerald-700" : "text-amber-700"}>{totalWeight}%</span></div></Card><div className={`rounded-lg border p-4 ${totalWeight === 100 ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"}`}><div className="flex items-start gap-2.5">{totalWeight === 100 ? <Sparkles className="mt-0.5 h-4 w-4 text-blue-600" /> : <ShieldCheck className="mt-0.5 h-4 w-4 text-amber-600" />}<div><p className="text-xs font-semibold">{totalWeight === 100 ? "公平性检查通过" : "Rubric 权重需要调整"}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">所有产品使用相同输入、单次生成，Rubric 权重合计必须为 100%。</p></div></div></div></aside>
    </div>
    <div className="sticky bottom-5 z-20 mt-9 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white shadow-xl"><div className="hidden items-center gap-3 sm:flex">{protocol.status === "locked" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <LockKeyhole className="h-4 w-4 text-slate-400" />}<div><p className="text-xs font-medium">{protocol.status === "locked" ? "方案已锁定" : "方案锁定后不可修改"}</p><p className="text-[10px] text-slate-400">{protocol.testCases.length} Cases · {protocol.rubric.length} 评分维度</p></div></div>{protocol.status === "locked" ? <Button size="lg" className="w-full bg-white text-slate-950 hover:bg-slate-100 sm:w-auto" asChild><Link href="/projects/demo/test">进入测试执行<ArrowRight className="h-4 w-4" /></Link></Button> : <Dialog><DialogTrigger asChild><Button size="lg" className="w-full bg-white text-slate-950 hover:bg-slate-100 sm:w-auto" disabled={totalWeight !== 100}>锁定测评方案并开始测试<ArrowRight className="h-4 w-4" /></Button></DialogTrigger><DialogContent><div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-600"><LockKeyhole className="h-5 w-5" /></div><DialogTitle>确认锁定测评方案？</DialogTitle><DialogDescription>方案锁定后，本次测试的 Prompt 和评分标准将不能修改，以保证测评公平。</DialogDescription><div className="mt-6 flex justify-end gap-2"><Button variant="outline">继续检查</Button><Button onClick={lockProtocol}>确认锁定并开始测试</Button></div></DialogContent></Dialog>}</div>
  </div></TooltipProvider>;
}

function TargetIcon() { return <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-50 text-blue-600"><span className="h-2 w-2 rounded-full border-2 border-blue-600" /></span>; }
function Detail({ title, text }: { title: string; text: string }) { return <div><div className="eyebrow mb-2">{title}</div><p className="text-xs leading-6 text-slate-600">{text}</p></div>; }
