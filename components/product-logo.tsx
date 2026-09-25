import { cn } from "@/lib/utils";

export function ProductLogo({ initials, name, logoUrl, className }: { initials: string; name: string; logoUrl?: string; className?: string }) {
  const styles: Record<string, string> = { G: "bg-[#efe9ff] text-[#6d42d8]", C: "bg-[#e4f7f5] text-[#087f72]", B: "bg-[#e9f0fb] text-[#285da8]" };
  return <div aria-label={`${name} logo`} className={cn("grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/60 text-sm font-bold", styles[initials] || "bg-slate-100 text-slate-700", className)}>{logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : initials}</div>;
}
