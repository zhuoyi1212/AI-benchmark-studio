import type { Metadata } from "next";
import { ArrowRight, Check, FileCheck2, FlaskConical, LockKeyhole, ScanSearch, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "AI Benchmark Studio｜有证据的 AI 产品测评",
  description: "从真实测试证据到测评发现与内容成稿的 AI 产品测评工作流。",
};

const workflow = [
  ["01", "产品调研", "核对能力、限制与输入边界"],
  ["02", "测试计划", "生成可执行任务与统一标准"],
  ["03", "真实测试", "人工操作并保存原始结果"],
  ["04", "测评发现", "AI 分析，人工确认事实边界"],
  ["05", "内容生成", "基于证据写作、润色与核验"],
];

const principles = [
  { icon: ScanSearch, title: "Evidence first", text: "结论必须回到原始文本、图片或视频。" },
  { icon: FileCheck2, title: "Human confirmed", text: "关键发现由人确认，保留实验与修改历史。" },
  { icon: LockKeyhole, title: "Explicit failure", text: "失败阶段明确可见、可重试，不伪造成功结果。" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="mx-auto flex h-20 w-full max-w-[1240px] items-center justify-between px-6 lg:px-10">
        <a href="#top" className="flex items-center gap-3" aria-label="AI Benchmark Studio 首页">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-white"><FlaskConical className="h-5 w-5" /></span>
          <span>
            <span className="block text-sm font-semibold tracking-tight">AI Benchmark</span>
            <span className="block text-[10px] tracking-[0.16em] text-slate-500">STUDIO</span>
          </span>
        </a>
        <a href="/projects" className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium shadow-sm transition hover:border-slate-400 hover:bg-slate-50">
          进入工作台 <LockKeyhole className="h-3.5 w-3.5 text-slate-500" />
        </a>
      </header>

      <section id="top" className="mx-auto grid w-full max-w-[1240px] gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.08fr_.92fr] lg:px-10 lg:pb-28 lg:pt-24">
        <div className="max-w-[680px]">
          <p className="eyebrow text-blue-600">AI PRODUCT EVALUATION WORKFLOW</p>
          <h1 className="mt-5 text-[44px] font-semibold leading-[1.08] tracking-[-0.045em] sm:text-[58px] lg:text-[68px]">
            把一次真实 AI 测试，<br className="hidden sm:block" />变成有证据的内容
          </h1>
          <p className="mt-7 max-w-[590px] text-base leading-8 text-slate-600 sm:text-lg">
            从产品调研、测试计划到原始证据、测评发现和文章成稿，一条可追溯的生成链路。
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href="#workflow" className="inline-flex h-11 items-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">
              查看演示流程 <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#case" className="inline-flex h-11 items-center rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold transition hover:border-slate-400 hover:bg-slate-50">查看脱敏案例</a>
          </div>
        </div>

        <div className="relative self-end overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950 p-7 text-white shadow-[0_24px_80px_rgba(15,23,42,.16)] sm:p-9">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/25 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>WORKFLOW STATUS</span>
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-emerald-300">Evidence ready</span>
            </div>
            <div className="mt-12 space-y-4">
              {[["原始测试结果", "已保存"], ["测评发现", "已确认"], ["内容核验", "已通过"]].map(([label, status]) => (
                <div key={label} className="flex items-center gap-3 border-b border-white/10 pb-4 text-sm">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-400/15 text-emerald-300"><Check className="h-3.5 w-3.5" /></span>
                  <span>{label}</span><span className="ml-auto text-slate-400">{status}</span>
                </div>
              ))}
            </div>
            <div className="mt-9 flex items-end justify-between">
              <div><p className="text-xs text-slate-500">OUTPUT</p><p className="mt-1 text-xl font-semibold">可发布体验稿</p></div>
              <Sparkles className="h-7 w-7 text-blue-300" />
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-[1240px] px-6 py-20 lg:px-10 lg:py-24">
          <p className="eyebrow">WORKFLOW</p>
          <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">一条链路，五个清晰阶段</h2>
            <p className="text-sm text-slate-500">关键数据有来源，失败可以重试</p>
          </div>
          <ol className="mt-12 grid overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 lg:grid-cols-5">
            {workflow.map(([number, title, text]) => (
              <li key={number} className="border-b border-slate-200 p-6 last:border-0 lg:min-h-52 lg:border-b-0 lg:border-r">
                <span className="text-xs font-semibold text-blue-600">{number}</span>
                <h3 className="mt-8 text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-500">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="case" className="mx-auto grid w-full max-w-[1240px] gap-10 px-6 py-20 lg:grid-cols-[.78fr_1.22fr] lg:px-10 lg:py-28">
        <div>
          <p className="eyebrow text-blue-600">REDACTED DEMO</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">从一次回答到一条可信结论</h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-slate-600">以下为脱敏演示案例，仅说明工作方法，不读取或展示真实项目数据。</p>
        </div>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-px bg-slate-200 sm:grid-cols-2">
            <div className="bg-white p-6"><p className="eyebrow">测试任务</p><p className="mt-3 text-sm leading-7">让 AI 写作助手根据一段有限长度的材料，生成结构清晰的内容。</p></div>
            <div className="bg-white p-6"><p className="eyebrow">原始观察</p><p className="mt-3 text-sm leading-7">回答给出 3 个明确步骤，但没有主动询问缺失信息。</p></div>
          </div>
          <div className="p-6 sm:p-8">
            <p className="eyebrow">确认后的发现</p>
            <blockquote className="mt-4 border-l-2 border-blue-500 pl-5 text-xl font-medium leading-9 tracking-[-0.015em]">
              步骤可以直接执行，但结论只覆盖本次提供的信息；材料不完整时，建议需要由用户继续补充背景。
            </blockquote>
            <div className="mt-7 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1.5">来源可追溯</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5">范围已限定</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5">人工已确认</span>
            </div>
          </div>
        </article>
      </section>

      <section className="bg-slate-950 text-white">
        <div className="mx-auto w-full max-w-[1240px] px-6 py-20 lg:px-10 lg:py-24">
          <p className="eyebrow text-slate-500">DESIGN PRINCIPLES</p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {principles.map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[.035] p-6">
                <item.icon className="h-5 w-5 text-blue-300" />
                <h3 className="mt-7 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-20 flex flex-col justify-between gap-6 border-t border-white/10 pt-10 sm:flex-row sm:items-center">
            <div><p className="text-2xl font-semibold tracking-[-0.025em]">AI Benchmark Studio</p><p className="mt-2 text-sm text-slate-400">真实证据驱动的 AI 产品测评工作台</p></div>
            <a href="/projects" className="inline-flex h-11 w-fit items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">进入受保护工作台 <ArrowRight className="h-4 w-4" /></a>
          </div>
        </div>
      </section>
    </main>
  );
}
