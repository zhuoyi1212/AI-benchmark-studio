import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, Clock3, Database, Download, FlaskConical, Quote, Trophy } from "lucide-react";
import { ProductLogo } from "@/components/product-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { productScores, testCases } from "@/lib/mock-data";

const toc = ["TL;DR", "最终排名", "为什么测试", "我们怎么测试", "Case 复盘", "产品优缺点", "最终推荐", "测试限制"];

export default function ReportPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="border-b bg-[#fafafa]"><div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-3 lg:px-10"><Link href="/projects/demo/results" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回结果</Link><div className="flex items-center gap-2"><Badge variant="success"><Check className="h-3 w-3" />报告已生成</Badge><Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" />导出</Button></div></div></div>
      <article className="mx-auto max-w-[1180px] px-6 pb-24 pt-12 lg:px-10">
        <header className="max-w-4xl"><div className="eyebrow text-blue-600">AI 产品深度测评 · 2026</div><h1 className="mt-4 text-4xl font-semibold leading-[1.15] tracking-[-.045em] text-slate-950 sm:text-5xl">Gamma、Canva、Beautiful.ai：谁才是最好用的 AI PPT？</h1><p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">我们用 4 类真实工作任务、12 次独立生成和统一评分框架，测试三款主流 AI 演示工具。结果比“谁更好看”复杂得多。</p><div className="mt-7 flex flex-wrap items-center gap-5 border-t pt-5 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5" />AI Benchmark Studio</span><span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />18 分钟阅读</span><span>更新于 2026-08-14</span></div></header>

        <div className="mt-12 grid gap-12 lg:grid-cols-[180px_minmax(0,760px)] xl:grid-cols-[180px_minmax(0,760px)_1fr]">
          <aside className="hidden lg:block"><div className="sticky top-6"><div className="eyebrow mb-3">目录</div><nav className="space-y-1">{toc.map((item, index) => <a key={item} href={`#section-${index}`} className="block border-l-2 border-slate-100 py-1.5 pl-3 text-xs text-muted-foreground hover:border-blue-600 hover:text-foreground">{item}</a>)}</nav></div></aside>
          <main className="min-w-0 space-y-14">
            <Section id="section-0" number="01" title="TL;DR"><div className="rounded-xl border border-blue-200 bg-blue-50/50 p-6"><div className="flex gap-3"><Quote className="h-5 w-5 shrink-0 text-blue-600" /><div><p className="text-lg font-semibold leading-7">如果你只想最快做出一份结构靠谱的商业汇报，选 Gamma。</p><p className="mt-3 text-sm leading-7 text-slate-600">Canva 在视觉和编辑上更强，Beautiful.ai 的企业版式最稳。没有绝对赢家，但 Gamma 在这套面向普通职场用户的综合测试中最均衡。</p></div></div></div></Section>
            <Section id="section-1" number="02" title="最终排名"><div className="space-y-3">{productScores.map((item, index) => <Card key={item.name} className="flex items-center gap-4 p-4 shadow-none"><span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${index === 0 ? "bg-blue-600 text-white" : "bg-slate-100"}`}>{index + 1}</span><ProductLogo initials={item.name[0]} name={item.name} className="h-9 w-9" /><div className="flex-1"><div className="text-sm font-semibold">{item.name}</div><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100"><div className={item.color + " h-full"} style={{ width: `${item.score * 10}%` }} /></div></div><div className="text-2xl font-semibold tabular-nums">{item.score}</div></Card>)}</div></Section>
            <Section id="section-2" number="03" title="为什么测试这些产品"><p>三款产品都承诺让非设计专业用户快速制作演示文稿，但路径明显不同：Gamma 从内容生成出发，Canva 依托完整设计生态，Beautiful.ai 则强调智能布局规则。它们拥有足够一致的核心任务，也有值得比较的产品差异。</p></Section>
            <Section id="section-3" number="04" title="我们怎么测试"><div className="grid gap-3 sm:grid-cols-2">{["相同原始输入", "相同锁定 Prompt", "每项只生成一次", "不进行人工编辑"].map((item) => <div key={item} className="flex items-center gap-2 rounded-md border p-3 text-sm"><Check className="h-4 w-4 text-emerald-600" />{item}</div>)}</div><p className="mt-4">全部输出先去除产品身份，再按六项 Rubric 评分；AI Judge 结论最后由人工检查证据和异常值。</p></Section>
            <Section id="section-4" number="05" title="Case 复盘"><div className="space-y-8">{testCases.map((item) => <div key={item.id} className="border-t pt-5"><div className="eyebrow text-blue-600">CASE {item.id}</div><h3 className="mt-2 text-lg font-semibold">{item.title}</h3><p className="mt-2">{item.purpose}</p><div className="mt-4 rounded-lg border bg-slate-50 p-4"><div className="eyebrow">原始 Prompt</div><p className="mt-2 font-mono text-xs leading-6 text-slate-700">{item.prompt}</p></div><div className="mt-4 grid gap-3 sm:grid-cols-3">{productScores.map((product) => <div key={product.name} className="rounded-md border p-3"><div className="flex justify-between text-xs font-semibold"><span>{product.name}</span><span>{(product.score - Number(item.id) * .03).toFixed(1)}</span></div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">输出结构完整，关键结论有证据支撑；细节表现存在差异。</p></div>)}</div></div>)}</div></Section>
            <Section id="section-5" number="06" title="每款产品的优缺点"><div className="space-y-5">{[["Gamma", "生成快、结构完整、首次成稿率高", "精细视觉控制有限"], ["Canva", "视觉素材丰富、后期编辑自由", "复杂信息结构需要人工整理"], ["Beautiful.ai", "布局稳定、品牌一致性好", "内容深度与编辑自由度较弱"]].map(([name, pro, con]) => <div key={name} className="grid gap-2 border-t pt-4 sm:grid-cols-[120px_1fr_1fr]"><strong>{name}</strong><span className="text-sm text-emerald-700">+ {pro}</span><span className="text-sm text-red-700">− {con}</span></div>)}</div></Section>
            <Section id="section-6" number="07" title="最终推荐"><div className="rounded-xl bg-slate-950 p-6 text-white"><Trophy className="h-6 w-6 text-amber-400" /><h3 className="mt-4 text-xl font-semibold">大多数普通职场用户：优先选 Gamma</h3><p className="mt-3 text-sm leading-7 text-slate-300">如果后续视觉编辑是核心工作流，选择 Canva；如果组织更关注模板规范和品牌一致性，Beautiful.ai 仍然值得考虑。</p></div></Section>
            <Section id="section-7" number="08" title="测试限制"><p>本次测试使用免费或试用方案，仅覆盖中文商业汇报场景。产品功能与模型会持续更新，评分不能代表所有地区、订阅等级和使用任务。</p><Button className="mt-5" variant="outline"><Database className="h-4 w-4" />查看完整测试数据<ArrowUpRight className="h-4 w-4" /></Button></Section>
          </main>
          <aside className="hidden xl:block"><div className="sticky top-6 rounded-lg border bg-slate-50 p-4"><div className="eyebrow">测试快照</div><dl className="mt-4 space-y-3 text-xs">{[["产品", "3"], ["Test Cases", "4"], ["独立测试", "12"], ["评分维度", "6"]].map(([term, value]) => <div key={term} className="flex justify-between"><dt className="text-muted-foreground">{term}</dt><dd className="font-semibold">{value}</dd></div>)}</dl></div></aside>
        </div>
      </article>
    </div>
  );
}

function Section({ id, number, title, children }: { id: string; number: string; title: string; children: React.ReactNode }) { return <section id={id} className="scroll-mt-8"><div className="eyebrow text-blue-600">{number}</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.03em]">{title}</h2><div className="mt-5 text-sm leading-7 text-slate-600">{children}</div></section>; }

