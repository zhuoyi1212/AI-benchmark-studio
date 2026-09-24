"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, Download, FileText, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GenerateProtocolAction, LockProtocolAction, RemoveTestCaseAction } from "@/app/projects/[projectId]/protocol/protocol-actions";
import type { ExpectedOutputType, TestProtocol } from "@/lib/types/protocol";

const outputLabels: Record<ExpectedOutputType, string> = {
  text: "文本",
  image: "图片",
  document: "文档",
  video: "视频",
  code: "代码/项目",
  mixed: "混合输出",
};

export function ProtocolView({ protocol, productCount, canRegenerate, preserveHistory = false }: { protocol: TestProtocol; productCount: number; canRegenerate: boolean; preserveHistory?: boolean }) {
  const experienceMode = productCount === 1;
  const [selectedRubricId, setSelectedRubricId] = useState(protocol.rubric[0]?.id ?? "");
  const selectedRubric = protocol.rubric.find((item) => item.id === selectedRubricId) ?? protocol.rubric[0];
  const totalWeight = useMemo(() => protocol.rubric.reduce((total, item) => total + item.weight, 0), [protocol.rubric]);
  const totalTests = protocol.testCases.length * productCount;

  return (
    <>
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-7">
          <section>
            <div className="mb-3 flex items-center gap-2"><TargetIcon /><h2 className="section-title">{experienceMode ? "体验目标" : "测评目标"}</h2></div>
            <Card className="p-5 text-sm leading-7 shadow-none">{protocol.goal}</Card>
          </section>
          <section>
            <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-600" /><h2 className="section-title">测试规则</h2></div>
            <Card className="grid gap-px overflow-hidden bg-border shadow-none sm:grid-cols-2">
              {protocol.rules.map((rule, index) => <div key={rule.id} className="flex items-center gap-3 bg-white px-4 py-3.5 text-sm"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">{index + 1}</span>{rule.text}</div>)}
            </Card>
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between"><div><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-blue-600" /><h2 className="section-title">{experienceMode ? "体验任务" : "测试任务"}</h2></div>{protocol.status === "draft" && <p className="mt-1.5 text-xs text-muted-foreground">保留你想测的任务，删除不合适的任务；至少保留 1 个。</p>}</div><span className="text-xs text-muted-foreground">{experienceMode ? `${protocol.testCases.length} 个体验任务` : `${protocol.testCases.length} 个任务 × ${productCount} 个产品 = ${totalTests} 项测试`}</span></div>
            <div className="space-y-3">
              {protocol.testCases.map((testCase, index) => <Card key={testCase.id} className="px-5 shadow-none"><div className="flex items-start gap-2"><Accordion type="single" collapsible className="min-w-0 flex-1"><AccordionItem value={testCase.id}><AccordionTrigger><div className="flex items-center gap-4"><span className="font-mono text-[11px] text-blue-600">任务 {String(index + 1).padStart(2, "0")}</span><span className="text-left text-[15px] font-semibold">{testCase.title}</span></div></AccordionTrigger><AccordionContent><div className="grid gap-5 border-t pt-5 lg:grid-cols-2"><Detail title="测试目的" text={testCase.objective} /><InputMaterials description={testCase.inputDescription} artifacts={testCase.inputArtifacts ?? []} /><div><div className="eyebrow mb-2">预期输出</div><div className="flex flex-wrap gap-2">{testCase.expectedOutputTypes.map((type) => <Badge key={type} variant="neutral">{outputLabels[type]}</Badge>)}</div></div><div><div className="eyebrow mb-2">需要保留的证据</div><ul className="space-y-1 text-xs leading-5 text-slate-600">{testCase.evidenceRequirements.map((item) => <li key={item}>· {item}</li>)}</ul></div><div className="lg:col-span-2"><div className="eyebrow mb-2">Prompt</div><div className="whitespace-pre-wrap rounded-md border bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-700">{testCase.prompt}</div></div><div><div className="eyebrow mb-2">观察重点</div><div className="flex flex-wrap gap-2">{testCase.observationFocus.map((item) => <Badge key={item} variant="neutral">{item}</Badge>)}</div></div><div><div className="eyebrow mb-2">执行规则</div><ul className="space-y-1 text-xs leading-5 text-slate-600">{testCase.executionRules?.map((rule) => <li key={rule}>· {rule}</li>)}</ul></div></div></AccordionContent></AccordionItem></Accordion>{protocol.status === "draft" && <div className="pt-3"><RemoveTestCaseAction projectId={protocol.projectId} protocolId={protocol.id} testCaseId={testCase.id} title={testCase.title} disabled={protocol.testCases.length <= 1} /></div>}</div></Card>)}
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
          <Card className="p-5 shadow-none">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-600" /><h2 className="section-title">快速测评主线</h2></div>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">主流程只依赖 Test Cases、观察重点和真实 Artifact。完成测试后直接提炼 Findings，不需要先打分。</p>
            <div className="mt-4 space-y-2 border-t pt-4 text-xs text-slate-700">
              <div className="flex justify-between"><span>测试任务</span><strong>{protocol.testCases.length}</strong></div>
              <div className="flex justify-between"><span>执行方式</span><strong>真实测试 + 留证</strong></div>
              <div className="flex justify-between"><span>下一步</span><strong>Findings</strong></div>
            </div>
          </Card>
          <details className="rounded-lg border bg-white p-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold"><Scale className="h-4 w-4 text-slate-500" />专业评分配置（可选）</summary>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">只有主动进入“专业评分”时才使用这些 Rubric。快速测评不会读取分数。</p>
            <div className="mt-4 space-y-1">{protocol.rubric.map((rubric) => <button type="button" key={rubric.id} onClick={() => setSelectedRubricId(rubric.id)} className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${selectedRubric?.id === rubric.id ? "bg-slate-100" : "hover:bg-slate-50"}`}><div className="flex justify-between gap-3 text-xs"><span className="font-medium">{rubric.name}</span><span className="font-semibold tabular-nums text-slate-600">{rubric.weight}%</span></div></button>)}</div>
            {selectedRubric && <div className="mt-3 rounded-md bg-slate-50 p-3"><div className="text-xs font-semibold">{selectedRubric.name} · 优秀标准</div><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{selectedRubric.scoringStandard.excellent}</p></div>}
            <div className="mt-3 flex justify-between border-t pt-3 text-[11px]"><span>专业 Rubric 权重</span><span>{totalWeight}%</span></div>
          </details>
          <div className={`rounded-lg border p-4 ${totalWeight === 100 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><div className="flex items-start gap-2.5"><ShieldCheck className={`mt-0.5 h-4 w-4 ${totalWeight === 100 ? "text-emerald-600" : "text-amber-600"}`} /><div><p className="text-xs font-semibold">{totalWeight === 100 ? "测试计划检查通过" : "专业评分配置异常"}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{totalWeight === 100 ? "任务、证据要求和观察重点可以直接进入真实测试；专业 Rubric 已预备，但不会阻塞快速 Findings。" : "请重新生成方案，确保可选的专业评分配置完整。"}</p></div></div></div>
        </aside>
      </div>

      <div className="sticky bottom-5 z-20 mt-9 flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white shadow-xl">
        <div className="hidden items-center gap-3 sm:flex">{protocol.status === "locked" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <LockKeyhole className="h-4 w-4 text-slate-400" />}<div><p className="text-xs font-medium">{protocol.status === "locked" ? `Protocol v${protocol.version} 已锁定` : `Protocol v${protocol.version} 锁定后不可修改`}</p><p className="text-[10px] text-slate-400">{experienceMode ? `${protocol.testCases.length} 个体验任务` : `${protocol.testCases.length} Cases`} · 真实证据优先 · 专业评分可选</p></div></div>
        <div className="ml-auto flex items-center gap-2">{canRegenerate && <GenerateProtocolAction projectId={protocol.projectId} regenerate experienceMode={experienceMode} preserveHistory={preserveHistory} />}{protocol.status === "draft" && totalWeight === 100 ? <LockProtocolAction projectId={protocol.projectId} protocolId={protocol.id} testCaseCount={protocol.testCases.length} rubricCount={protocol.rubric.length} experienceMode={experienceMode} /> : protocol.status === "locked" ? <Button size="lg" className="bg-white text-slate-950 hover:bg-slate-100" asChild><Link href={`/projects/${protocol.projectId}/test`}>进入测试执行<ArrowRight className="h-4 w-4" /></Link></Button> : null}</div>
      </div>
    </>
  );
}

function TargetIcon() { return <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-50 text-blue-600"><span className="h-2 w-2 rounded-full border-2 border-blue-600" /></span>; }
function Detail({ title, text }: { title: string; text: string }) { return <div><div className="eyebrow mb-2">{title}</div><p className="whitespace-pre-wrap text-xs leading-6 text-slate-600">{text}</p></div>; }

function InputMaterials({ description, artifacts }: { description?: string; artifacts: NonNullable<TestProtocol["testCases"][number]["inputArtifacts"]> }) {
  return <div><div className="eyebrow mb-2">输入材料</div><p className="text-xs leading-6 text-slate-600">{description ?? (artifacts.length > 0 ? "下载后与 Prompt 一起提交。" : "Prompt 已包含完成任务所需信息，无额外输入材料。")}</p>{artifacts.length > 0 && <div className="mt-2 space-y-2">{artifacts.map((artifact) => artifact.downloadUrl ? <a key={artifact.id} href={artifact.downloadUrl} download className="flex items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50"><FileText className="h-4 w-4 text-blue-600" /><span className="min-w-0 flex-1 truncate">{artifact.name}</span><Download className="h-3.5 w-3.5" /></a> : <div key={artifact.id} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">旧版本未保存“{artifact.name}”的文件内容，请重新生成 Protocol。</div>)}</div>}</div>;
}
