"use client";

import { ArrowDown, ArrowUp, Check, Clipboard, Download, Eye, ImageIcon, LoaderCircle, Pencil, RefreshCw, Replace, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ScreenshotPreview } from "@/components/publish/screenshot-preview";
import { WorkflowSteps } from "@/components/workflow-steps";
import { demoWorkflowState } from "@/lib/mock/workflow.mock";
import { PageHeader } from "@/components/page-header";
import { MockLoader } from "@/components/mock-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { discoverContentIdeas, generateCommunityPost, getPublishWorkspace, REVIEW_STORAGE_KEY } from "@/lib/mock/services";
import type { PublishWorkspace } from "@/lib/mock/services";
import type { BenchmarkScreenshot, CommunityPost, ContentIdea, PublishConfig, ScreenshotRecommendation } from "@/lib/types/publish";
import type { BenchmarkProject } from "@/lib/types/project";
import type { TestProtocol } from "@/lib/types/protocol";
import { cn } from "@/lib/utils";

export default function PublishPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<PublishWorkspace | null>(null);
  useEffect(() => {
    const result = getPublishWorkspace("demo", window.localStorage.getItem(REVIEW_STORAGE_KEY));
    if (!result.ok) { router.replace(result.redirectTo); return; }
    setWorkspace(result.data);
  }, [router]);
  if (!workspace) return null;
  return <PublishWorkspacePage workspace={workspace} />;
}

function PublishWorkspacePage({ workspace }: { workspace: PublishWorkspace }) {
  const { project, protocol, review, contentIdeas, communityPost, publishConfig, publishChannels, publishGoals, screenshots } = workspace;
  const [ideas, setIdeas] = useState<ContentIdea[]>(contentIdeas);
  const [selectedIdeaId, setSelectedIdeaId] = useState((contentIdeas.find((idea) => idea.recommended) ?? contentIdeas[0]).id);
  const [customIdea, setCustomIdea] = useState("");
  const [usingCustomIdea, setUsingCustomIdea] = useState(false);
  const [config, setConfig] = useState<PublishConfig>({ ...publishConfig });
  const [post, setPost] = useState<CommunityPost>(communityPost);
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [title, setTitle] = useState(communityPost.title);
  const [body, setBody] = useState(communityPost.body);
  const [tags, setTags] = useState(communityPost.tags.join(" "));
  const [question, setQuestion] = useState(communityPost.interactionQuestion ?? "");
  const [selectedIds, setSelectedIds] = useState([...communityPost.screenshotRecommendations].sort((a, b) => a.order - b.order).map((item) => item.screenshotId));
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [preview, setPreview] = useState<BenchmarkScreenshot | null>(null);
  const [productFilter, setProductFilter] = useState("");
  const [caseFilter, setCaseFilter] = useState("");

  const recommendedIdea = ideas.find((idea) => idea.recommended) ?? ideas[0] ?? contentIdeas[0];
  const selectedIdea = ideas.find((idea) => idea.id === selectedIdeaId) ?? recommendedIdea;
  const selectedImages = selectedIds.map((id) => screenshots.find((image) => image.id === id)).filter((image): image is BenchmarkScreenshot => Boolean(image));
  const candidates = useMemo(() => screenshots.filter((image) => (!productFilter || image.productId === productFilter) && (!caseFilter || image.testCaseId === caseFilter)), [screenshots, productFilter, caseFilter]);

  const productFor = (image: BenchmarkScreenshot) => project.products.find((item) => item.id === image.productId);
  const caseFor = (image: BenchmarkScreenshot) => protocol.testCases.find((item) => item.id === image.testCaseId);
  const recommendationFor = (imageId: string) => post.screenshotRecommendations.find((item) => item.screenshotId === imageId);
  const activeIdea = (): ContentIdea => usingCustomIdea ? { ...selectedIdea, id: "custom", title: customIdea.trim(), angle: customIdea.trim(), type: "自定义", insight: customIdea.trim(), recommended: false } : selectedIdea;

  const rediscover = async () => {
    setDiscovering(true);
    await delay(700);
    const nextIndex = refreshIndex + 1;
    const result = await discoverContentIdeas(project.id, review, nextIndex);
    if (!result.ok) { setDiscovering(false); return; }
    const nextIdeas = result.data;
    setRefreshIndex(nextIndex); setIdeas(nextIdeas); setUsingCustomIdea(false);
    setSelectedIdeaId((nextIdeas.find((idea) => idea.recommended) ?? nextIdeas[0]).id);
    setDiscovering(false); toast.success("已重新发现一组选题");
  };

  const applyPost = (nextPost: CommunityPost) => {
    setPost(nextPost); setTitle(nextPost.title); setBody(nextPost.body); setTags(nextPost.tags.join(" ")); setQuestion(nextPost.interactionQuestion ?? "");
    setSelectedIds([...nextPost.screenshotRecommendations].sort((a, b) => a.order - b.order).map((item) => item.screenshotId));
  };

  const generate = async () => {
    if (usingCustomIdea && !customIdea.trim()) { toast.error("请先输入自定义内容角度"); return; }
    setGenerating(true); await delay(900);
    const result = await generateCommunityPost(project.id, review, config, activeIdea());
    if (!result.ok) { setGenerating(false); return; }
    applyPost(result.data);
    setGenerating(false); setGenerated(true); window.scrollTo({ top: 0, behavior: "smooth" }); toast.success("社区帖子已生成");
  };

  const regenerate = async () => { setGenerating(true); await delay(700); const result = await generateCommunityPost(project.id, review, config, activeIdea()); if (result.ok) { applyPost(result.data); toast.success("已基于当前配置重新生成"); } setGenerating(false); };
  const copyPost = async () => { const content = `${title}\n\n${body}\n\n${question}\n\n${tags}`; try { await navigator.clipboard.writeText(content); } catch { /* Mock fallback */ } toast.success("社区帖子已复制"); };
  const moveImage = (index: number, direction: -1 | 1) => { const nextIndex = index + direction; if (nextIndex < 0 || nextIndex >= selectedIds.length) return; setSelectedIds((current) => { const next = [...current]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next; }); };
  const replaceImage = (imageId: string) => { if (replaceIndex === null) return; setSelectedIds((current) => current.length === 0 ? [imageId] : current.map((id, index) => index === replaceIndex ? imageId : id)); setReplaceIndex(null); toast.success("截图已替换"); };
  const downloadOne = (image: BenchmarkScreenshot) => toast.success(`${productFor(image)?.name ?? "测试产品"} ${caseFor(image)?.title ?? "测试结果"} 已加入下载`, { description: "当前为 Mock 截图下载。" });
  const downloadAll = () => toast.success(`${selectedImages.length} 张测试截图已打包`, { description: "当前为 Mock 批量下载。" });

  return <TooltipProvider><div className="page-shell max-w-[1420px]">
    <MockLoader label="正在分析这次测评中值得传播的发现..." duration={700} />
    <WorkflowSteps projectId="demo" workflowState={demoWorkflowState} />
    <PageHeader eyebrow={`项目 / ${project.name}`} title="社区发布包" description="从完整测评中提炼独立成立的社区观点，并用测试阶段的原始截图提供证据。" action={generated ? <Badge variant="success"><Check className="h-3 w-3" />已准备好 · 1 篇帖子 · {selectedImages.length} 张截图</Badge> : <Badge variant="neutral"><Sparkles className="h-3 w-3" />提炼中</Badge>} />
    <ProcessStrip current={generated ? 4 : 1} />
    {!generated ? <div className="space-y-10">
      <section><div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><div className="eyebrow text-blue-600">AI 推荐社区选题</div><h2 className="mt-2 text-xl font-semibold tracking-[-.025em]">这次测评有什么值得说？</h2><p className="mt-1.5 text-sm text-muted-foreground">基于评分差异、原始输出和真实工作流提炼的 Mock 推荐。</p></div><Button variant="outline" size="sm" onClick={rediscover} disabled={discovering}>{discovering ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}重新发现选题</Button></div>
        <div className="grid gap-3 lg:grid-cols-2">{ideas.map((idea, index) => { const active = !usingCustomIdea && selectedIdeaId === idea.id; return <button key={idea.id} type="button" onClick={() => { setUsingCustomIdea(false); setSelectedIdeaId(idea.id); }} className={cn("group rounded-lg border bg-white p-5 text-left shadow-none transition-colors hover:border-slate-300", active && "border-blue-400 ring-2 ring-blue-100")}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><Badge variant={idea.recommended ? "default" : "neutral"}>{idea.type}</Badge>{idea.recommended && <span className="text-[10px] font-medium text-blue-600">AI 推荐</span>}</div>{active && <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white"><Check className="h-3 w-3" /></span>}</div><h3 className="mt-4 text-[16px] font-semibold leading-6 tracking-[-.015em]">{idea.title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{idea.insight}</p><div className="mt-4 grid grid-cols-2 gap-3 border-y py-3"><Metric label="信息价值" value={formatMetric(idea.informationValue)} /><Metric label="讨论潜力" value={formatMetric(idea.discussionPotential)} /></div><p className="mt-3 text-[11px] leading-5 text-slate-600"><span className="font-semibold text-slate-800">为什么值得发：</span>{idea.whyInteresting}</p><span className={cn("mt-4 inline-flex text-xs font-medium", active ? "text-blue-700" : "text-slate-500 group-hover:text-slate-900")}>{active ? "已选择这个角度" : "选择这个角度"}</span></button>; })}</div>
        <div className={cn("mt-3 rounded-lg border border-dashed p-4 transition-colors", usingCustomIdea ? "border-blue-300 bg-blue-50/40" : "bg-white")}><button type="button" onClick={() => setUsingCustomIdea(true)} className="flex items-center gap-2 text-sm font-medium"><Pencil className="h-4 w-4 text-blue-600" />自定义内容角度</button>{usingCustomIdea && <Textarea className="mt-3 bg-white" rows={3} value={customIdea} onChange={(event) => setCustomIdea(event.target.value)} placeholder="输入你最想表达的观点…" />}</div>
      </section>
      <section><div className="mb-4"><div className="eyebrow text-blue-600">内容配置</div><h2 className="mt-2 text-xl font-semibold tracking-[-.025em]">确定帖子表达方式</h2></div><Card className="shadow-none"><div className="grid gap-x-5 gap-y-5 p-5 md:grid-cols-2 xl:grid-cols-3"><SelectField label="目标渠道" value={config.channel} options={publishChannels} onChange={(value) => setConfig({ ...config, channel: value })} /><SelectField label="内容目标" value={config.goal ?? ""} options={publishGoals} onChange={(value) => setConfig({ ...config, goal: value })} /><Field label="内容长度"><Input value={config.length} onChange={(event) => setConfig({ ...config, length: event.target.value })} /></Field><Field label="语言风格" className="md:col-span-2"><Input value={config.tone} onChange={(event) => setConfig({ ...config, tone: event.target.value })} /></Field><Field label="图片数量"><Input type="number" min={1} max={9} value={config.imageCount} onChange={(event) => setConfig({ ...config, imageCount: clampImageCount(event.target.value) })} /></Field><Field label="互动目标" className="md:col-span-2 xl:col-span-3"><Input value={config.interactionGoal} onChange={(event) => setConfig({ ...config, interactionGoal: event.target.value })} /></Field></div><div className="flex flex-col items-start justify-between gap-3 border-t px-5 py-4 sm:flex-row sm:items-center"><p className="text-xs text-muted-foreground">选题：{usingCustomIdea ? customIdea || "自定义角度" : selectedIdea.title}</p><Button size="lg" onClick={generate} disabled={generating}>{generating ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在从测评中提炼内容...</> : <><Sparkles className="h-4 w-4" />生成社区帖子</>}</Button></div></Card></section>
    </div> : <div className="grid items-start gap-5 xl:grid-cols-[220px_minmax(360px,1fr)_280px]">
      <aside className="space-y-4 xl:sticky xl:top-5"><Card className="p-4 shadow-none"><div className="eyebrow">当前选题</div><Badge className="mt-3" variant="default">{usingCustomIdea ? "自定义" : selectedIdea.type}</Badge><h2 className="mt-3 text-sm font-semibold leading-6">{usingCustomIdea ? customIdea : selectedIdea.title}</h2><Button className="mt-4 w-full" variant="outline" size="sm" onClick={() => setGenerated(false)}>重新选择角度</Button></Card><Card className="p-4 shadow-none"><div className="flex items-center justify-between"><div className="eyebrow">内容配置</div><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></div><div className="mt-4 space-y-4"><SelectField label="目标渠道" value={config.channel} options={publishChannels} onChange={(value) => setConfig({ ...config, channel: value })} compact /><SelectField label="内容目标" value={config.goal ?? ""} options={publishGoals} onChange={(value) => setConfig({ ...config, goal: value })} compact /><Field label="语言风格"><Textarea className="min-h-24 text-xs" value={config.tone} onChange={(event) => setConfig({ ...config, tone: event.target.value })} /></Field><div className="grid grid-cols-2 gap-2"><Field label="长度"><Input className="h-9 text-xs" value={config.length} onChange={(event) => setConfig({ ...config, length: event.target.value })} /></Field><Field label="图片"><Input className="h-9 text-xs" type="number" min={1} max={9} value={config.imageCount} onChange={(event) => setConfig({ ...config, imageCount: clampImageCount(event.target.value) })} /></Field></div><Field label="互动目标"><Textarea className="min-h-24 text-xs" value={config.interactionGoal} onChange={(event) => setConfig({ ...config, interactionGoal: event.target.value })} /></Field></div></Card></aside>
      <main className="min-w-0"><Card className="overflow-hidden shadow-none"><div className="flex items-center justify-between border-b bg-slate-50/70 px-5 py-3"><div><div className="text-sm font-semibold">帖子编辑器</div><div className="mt-0.5 text-[10px] text-muted-foreground">{config.channel} · 自动保存为 Mock 草稿</div></div><Button variant="outline" size="sm" onClick={regenerate} disabled={generating}>{generating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}重新生成</Button></div><div className="p-5 sm:p-7"><Field label="标题"><Textarea className="min-h-[74px] resize-none text-xl font-semibold leading-8 tracking-[-.02em]" value={title} onChange={(event) => setTitle(event.target.value)} /></Field><div className="mt-6"><Field label="正文"><Textarea className="min-h-[720px] resize-y bg-[#fdfdfd] text-[14px] leading-7 text-slate-700" value={body} onChange={(event) => setBody(event.target.value)} /></Field><div className="mt-3 flex flex-wrap gap-2">{evidenceMarkers(selectedIds, post.screenshotRecommendations).map((marker) => <Badge key={`${marker.paragraph}-${marker.imageNumbers}`} variant="outline">正文第 {marker.paragraph} 段 · 证据：图片 {marker.imageNumbers}</Badge>)}</div></div><div className="mt-6 grid gap-5 sm:grid-cols-2"><Field label="标签"><Textarea className="min-h-24" value={tags} onChange={(event) => setTags(event.target.value)} /></Field><Field label="最后的互动问题"><Textarea className="min-h-24" value={question} onChange={(event) => setQuestion(event.target.value)} /></Field></div></div><div className="sticky bottom-0 flex items-center justify-between border-t bg-white/95 px-5 py-3 backdrop-blur"><span className="text-[11px] text-muted-foreground">{body.length + title.length + question.length} 字 · {selectedImages.length} 张证据截图</span><Button onClick={copyPost}><Clipboard className="h-4 w-4" />复制全文</Button></div></Card></main>
      <aside className="xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-y-auto xl:pr-1"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold">帖子配图</h2><p className="mt-0.5 text-[10px] text-muted-foreground">按正文证据顺序排列</p></div><Badge variant="neutral">{selectedImages.length} / {config.imageCount}</Badge></div><div className="space-y-3">{selectedImages.map((image, index) => <ScreenshotCard key={`${image.id}-${index}`} screenshot={image} productName={productFor(image)?.name ?? image.productId} productColor={productFor(image)?.color} testCase={caseFor(image)?.title ?? image.testCaseId} recommendation={recommendationFor(image.id)} index={index} total={selectedImages.length} onPreview={() => setPreview(image)} onMove={moveImage} onReplace={() => setReplaceIndex(index)} onRemove={() => { setSelectedIds((current) => current.filter((_, itemIndex) => itemIndex !== index)); toast.success("截图已移除"); }} onDownload={() => downloadOne(image)} />)}</div>{selectedImages.length === 0 && <div className="grid min-h-40 place-items-center rounded-lg border border-dashed bg-white p-5 text-center"><div><ImageIcon className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">暂无配图</p><Button className="mt-3" variant="outline" size="sm" onClick={() => setReplaceIndex(0)}>从截图库选择</Button></div></div>}<Button className="mt-3 w-full" variant="secondary" onClick={downloadAll}><Download className="h-4 w-4" />下载全部图片</Button></aside>
    </div>}
    {generated && <div className="sticky bottom-4 z-30 mt-6 flex flex-col justify-between gap-3 rounded-lg border bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center"><div className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><Check className="h-4 w-4 text-emerald-600" />发布包已准备好 · 文字 + {selectedImages.length} 张原始测试截图</div><div className="flex gap-2"><Button className="flex-1 sm:flex-none" variant="outline" onClick={downloadAll}><Download className="h-4 w-4" />下载全部图片</Button><Button className="flex-1 sm:flex-none" onClick={copyPost}><Clipboard className="h-4 w-4" />复制帖子内容</Button></div></div>}
  </div>
  <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}><DialogContent className="max-w-4xl">{preview && <PreviewDialogContent project={project} protocol={protocol} screenshot={preview} recommendation={recommendationFor(preview.id)} />}</DialogContent></Dialog>
  <Dialog open={replaceIndex !== null} onOpenChange={(open) => !open && setReplaceIndex(null)}><DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto"><DialogTitle>测试截图库</DialogTitle><DialogDescription>从测试阶段上传的 Mock 原始截图中选择一张，替换当前图片。</DialogDescription><div className="mt-5 flex flex-wrap gap-3"><select aria-label="按产品筛选" className="h-9 rounded-md border bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-blue-100" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="">全部产品</option>{project.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="按 Test Case 筛选" className="h-9 rounded-md border bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-blue-100" value={caseFilter} onChange={(event) => setCaseFilter(event.target.value)}><option value="">全部 Case</option>{protocol.testCases.map((item, index) => <option key={item.id} value={item.id}>Case {index + 1} · {item.title}</option>)}</select></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{candidates.map((image) => { const productInfo = productFor(image); const testCase = caseFor(image); return <button type="button" key={image.id} onClick={() => replaceImage(image.id)} className="rounded-lg border p-3 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/30"><ScreenshotPreview screenshot={image} productName={productInfo?.name ?? image.productId} productColor={productInfo?.color} /><div className="mt-3 flex items-center justify-between gap-2"><div><div className="text-xs font-semibold">{productInfo?.name}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{testCase?.title}</div></div>{selectedIds.includes(image.id) && <Badge variant="neutral">已使用</Badge>}</div><p className="mt-2 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{image.caption}</p></button>; })}</div></DialogContent></Dialog>
  </TooltipProvider>;
}

function PreviewDialogContent({ project, protocol, screenshot, recommendation }: { project: BenchmarkProject; protocol: TestProtocol; screenshot: BenchmarkScreenshot; recommendation?: ScreenshotRecommendation }) { const productInfo = project.products.find((item) => item.id === screenshot.productId); const testCase = protocol.testCases.find((item) => item.id === screenshot.testCaseId); return <><DialogTitle>{productInfo?.name} · {testCase?.title}</DialogTitle><DialogDescription>{screenshot.caption}</DialogDescription><ScreenshotPreview screenshot={screenshot} productName={productInfo?.name ?? screenshot.productId} productColor={productInfo?.color} className="mt-4" /><div className="mt-4 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600"><b>推荐原因：</b>{recommendation?.reason ?? screenshot.caption}</div></>; }
function ProcessStrip({ current }: { current: number }) { const steps = ["提炼发现", "选择角度", "配置内容", "生成帖子", "编辑与配图"]; return <div className="mb-8 overflow-x-auto rounded-lg border bg-white px-4 py-3"><div className="flex min-w-[620px] items-center">{steps.map((step, index) => <div key={step} className="flex flex-1 items-center"><span className={cn("grid h-5 w-5 place-items-center rounded-full border text-[9px]", index <= current ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-muted-foreground")}>{index < current ? <Check className="h-3 w-3" /> : index + 1}</span><span className={cn("ml-2 text-[11px]", index <= current ? "font-medium text-slate-800" : "text-muted-foreground")}>{step}</span>{index < steps.length - 1 && <span className={cn("mx-3 h-px flex-1", index < current ? "bg-blue-300" : "bg-slate-200")} />}</div>)}</div></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><div className="text-[10px] text-muted-foreground">{label}</div><div className="mt-1 text-xs font-semibold">{value}</div></div>; }
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) { return <label className={cn("block", className)}><span className="mb-2 block text-xs font-medium text-slate-700">{label}</span>{children}</label>; }
function SelectField({ label, value, options, onChange, compact = false }: { label: string; value: string; options: string[]; onChange: (value: string) => void; compact?: boolean }) { return <Field label={label}><select className={cn("h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100", compact && "h-9 text-xs")} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></Field>; }
function ScreenshotCard({ screenshot, productName, productColor, testCase, recommendation, index, total, onPreview, onMove, onReplace, onRemove, onDownload }: { screenshot: BenchmarkScreenshot; productName: string; productColor?: string; testCase: string; recommendation?: ScreenshotRecommendation; index: number; total: number; onPreview: () => void; onMove: (index: number, direction: -1 | 1) => void; onReplace: () => void; onRemove: () => void; onDownload: () => void }) { return <Card className="overflow-hidden shadow-none"><button type="button" onClick={onPreview} className="block w-full text-left"><ScreenshotPreview screenshot={screenshot} productName={productName} productColor={productColor} index={index} className="rounded-none border-0" /></button><div className="p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-semibold">{productName}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{testCase}</div></div>{recommendation?.supportsParagraph && <Badge variant="outline">第 {recommendation.supportsParagraph} 段</Badge>}</div><p className="mt-2 text-[10px] leading-4 text-slate-600">{recommendation?.reason ?? screenshot.caption}</p><div className="mt-3 flex items-center justify-between border-t pt-2"><div className="flex"><IconAction label="查看大图" onClick={onPreview}><Eye className="h-3.5 w-3.5" /></IconAction><IconAction label="上移" onClick={() => onMove(index, -1)} disabled={index === 0}><ArrowUp className="h-3.5 w-3.5" /></IconAction><IconAction label="下移" onClick={() => onMove(index, 1)} disabled={index === total - 1}><ArrowDown className="h-3.5 w-3.5" /></IconAction><IconAction label="下载单张" onClick={onDownload}><Download className="h-3.5 w-3.5" /></IconAction><IconAction label="移除" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></IconAction></div><Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={onReplace}><Replace className="h-3 w-3" />更换</Button></div></div></Card>; }
function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) { return <Tooltip><TooltipTrigger asChild><button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-slate-100 hover:text-slate-950 disabled:opacity-30">{children}</button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>; }
function evidenceMarkers(selectedIds: string[], recommendations: ScreenshotRecommendation[]) { const grouped = new Map<number, number[]>(); selectedIds.forEach((id, index) => { const paragraph = recommendations.find((item) => item.screenshotId === id)?.supportsParagraph; if (paragraph) grouped.set(paragraph, [...(grouped.get(paragraph) ?? []), index + 1]); }); return Array.from(grouped.entries()).map(([paragraph, numbers]) => ({ paragraph, imageNumbers: numbers.join("、") })); }
function formatMetric(value: number) { return value >= 0.9 ? "很高" : value >= 0.75 ? "高" : value >= 0.55 ? "中" : "低"; }
function clampImageCount(value: string) { return Math.min(9, Math.max(1, Number(value) || 1)); }
function delay(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
