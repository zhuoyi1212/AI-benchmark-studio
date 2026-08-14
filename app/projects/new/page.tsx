"use client";

import { ArrowLeft, ArrowRight, Globe2, LoaderCircle, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { mockNewProjectDraft } from "@/lib/mock/project.mock";

type DraftProduct = { name: string; website: string };

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState(mockNewProjectDraft.name);
  const [intent, setIntent] = useState(mockNewProjectDraft.intent);
  const [items, setItems] = useState<DraftProduct[]>(mockNewProjectDraft.products.map((item) => ({ name: item.name, website: item.officialUrl ?? "" })));
  const [loading, setLoading] = useState(false);

  const updateItem = (index: number, key: keyof DraftProduct, value: string) => setItems((current) => current.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const start = () => {
    if (!name.trim() || items.some((item) => !item.name.trim()) || !intent.trim()) return;
    setLoading(true); window.setTimeout(() => router.push("/projects/demo/research"), 900);
  };

  return (
    <div className="page-shell max-w-[980px]">
      <Link href="/projects" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回我的测评</Link>
      <PageHeader title="新建测评" description="告诉我们你想比较什么。AI 将先调研产品，再为你生成可复现的测试方案。" />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="p-6 shadow-none">
          <div className="space-y-7">
            <label className="block"><span className="mb-2 block text-sm font-medium">测评名称</span><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：AI 产品横向测评" /></label>
            <div>
              <div className="mb-2 flex items-end justify-between"><div><span className="block text-sm font-medium">测评产品</span><span className="mt-1 block text-xs text-muted-foreground">添加 1–3 个产品</span></div><span className="text-xs tabular-nums text-muted-foreground">{items.length} / 3</span></div>
              <div className="space-y-2.5">
                {items.map((item, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_36px]">
                    <Input aria-label={`产品 ${index + 1} 名称`} value={item.name} onChange={(event) => updateItem(index, "name", event.target.value)} placeholder="产品名称" />
                    <div className="relative"><Globe2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={item.website} onChange={(event) => updateItem(index, "website", event.target.value)} placeholder="官网（可选）" /></div>
                    <Button aria-label="移除产品" variant="ghost" size="icon" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
              {items.length < 3 && <Button className="mt-3" variant="outline" size="sm" onClick={() => setItems((current) => [...current, { name: "", website: "" }])}><Plus className="h-3.5 w-3.5" />添加产品</Button>}
            </div>
            <label className="block"><span className="mb-2 block text-sm font-medium">我想测什么</span><Textarea value={intent} onChange={(event) => setIntent(event.target.value)} rows={5} placeholder="描述你的核心问题、目标用户和使用场景…" /><span className="mt-1.5 block text-right text-[11px] text-muted-foreground">{intent.length} 字</span></label>
          </div>
          <div className="mt-8 flex justify-end border-t pt-5"><Button size="lg" onClick={start} disabled={loading || !name.trim() || !intent.trim()}>{loading ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在分析产品...</> : <>开始分析<ArrowRight className="h-4 w-4" /></>}</Button></div>
        </Card>
        <aside className="h-fit rounded-lg border bg-slate-50 p-5"><div className="eyebrow">接下来</div><ol className="mt-4 space-y-4">{["调研产品定位与能力", "判断是否适合横向比较", "生成共同任务与评分框架"].map((text, index) => <li key={text} className="flex gap-3 text-xs leading-5 text-slate-600"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border bg-white text-[10px] font-semibold">{index + 1}</span>{text}</li>)}</ol><p className="mt-5 border-t pt-4 text-[11px] leading-5 text-muted-foreground">当前为 Mock 模式，不会访问官网或调用 AI API。</p></aside>
      </div>
    </div>
  );
}
