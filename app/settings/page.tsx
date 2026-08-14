import { Bell, Palette, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() { return <div className="page-shell max-w-[900px]"><PageHeader title="设置" description="管理工作台偏好。当前为前端演示模式。" /><div className="space-y-3">{[[Palette, "外观", "浅色模式", "已启用"], [Bell, "通知", "测评状态通知", "Mock"], [Settings2, "工作区", "AI Benchmark Studio", "个人"]].map(([Icon, title, detail, state]) => { const I = Icon as typeof Palette; return <Card key={String(title)} className="flex items-center gap-4 p-4 shadow-none"><span className="grid h-9 w-9 place-items-center rounded-md bg-slate-100"><I className="h-4 w-4" /></span><div className="flex-1"><h2 className="text-sm font-medium">{String(title)}</h2><p className="text-xs text-muted-foreground">{String(detail)}</p></div><Badge variant="neutral">{String(state)}</Badge></Card>; })}</div></div>; }

