"use client";

import Link from "next/link";
import { ArrowRight, Eye, EyeOff, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { WorkflowSteps } from "@/components/workflow-steps";
import { PageHeader } from "@/components/page-header";
import { MockLoader } from "@/components/mock-loader";
import { ScoreBar } from "@/components/score-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { blindSamples, testCases } from "@/lib/mock-data";

export default function ReviewPage() {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="page-shell">
      <MockLoader label="正在进行盲评..." duration={850} />
      <WorkflowSteps current={3} />
      <PageHeader eyebrow="项目 / AI PPT 产品横向测评" title="Blind Review" description="评分阶段隐藏产品身份，减少品牌偏见对判断的影响。" action={<Badge variant={revealed ? "warning" : "success"}>{revealed ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}{revealed ? "身份已揭晓" : "产品身份已隐藏"}</Badge>} />

      <div className="mb-7 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-blue-600" /><div><p className="text-sm font-semibold text-blue-950">盲评保护已启用</p><p className="mt-1 text-xs leading-5 text-blue-800/70">AI Judge 仅基于输出质量与 Rubric 评分，不接收产品名称、品牌或价格信息。</p></div></div>

      <Tabs defaultValue="01">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><h2 className="section-title">Case 评分结果</h2><TabsList>{testCases.map((item) => <TabsTrigger key={item.id} value={item.id}>Case {item.id}</TabsTrigger>)}</TabsList></div>
        {testCases.map((testCase, caseIndex) => (
          <TabsContent key={testCase.id} value={testCase.id}>
            <div className="mb-3 text-xs text-muted-foreground">CASE {testCase.id} · {testCase.title}</div>
            <div className="grid gap-4 xl:grid-cols-3">
              {blindSamples.map((sample) => (
                <Card key={sample.sample} className="overflow-hidden shadow-none">
                  <div className="flex items-center justify-between border-b bg-slate-50/70 px-5 py-4"><div><div className="text-sm font-semibold">{sample.sample}</div>{revealed && <div className="mt-0.5 text-[11px] font-medium text-blue-700">= {sample.product}</div>}</div><div className="text-right"><div className="text-2xl font-semibold tabular-nums">{Math.max(6.5, sample.score - caseIndex * .1).toFixed(1)}</div><div className="text-[10px] text-muted-foreground">综合分</div></div></div>
                  <div className="divide-y px-5">{sample.metrics.map((metric) => <details key={metric.name} className="group py-3"><summary className="cursor-pointer list-none"><div className="flex items-center justify-between"><span className="text-xs font-medium">{metric.name}</span><span className="text-xs font-semibold tabular-nums">{metric.score.toFixed(1)}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${metric.score * 10}%` }} /></div></summary><div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3 text-[11px] leading-5"><p><b>Reason</b> · {metric.reason}</p><p><b>Evidence</b> · {metric.evidence}</p><p><b>Confidence</b> · {metric.confidence}</p></div></details>)}</div>
                </Card>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <section className="mt-8 rounded-lg border bg-white p-5"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-600" /><h2 className="section-title">AI Judge 排名</h2></div><div className="mt-5 grid gap-4 sm:grid-cols-3">{blindSamples.map((sample, index) => <div key={sample.sample}><div className="mb-2 flex justify-between text-xs"><span className="font-medium">#{index + 1} {sample.sample}{revealed && <span className="ml-1 text-blue-600">· {sample.product}</span>}</span></div><ScoreBar value={sample.score} /></div>)}</div></section>

      <div className="sticky bottom-5 z-20 mt-8 flex justify-end gap-2 rounded-lg border bg-white/95 p-3 shadow-lg backdrop-blur">{!revealed && <Button variant="outline" onClick={() => setRevealed(true)}><Eye className="h-4 w-4" />揭晓产品</Button>}<Button asChild><Link href="/projects/demo/results">查看最终结果<ArrowRight className="h-4 w-4" /></Link></Button></div>
    </div>
  );
}

