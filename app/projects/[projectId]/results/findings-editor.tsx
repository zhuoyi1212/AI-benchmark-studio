"use client";

import { useActionState, useMemo, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { confirmFindingsAction, type ResultAnalysisActionState } from "@/app/projects/[projectId]/results/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ExperienceFindingsOutput } from "@/lib/ai/schemas/findings.schemas";

const initialState: ResultAnalysisActionState = { message: null };
const labels = { good: "好用", neutral: "一般", problem: "问题" } as const;

export function FindingsEditor({
  projectId,
  findingsId,
  initial,
}: {
  projectId: string;
  findingsId: string;
  initial: ExperienceFindingsOutput;
}) {
  const [state, action, pending] = useActionState(confirmFindingsAction, initialState);
  const [summary, setSummary] = useState(initial.summary);
  const [limitations, setLimitations] = useState(initial.limitations.join("\n"));
  const [items, setItems] = useState(() => initial.findings.map((item) => ({ ...item, included: true })));
  const selectedCount = items.filter((item) => item.included).length;
  const payload = useMemo(() => JSON.stringify({
    summary,
    findings: items.filter((item) => item.included).map(({ included: _included, ...item }) => item),
    limitations: limitations.split("\n").map((item) => item.trim()).filter(Boolean),
  }), [summary, items, limitations]);

  const patch = (id: string, values: Partial<(typeof items)[number]>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...values } : item));
  };

  return <form action={action}>
    <input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="findingsId" value={findingsId} />
    <input type="hidden" name="payload" value={payload} />

    <Card className="p-5 shadow-none">
      <div className="eyebrow text-blue-600">人工确认 Findings</div>
      <h2 className="mt-2 text-xl font-semibold">留下真正值得写进内容的发现</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">这里不是改分数。你可以删除不值得写的发现、调整“好用/一般/问题”分类，并修改结论措辞。</p>
      <label className="mt-5 block text-xs font-medium">整体感受</label>
      <Textarea className="mt-2 min-h-24" value={summary} onChange={(event) => setSummary(event.target.value)} />
    </Card>

    <div className="mt-4 space-y-3">
      {items.map((item, index) => <Card key={item.id} className={item.included ? "p-5 shadow-none" : "p-5 opacity-50 shadow-none"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-medium">
            <input type="checkbox" checked={item.included} onChange={(event) => patch(item.id, { included: event.target.checked })} />
            保留这条发现
          </label>
          <div className="flex items-center gap-2">
            <Badge variant="neutral">#{index + 1}</Badge>
            <select
              aria-label="发现分类"
              value={item.category}
              onChange={(event) => patch(item.id, { category: event.target.value as typeof item.category })}
              className="h-8 rounded-md border bg-white px-2 text-xs"
              disabled={!item.included}
            >
              {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 grid gap-4">
          <label className="block"><span className="text-xs font-medium">发现标题</span><Input className="mt-2" value={item.title} disabled={!item.included} onChange={(event) => patch(item.id, { title: event.target.value })} /></label>
          <label className="block"><span className="text-xs font-medium">实际观察</span><Textarea className="mt-2 min-h-24" value={item.observation} disabled={!item.included} onChange={(event) => patch(item.id, { observation: event.target.value })} /></label>
          <label className="block"><span className="text-xs font-medium">对用户的影响</span><Textarea className="mt-2 min-h-20" value={item.impact} disabled={!item.included} onChange={(event) => patch(item.id, { impact: event.target.value })} /></label>
          <div className="text-[11px] text-muted-foreground">真实证据：{item.evidenceArtifactIds.length} 个 Artifact · 置信度 {Math.round(item.confidence * 100)}%</div>
        </div>
      </Card>)}
    </div>

    <Card className="mt-4 p-5 shadow-none">
      <label className="block text-xs font-medium">测试限制（每行一条）</label>
      <Textarea className="mt-2 min-h-24" value={limitations} onChange={(event) => setLimitations(event.target.value)} />
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">已保留 {selectedCount} 条发现。至少保留 2 条，确认后即可直接生成社区内容。</p>
        <Button type="submit" size="lg" disabled={pending || selectedCount < 2}>
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          确认 Findings
        </Button>
      </div>
      {state.message && <p role="alert" className="mt-3 text-xs text-red-600">{state.message}</p>}
    </Card>
  </form>;
}
