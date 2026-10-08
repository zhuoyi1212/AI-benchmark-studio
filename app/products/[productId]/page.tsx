import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { NavigationLink as Link } from '@/components/navigation-link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/page-header';
import { getProductLibraryDetail } from '@/lib/services/product-library.service';
import { withPageReads } from '@/lib/supabase/read-scope';
import { AdminOnly } from '@/components/workspace-access';

async function ProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  await connection();
  const { productId } = await params;
  const detail = await getProductLibraryDetail(productId);
  if (!detail) notFound();
  const { product, snapshots, outputs } = detail;
  const hasOutputs = outputs.reports.length > 0 || outputs.articles.length > 0;
  return <div className="page-shell max-w-5xl">
    <Link href="/products" className="mb-6 inline-flex text-xs text-muted-foreground">返回产品库</Link>
    <PageHeader title={product.name} description={product.latestSnapshot?.positioning ?? '每次测评独立保存，资料在这里持续积累。'} action={<AdminOnly><Link href={`/projects/new?productId=${product.id}`} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">开始新测评</Link></AdminOnly>} />
    <div className="mb-6 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{product.projects.length} 次测评</span><span>{snapshots.length} 个调研版本</span>{product.officialUrl && <a href={product.officialUrl} target="_blank" rel="noreferrer" className="text-blue-700">产品官网 ↗</a>}</div>
    <nav aria-label="产品资料" className="mb-8 flex gap-6 border-b pb-3 text-sm"><a href="#research">调研资料</a><a href="#evaluations">测评记录</a><a href="#outputs">内容产出</a></nav>
    <section id="research" className="scroll-mt-8"><h2 className="mb-4 text-lg font-semibold">调研资料</h2>
      {snapshots.length === 0 ? <p className="text-sm text-muted-foreground">尚无已完成的调研。</p> : <div className="space-y-3">{snapshots.map((snapshot, index) => <details key={snapshot.id} open={index === 0} className="rounded-lg border bg-white p-5"><summary className="cursor-pointer text-sm font-medium">调研 v{snapshot.version} · {date(snapshot.researchedAt)} {snapshot.needsUpdate && <span className="ml-2 text-amber-700">资料可能过期</span>}</summary><p className="mt-4 text-sm leading-7 text-slate-600">{snapshot.positioning}</p><div className="mt-4 grid gap-5 sm:grid-cols-2"><Facts title="核心能力" items={snapshot.capabilities} /><Facts title="已知限制" items={snapshot.limitations} /><Facts title="输入格式" items={snapshot.inputFormats} /><Facts title="输出格式" items={snapshot.outputFormats} /></div><div className="mt-4 flex flex-wrap gap-3 border-t pt-4">{snapshot.sources.map((source, i) => <a key={`${source.url}-${i}`} href={source.url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline">{source.title} ↗</a>)}</div></details>)}</div>}
    </section>
    <section id="evaluations" className="mt-10 scroll-mt-8"><h2 className="mb-4 text-lg font-semibold">测评记录</h2><div className="space-y-3">{product.projects.length === 0 && <p className="text-sm text-muted-foreground">暂无进行中的或已完成的测评。</p>}{product.projects.map(project => <Card key={project.id} className="flex flex-wrap items-center justify-between gap-4 p-5 shadow-none"><div><Link href={`/projects/${project.id}/${project.evaluationMode === 'quick' ? 'quick' : 'research'}`} className="font-medium hover:text-blue-700">{project.name}</Link><p className="mt-2 text-xs text-muted-foreground">{date(project.createdAt)} · {project.evaluationMode === 'quick' ? '快速模式' : '专业模式'}</p></div><Link href={`/projects/${project.id}/${project.evaluationMode === 'quick' ? 'quick' : 'research'}`} className="text-xs text-blue-700">打开测评 →</Link></Card>)}</div></section>
    <section id="outputs" className="mt-10 scroll-mt-8"><h2 className="mb-4 text-lg font-semibold">内容产出</h2>{!hasOutputs && <p className="text-sm text-muted-foreground">报告和文章完成后会归集到这里。</p>}<div className="space-y-3">{product.projects.map(project => {
      const reports = outputs.reports.filter(item => item.project_id === project.id);
      const articles = outputs.articles.filter(item => item.project_id === project.id);
      if (!reports.length && !articles.length) return null;
      return <Card key={project.id} className="p-5 shadow-none"><p className="text-sm font-medium">{project.name}</p><div className="mt-3 flex flex-wrap gap-4 text-xs">{reports.length > 0 && <Link href={`/projects/${project.id}/report`} className="text-blue-700">体验报告 <Badge variant="neutral">{reports.length} 个已完成版本</Badge></Link>}{articles.length > 0 && <Link href={`/projects/${project.id}/publish`} className="text-blue-700">社区文章 <Badge variant="neutral">{articles.length} 个已完成版本</Badge></Link>}</div></Card>;
    })}</div></section>
  </div>;
}
function date(value: string) { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeZone: 'Asia/Shanghai' }).format(new Date(value)); }
function Facts({ title, items }: { title: string; items: string[] }) { return <div><h3 className="text-xs font-medium text-slate-500">{title}</h3><ul className="mt-2 space-y-1 text-sm leading-6">{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>; }
export default withPageReads(ProductDetailPage);
