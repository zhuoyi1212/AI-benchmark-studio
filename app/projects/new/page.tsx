import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ProjectForm } from "@/app/projects/new/project-form";

export default function NewProjectPage() {
  return (
    <div className="page-shell max-w-[980px]">
      <Link href="/projects" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回我的测评</Link>
      <PageHeader title="新建测评" description="告诉我们你想比较什么。项目保存后将进入产品调研。" />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="p-6 shadow-none"><ProjectForm /></Card>
        <aside className="h-fit rounded-lg border bg-slate-50 p-5">
          <div className="eyebrow">接下来</div>
          <ol className="mt-4 space-y-4">
            {["调研产品定位与能力", "判断是否适合横向比较", "生成共同任务与评分框架"].map((text, index) => (
              <li key={text} className="flex gap-3 text-xs leading-5 text-slate-600"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border bg-white text-[10px] font-semibold">{index + 1}</span>{text}</li>
            ))}
          </ol>
          <p className="mt-5 border-t pt-4 text-[11px] leading-5 text-muted-foreground">项目与产品会先安全保存；产品调研将在下一阶段启动。</p>
        </aside>
      </div>
    </div>
  );
}
