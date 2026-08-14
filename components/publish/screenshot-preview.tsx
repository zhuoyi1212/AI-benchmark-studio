import { BarChart3, LineChart, PanelLeft, Presentation } from "lucide-react";
import { MockScreenshot } from "@/lib/publish-mock-data";
import { cn } from "@/lib/utils";

const productTheme = {
  Gamma: { accent: "bg-violet-500", pale: "bg-violet-100", text: "text-violet-700" },
  Canva: { accent: "bg-teal-500", pale: "bg-teal-100", text: "text-teal-700" },
  "Beautiful.ai": { accent: "bg-blue-500", pale: "bg-blue-100", text: "text-blue-700" },
};

export function ScreenshotPreview({ screenshot, index, className }: { screenshot: MockScreenshot; index?: number; className?: string }) {
  const theme = productTheme[screenshot.product];
  return (
    <div data-image={screenshot.image} className={cn("relative aspect-[16/9] overflow-hidden rounded-md border bg-slate-100 p-2", className)}>
      <div className="flex h-full flex-col overflow-hidden rounded-[4px] border bg-white shadow-sm">
        <div className="flex h-5 items-center gap-1.5 border-b bg-slate-50 px-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", theme.accent)} />
          <span className="text-[5px] font-semibold tracking-tight text-slate-600">{screenshot.product}</span>
          <span className="ml-auto h-1 w-5 rounded-full bg-slate-200" />
        </div>
        <div className="flex min-h-0 flex-1">
          {screenshot.visual === "editor" && <div className="w-[18%] border-r bg-slate-50 p-1"><PanelLeft className="h-2 w-2 text-slate-400" /><div className="mt-1 space-y-1">{[1, 2, 3].map((item) => <div key={item} className="aspect-[4/3] rounded-[1px] border bg-white" />)}</div></div>}
          <div className="min-w-0 flex-1 p-[7%]">
            <div className={cn("h-1.5 w-2/3 rounded-full", theme.accent)} />
            <div className="mt-1 h-1 w-1/2 rounded-full bg-slate-200" />
            {screenshot.visual === "chart" ? <ChartVisual theme={theme} /> : screenshot.visual === "constraint" ? <ConstraintVisual theme={theme} /> : <StructureVisual theme={theme} />}
          </div>
        </div>
      </div>
      {index !== undefined && <span className="absolute left-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-slate-950 text-[9px] font-semibold text-white shadow">{index + 1}</span>}
      <span className="absolute bottom-3 right-3 rounded bg-white/90 px-1.5 py-0.5 text-[7px] font-medium text-slate-600 shadow-sm">Mock 原始截图</span>
    </div>
  );
}

function StructureVisual({ theme }: { theme: (typeof productTheme)["Gamma"] }) {
  return <div className="mt-[9%] grid grid-cols-3 gap-[4%]">{[Presentation, BarChart3, LineChart].map((Icon, index) => <div key={index} className="rounded-sm border p-[10%]"><span className={cn("grid aspect-square w-1/3 place-items-center rounded-sm", theme.pale, theme.text)}><Icon className="h-2/3 w-2/3" /></span><div className="mt-[12%] h-1 rounded-full bg-slate-300" /><div className="mt-[7%] h-1 w-2/3 rounded-full bg-slate-200" /></div>)}</div>;
}

function ChartVisual({ theme }: { theme: (typeof productTheme)["Gamma"] }) {
  return <div className="mt-[8%] grid grid-cols-[1.35fr_.65fr] gap-[6%]"><div className="flex h-12 items-end gap-[5%] border-b border-l px-[5%]">{[45, 72, 55, 88, 68].map((height, index) => <div key={index} className={cn("flex-1 rounded-t-[1px]", index === 3 ? theme.accent : "bg-slate-200")} style={{ height: `${height}%` }} />)}</div><div className="space-y-[8%]">{["增长", "渠道", "留存"].map((label, index) => <div key={label} className="rounded-sm bg-slate-50 p-[8%]"><div className={cn("h-1 rounded-full", index === 0 ? theme.accent : "bg-slate-300")} /><div className="mt-1 text-[5px] text-slate-500">{label}</div></div>)}</div></div>;
}

function ConstraintVisual({ theme }: { theme: (typeof productTheme)["Gamma"] }) {
  return <div className="mt-[9%] grid grid-cols-[.8fr_1.2fr] gap-[6%]"><div className={cn("rounded-sm p-[12%]", theme.pale)}><div className={cn("h-1.5 w-3/4 rounded-full", theme.accent)} /><div className="mt-2 h-1 rounded-full bg-white" /><div className="mt-1 h-1 w-2/3 rounded-full bg-white" /></div><div className="space-y-[6%] pt-[4%]">{[1, 2, 3].map((item) => <div key={item} className="flex items-center gap-[5%]"><span className={cn("h-2 w-2 rounded-full", theme.accent)} /><span className="h-1 flex-1 rounded-full bg-slate-200" /></div>)}</div></div>;
}
