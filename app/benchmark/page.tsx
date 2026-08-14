import Link from "next/link";
import { ArrowRight, BarChart3, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function BenchmarkPage() { return <div className="page-shell"><PageHeader title="Benchmark" description="查看跨项目沉淀的标准任务与产品表现。" /><div className="subtle-grid grid min-h-80 place-items-center rounded-xl border border-dashed bg-white"><div className="max-w-sm px-6 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-lg border bg-white text-blue-600"><BarChart3 className="h-5 w-5" /></span><h2 className="mt-4 text-base font-semibold">还没有可复用的 Benchmark</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">完成第一个测评后，可以把 Test Protocol 保存为团队 Benchmark。</p><Button className="mt-5" size="sm" asChild><Link href="/projects/new"><Plus className="h-3.5 w-3.5" />新建测评<ArrowRight className="h-3.5 w-3.5" /></Link></Button></div></div></div>; }

