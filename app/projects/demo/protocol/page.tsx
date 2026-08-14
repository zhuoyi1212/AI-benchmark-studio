"use client";

import Link from "next/link";
import { ArrowRight, ClipboardCheck, FileText, LockKeyhole, Scale, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { WorkflowSteps } from "@/components/workflow-steps";
import { PageHeader } from "@/components/page-header";
import { MockLoader } from "@/components/mock-loader";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { rubrics, testCases } from "@/lib/mock-data";

const rules = ["使用相同原始输入", "使用相同 Prompt", "每个 Prompt 只生成一次", "不进行人工二次编辑", "测试结果完整上传"];

export default function ProtocolPage() {
  const [selectedRubric, setSelectedRubric] = useState(0);
  return (
    <TooltipProvider>
      <div className="page-shell">
        <MockLoader label="正在生成测试方案..." />
        <WorkflowSteps current={1} />
        <PageHeader eyebrow="项目 / AI PPT 产品横向测评" title="AI PPT 横向测试" description="统一 Prompt、输入与评分标准，确保每个产品在相同条件下接受测试。" action={<Badge variant="warning"><FileText className="h-3 w-3" />草稿</Badge>} />

        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-7">
            <section><div className="mb-3 flex items-center gap-2"><TargetIcon /><h2 className="section-title">测评目标</h2></div><Card className="p-5 text-sm leading-7 shadow-none">判断哪款 AI PPT 产品最适合普通职场用户制作商业汇报，重点关注内容质量、视觉呈现与后续编辑成本。</Card></section>

            <section><div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-600" /><h2 className="section-title">测试规则</h2></div><Card className="grid gap-px overflow-hidden bg-border shadow-none sm:grid-cols-2"><div className="contents">{rules.map((rule, index) => <div key={rule} className="flex items-center gap-3 bg-white px-4 py-3.5 text-sm"><span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">{index + 1}</span>{rule}</div>)}</div></Card></section>

            <section>
              <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-blue-600" /><h2 className="section-title">Test Cases</h2></div><span className="text-xs text-muted-foreground">4 Cases × 3 Products = 12 项测试</span></div>
              <div className="space-y-3">
                {testCases.map((testCase) => (
                  <Card key={testCase.id} className="px-5 shadow-none">
                    <Accordion type="single" collapsible>
                      <AccordionItem value={testCase.id}>
                        <AccordionTrigger><div className="flex items-center gap-4"><span className="font-mono text-[11px] text-blue-600">CASE {testCase.id}</span><span className="text-[15px] font-semibold">{testCase.title}</span></div></AccordionTrigger>
                        <AccordionContent>
                          <div className="grid gap-5 border-t pt-5 lg:grid-cols-2">
                            <Detail title="测试目的" text={testCase.purpose} />
                            <Detail title="输入材料" text={testCase.input} />
                            <div className="lg:col-span-2"><div className="eyebrow mb-2">Prompt</div><div className="rounded-md border bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-700">{testCase.prompt}</div></div>
                            <div className="lg:col-span-2"><div className="eyebrow mb-2">观察重点</div><div className="flex flex-wrap gap-2">{testCase.focus.map((item) => <Badge key={item} variant="neutral">{item}</Badge>)}</div></div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </Card>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
            <Card className="p-5 shadow-none"><div className="flex items-center gap-2"><Scale className="h-4 w-4 text-blue-600" /><h2 className="section-title">Rubric</h2></div><p className="mt-1.5 text-xs leading-5 text-muted-foreground">点击维度查看评分标准</p><div className="mt-5 space-y-1">{rubrics.map((rubric, index) => <Tooltip key={rubric.name}><TooltipTrigger asChild><button onClick={() => setSelectedRubric(index)} className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${selectedRubric === index ? "bg-blue-50" : "hover:bg-slate-50"}`}><div className="flex justify-between text-xs"><span className="font-medium">{rubric.name}</span><span className="font-semibold tabular-nums text-blue-700">{rubric.weight}%</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${rubric.weight * 4}%` }} /></div></button></TooltipTrigger><TooltipContent side="left">查看评分标准</TooltipContent></Tooltip>)}</div><div className="mt-4 rounded-md border bg-slate-50 p-3"><div className="text-xs font-semibold">{rubrics[selectedRubric].name} · 评分标准</div><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{rubrics[selectedRubric].standard}</p></div><div className="mt-4 flex justify-between border-t pt-4 text-xs font-semibold"><span>权重合计</span><span>100%</span></div></Card>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4"><div className="flex items-start gap-2.5"><Sparkles className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-xs font-semibold text-blue-950">公平性检查通过</p><p className="mt-1 text-[11px] leading-5 text-blue-800/70">所有产品使用相同输入、单次生成，Rubric 权重完整。</p></div></div></div>
          </aside>
        </div>

        <div className="sticky bottom-5 z-20 mt-9 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white shadow-xl"><div className="hidden items-center gap-3 sm:flex"><LockKeyhole className="h-4 w-4 text-slate-400" /><div><p className="text-xs font-medium">方案锁定后不可修改</p><p className="text-[10px] text-slate-400">4 Cases · 6 评分维度</p></div></div><Dialog><DialogTrigger asChild><Button size="lg" className="w-full bg-white text-slate-950 hover:bg-slate-100 sm:w-auto">锁定测评方案并开始测试<ArrowRight className="h-4 w-4" /></Button></DialogTrigger><DialogContent><div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-600"><LockKeyhole className="h-5 w-5" /></div><DialogTitle>确认锁定测评方案？</DialogTitle><DialogDescription>方案锁定后，本次测试的 Prompt 和评分标准将不能修改，以保证测评公平。</DialogDescription><div className="mt-6 flex justify-end gap-2"><Button variant="outline" asChild><Link href="/projects/demo/protocol">继续检查</Link></Button><Button asChild><Link href="/projects/demo/test">确认锁定并开始测试</Link></Button></div></DialogContent></Dialog></div>
      </div>
    </TooltipProvider>
  );
}

function TargetIcon() { return <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-50 text-blue-600"><span className="h-2 w-2 rounded-full border-2 border-blue-600" /></span>; }
function Detail({ title, text }: { title: string; text: string }) { return <div><div className="eyebrow mb-2">{title}</div><p className="text-xs leading-6 text-slate-600">{text}</p></div>; }

