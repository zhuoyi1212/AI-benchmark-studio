"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Globe2, LoaderCircle, Plus, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createProjectAction, type CreateProjectActionState } from "@/app/projects/new/actions";
import type { EvaluationMode } from "@/lib/project-mode";
import type { ProductOption } from "@/lib/services/product-library.service";
import { findProductCandidates } from "@/lib/product-selection";

type DraftProduct = { key: number; name: string; website: string; productId?: string };

const initialState: CreateProjectActionState = { message: null };

export function ProjectForm({ productOptions = [], initialProduct }: { productOptions?: ProductOption[]; initialProduct?: ProductOption }) {
  const [state, formAction, pending] = useActionState(createProjectAction, initialState);
  const [products, setProducts] = useState<DraftProduct[]>([{ key: 1, name: initialProduct?.name ?? "", website: initialProduct?.officialUrl ?? "", productId: initialProduct?.id }]);
  const [nextKey, setNextKey] = useState(2);
  const [intent, setIntent] = useState("");
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>("quick");
  const [showDetails, setShowDetails] = useState(false);
  const singleMode = products.length === 1;

  const updateProduct = (key: number, field: "name" | "website", value: string) => {
    setProducts((current) => current.map((product) => product.key === key ? { ...product, [field]: value } : product));
  };

  const addProduct = () => {
    setProducts((current) => [...current, { key: nextKey, name: "", website: "" }]);
    setNextKey((current) => current + 1);
  };

  return (
    <form action={formAction}>
      <input type="hidden" name="evaluationMode" value={evaluationMode} />
      <div className="space-y-7">
        <div>
          <span className="mb-2 block text-sm font-medium">测评模式</span>
          <div className="grid grid-cols-2 rounded-lg border bg-slate-50 p-1" role="radiogroup" aria-label="测评模式">
            {(["quick", "professional"] as const).map((mode) => <button key={mode} type="button" role="radio" aria-checked={evaluationMode === mode} onClick={() => setEvaluationMode(mode)} className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${evaluationMode === mode ? "bg-white text-blue-700 shadow-sm" : "text-muted-foreground hover:text-slate-900"}`}>{mode === "quick" ? "快速模式" : "专业模式"}</button>)}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{evaluationMode === "quick" ? "默认复用产品调研，只生成一个核心任务，并在上传完成后自动推进评分与 Findings。" : "保留多个 Case、完整评分复核、结果分析和深度报告。"}</p>
          {evaluationMode === "quick" && <Button type="button" variant="ghost" size="sm" className="mt-1 px-0 text-xs" onClick={() => setShowDetails((value) => !value)}><Settings2 className="h-3.5 w-3.5" />详细设置</Button>}
          {showDetails && evaluationMode === "quick" && <div className="mt-2 rounded-md border bg-white p-3 text-xs leading-5 text-muted-foreground">同一 Prompt、同一输入、每个产品执行一次；上传任一有效原始 Artifact 后即可分析。Protocol 锁定规则保持不变。</div>}
        </div>
        <div className="rounded-lg border bg-slate-50 p-4">
          <div className="text-xs font-semibold text-slate-900">{singleMode ? "单品体验" : "横向对比"}</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {singleMode
              ? "当前将深入体验这一款产品，生成体验任务、评分结论与深度体验报告。"
              : "当前将使用统一任务对多款产品进行标准化横向比较。"}
          </p>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">测评名称</span>
          <Input name="name" maxLength={120} required placeholder={singleMode ? "例如：深度体验某款 AI 产品" : "例如：AI 产品横向测评"} />
        </label>
        <div>
          <div className="mb-2 flex items-end justify-between">
            <div><span className="block text-sm font-medium">测评产品</span><span className="mt-1 block text-xs text-muted-foreground">1 个产品为单品体验，2–3 个产品为横向对比</span></div>
            <span className="text-xs tabular-nums text-muted-foreground">{products.length} / 3</span>
          </div>
          <div className="space-y-2.5">
            {products.map((product, index) => (
              <div key={product.key} className="rounded-lg border p-3">
              <input type="hidden" name="productId" value={product.productId ?? ""} />
              <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_36px]">
                <Input
                  aria-label={`产品 ${index + 1} 名称`}
                  name="productName"
                  value={product.name}
                  maxLength={120}
                  required
                  readOnly={Boolean(product.productId)}
                  onChange={(event) => updateProduct(product.key, "name", event.target.value)}
                  placeholder="产品名称"
                />
                <div className="relative">
                  <Globe2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    aria-label={`产品 ${index + 1} 官网`}
                    className="pl-9"
                    name="productWebsite"
                    type="url"
                    value={product.website}
                    readOnly={Boolean(product.productId)}
                    onChange={(event) => updateProduct(product.key, "website", event.target.value)}
                    placeholder="官网（可选）"
                  />
                </div>
                <Button
                  aria-label="移除产品"
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={products.length === 1 || pending}
                  onClick={() => setProducts((current) => current.filter((item) => item.key !== product.key))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {product.productId ? <div className="mt-2 flex items-center justify-between text-xs"><span className="text-emerald-700">已关联产品库 · 优先复用已有调研</span><button type="button" disabled={pending} className="text-blue-700 hover:underline" onClick={() => setProducts(current => current.map(item => item.key === product.key ? { key: item.key, name: "", website: "" } : item))}>更换产品</button></div>
                : <div className="mt-2 flex flex-wrap gap-2">{findProductCandidates(productOptions, product.name, product.website).map(option => {
                  const selected = products.some(item => item.productId === option.id);
                  return <button key={option.id} type="button" disabled={pending || selected} className="rounded-md bg-slate-50 px-2.5 py-2 text-left text-xs hover:bg-blue-50 disabled:opacity-50" onClick={() => setProducts(current => current.map(item => item.key === product.key ? { ...item, productId: option.id, name: option.name, website: option.officialUrl ?? "" } : item))}><span className="font-medium">{option.name}</span><span className="ml-2 text-muted-foreground">{selected ? "已添加" : "使用已有产品"}</span>{option.officialUrl && <span className="mt-1 block max-w-xs truncate text-muted-foreground">{option.officialUrl}</span>}</button>;
                })}</div>}
              </div>
            ))}
          </div>
          {products.length < 3 && (
            <Button className="mt-3" type="button" variant="outline" size="sm" disabled={pending} onClick={addProduct}>
              <Plus className="h-3.5 w-3.5" />添加产品
            </Button>
          )}
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">我想测什么</span>
          <Textarea
            name="intent"
            value={intent}
            maxLength={4000}
            required
            onChange={(event) => setIntent(event.target.value)}
            rows={5}
            placeholder={singleMode ? "描述你想重点体验的能力、真实使用场景和最关心的问题…" : "描述你的核心问题、目标用户和希望比较的使用场景…"}
          />
          <span className="mt-1.5 block text-right text-[11px] text-muted-foreground">{intent.length} 字</span>
        </label>
        {state.message && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
      </div>
      <div className="mt-8 flex justify-end border-t pt-5">
        <Button size="lg" type="submit" disabled={pending}>
          {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在保存项目...</> : <>开始分析<ArrowRight className="h-4 w-4" /></>}
        </Button>
      </div>
    </form>
  );
}
