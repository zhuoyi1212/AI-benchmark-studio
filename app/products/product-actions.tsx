"use client";

import { useState, useTransition } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { setProductArchivedAction } from "@/app/products/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function ProductActions({ productId, productName, archived = false }: { productId: string; productName: string; archived?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setProductArchivedAction(productId, !archived);
        if (!result.ok) { setError(result.message); return; }
        setOpen(false);
        router.refresh();
      } catch { setError("操作失败，请稍后重试。"); }
    });
  }
  return <div>
    <Button type="button" variant="ghost" size="sm" disabled={pending} aria-label={`${archived ? "恢复" : "删除"}产品：${productName}`} className={archived ? "text-blue-700" : "text-muted-foreground hover:text-red-600"} onClick={() => archived ? submit() : setOpen(true)}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : archived ? <RotateCcw className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
      {pending ? "处理中…" : archived ? "恢复" : "删除"}
    </Button>
    {archived && error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    <Dialog open={open} onOpenChange={value => { if (!pending) { setOpen(value); setError(null); } }}>
      <DialogContent>
        <DialogTitle>删除“{productName}”？</DialogTitle>
        <DialogDescription>从产品库移除，历史测评和原始结果保留。可在“已删除”中恢复。</DialogDescription>
        {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>取消</Button>
          <Button variant="destructive" disabled={pending} onClick={submit}>{pending ? "正在删除…" : "确认删除"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
