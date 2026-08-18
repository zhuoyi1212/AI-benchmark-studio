"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GenerateProtocolAction, LockProtocolAction } from "@/app/projects/[projectId]/protocol/protocol-actions";
import type { ExpectedOutputType, TestProtocol } from "@/lib/types/protocol";

const outputLabels: Record<ExpectedOutputType, string> = {
  text: "文本",
  image: "图片",
  document: "文档",
  video: "视频",
  code: "代码/项目",
  mixed: "混合输出",
};

export function ProtocolView({ protocol, productCount, canRegenerate }: { protocol: TestProtocol; productCount: number; canRegenerate: boolean }) {
  const [selectedRubricId, setSelectedRubricId] = useState(protocol.rubric[0]?.id ?? "");
  const selectedRubric = protocol.rubric.find((item) => item.id === selectedRubricId) ?? protocol.rubric[0];
  const totalWeight = useMemo(() => protocol.rubric.reduce((total, item) => total + item.weight, 0), [protocol.rubric]);
  const totalTests = protocol.testCases.length * productCount;

  return (
    <>
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-7">
          <section>
            <div className="mb-3 flex items-center gap-2"><TargetIcon /><h2 className="section-title">测评目标</h2></div>
            <Card className="p-5 text-sm leading-7 shadow-none">{protocol.goal}</Card>
          </section>
          <section>
            <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-600" /><h2 className="section-title">测试规则</h2></div>
            <Card className="grid gap-px overflow-hidden bg-border shadow-none sm:grid-cols-2">
              {protocol.rules.map((rule, index) => <div key={rule.id} className="flex items-center gap-3 bg-white px-4 py-3.5 text-sm"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">{index + 1}</span>{rule.text}</div>)}
            </Card>
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-blue-600" /><h2 className="section-title">Test Cases</h2></div><span className="text-xs text-muted-foreground">{protocol.testCases.length} Cases × {productCount} Products = {totalTests} 项测试</span></div>
            <div className="space-y-3">
              {protocol.testCases.map((testCase, index) => <Card key={testCase.id} className="px-5 shadow-none"><Accordion type="single" collapsible><AccordionItem value={testCase.id}><AccordionTrigger><div className="flex items-center gap-4"><span className="font-mono text-[11px] text-blue-600">CASE {String(index + 1).padStart(2, "0")}</span><span className="text-left text-[15px] font-semibold">{testCase.title}</span></div></AccordionTrigger><AccordionContent><div className="grid gap-5 border-t pt-5 lg:grid-cols-2"><Detail title="测试目的" text={testCase.objective} /><Detail title="输入材料" text={testCase.inputDescription ?? "Prompt 已包含完成任务所需信息，无额外输入材料。"} /><div><div className="eyebrow mb-2">预期输出</div><div className="flex flex-wrap gap-2">{testCase.expectedOutputTypes.map((type) => <Badge key={type} variant="neutral">{outputLabels[type]}</Badge>)}</div></div><div><div className="eyebrow mb-2">需要保留的证据</div><ul className="space-y-1 text-xs leading-5 text-slate-600">{testCase.evidenceRequirements.map((item) => <li key={item}>· {item}</li>)}</ul></div><div className="lg:col-span-2"><div className="eyebrow mb-2">Prompt</div><div className="whitespace-pre-wrap rounded-md border bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-700">{testCase.prompt}</div></div><div><div className="eyebrow mb-2">观察重点</div><div className="flex flex-wrap gap-2">{testCase.observationFocus.map((item) => <Badge key={item} variant="neutral">{item}</Badge>)}</div></div><div><div className="eyebrow mb-2">执行规则</div><ul className="space-y-1 text-xs leading-5 text-slate-600">{testCase.executionRules?.map((rule) => <li key={rule}>· {rule}</li>)}</ul></div></div></AccordionContent></AccordionItem></Accordion></Card>)}
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
          <Card className="p-5 shadow-none">
            <div className="flex items-center gap-2"><Scale className="h-4 w-4 text-blue-600" /><h2 className="section-title">Rubric</h2></div>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">点击维度查看四档评分标准</p>
            <div className="mt-5 space-y-1">{protocol.rubric.map((rubric) => <button key={rubric.id} onClick={() => setSelectedRubricId(rubric.id)} className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${selectedRubric?.id === rubric.id ? "bg-blue-50" : "hover:bg-slate-50"}`}><div className="flex justify-between gap-3 text-xs"><span className="font-medium">{rubric.name}</span><span className="font-semibold tabular-nums text-blue-700">{rubric.weight}%</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${rubric.weight}%` }} /></div></button>)}</div>
            {selectedRubric && <div className="mt-4 rounded-md border bg-slate-50 p-3"><div className="text-xs font-semibold">{selectedRubric.name} · 优秀标准</div><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{selectedRubric.scoringStandard.excellent}</p></div>}
            <div className="mt-4 flex justify-between border-t pt-4 text-xs font-semibold"><span>权重合计</span><span className={totalWeight === 100 ? "text-emerald-700" : "text-amber-700"}>{totalWeight}%</span></div>
          </Card>
          <div className={`rounded-lg border p-4 ${totalWeight === 100 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><div className="flex items-start gap-2.5"><ShieldCheck className={`mt-0.5 h-4 w-4 ${totalWeight === 100 ? "text-emerald-600" : "text-amber-600"}`} /><div><p className="text-xs font-semibold">{totalWeight === 100 ? "公平性检查通过" : "Rubric 权重无效"}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">同一 Case 对所有产品使用相同输入与 Prompt，Rubric 权重必须合计 100%。</p></div></div></div>
        </aside>
      </div>

      <div className="sticky bottom-5 z-20 mt-9 flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white shadow-xl">
        <div className="hidden items-center gap-3 sm:flex">{protocol.status === "locked" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <LockKeyhole className="h-4 w-4 text-slate-400" />}<div><p className="text-xs font-medium">{protocol.status === "locked" ? `Protocol v${protocol.version} 已锁定` : `Protocol v${protocol.version} 锁定后不可修改`}</p><p className="text-[10px] text-slate-400">{protocol.testCases.length} Cases · {protocol.rubric.length} 评分维度</p></div></div>
        <div className="ml-auto flex items-center gap-2">{canRegenerate && <GenerateProtocolAction projectId={protocol.projectId} regenerate />}{protocol.status === "draft" && totalWeight === 100 ? <LockProtocolAction projectId={protocol.projectId} protocolId={protocol.id} testCaseCount={protocol.testCases.length} rubricCount={protocol.rubric.length} /> : protocol.status === "locked" ? <Button size="lg" className="bg-white text-slate-950 hover:bg-slate-100" asChild><Link href={`/projects/${protocol.projectId}/test`}>进入测试执行<ArrowRight className="h-4 w-4" /></Link></Button> : null}</div>
      </div>
    </>
  );
}

function TargetIcon() { return <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-50 text-blue-600"><span className="h-2 w-2 rounded-full border-2 border-blue-600" /></span>; }
function Detail({ title, text }: { title: string; text: string }) { return <div><div className="eyebrow mb-2">{title}</div><p className="whitespace-pre-wrap text-xs leading-6 text-slate-600">{text}</p></div>; }
