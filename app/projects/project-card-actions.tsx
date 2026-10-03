"use client";

import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteProjectAction, renameProjectAction } from "@/app/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ProjectCardActions({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(projectName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await renameProjectAction(projectId, name);
        if (!result.ok) { setError(result.message); return; }
        setRenameOpen(false);
      } catch { setError("名称保存失败，请稍后重试。"); }
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteProjectAction(projectId);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setDialogOpen(false);
        router.refresh();
      } catch {
        setError("项目删除失败，请稍后重试。");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 bg-white/90 text-muted-foreground shadow-sm hover:text-foreground"
            aria-label={`管理项目：${projectName}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => { setName(projectName); setError(null); setRenameOpen(true); }}>
            <Pencil className="h-4 w-4" />重命名
          </DropdownMenuItem>
          <DropdownMenuItem className="text-red-600 focus:bg-red-50 focus:text-red-700" onSelect={() => setDialogOpen(true)}>
            <Trash2 className="h-4 w-4" />
            删除项目
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={open => { if (!isPending) { setRenameOpen(open); setError(null); } }}>
        <DialogContent>
          <DialogTitle>重命名测评</DialogTitle>
          <DialogDescription>名称不能与其他测评重复。</DialogDescription>
          <form onSubmit={handleRename} className="mt-4">
            <Input aria-label="测评名称" value={name} onChange={event => setName(event.target.value)} maxLength={120} required disabled={isPending} />
            {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="outline" disabled={isPending} onClick={() => setRenameOpen(false)}>取消</Button>
              <Button type="submit" disabled={isPending || !name.trim()}>{isPending ? <><Loader2 className="h-4 w-4 animate-spin" />保存中…</> : "保存"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (isPending) return;
          setDialogOpen(open);
          if (!open) setError(null);
        }}
      >
        <DialogContent>
          <DialogTitle>删除“{projectName}”？</DialogTitle>
          <DialogDescription>
            项目会从项目列表中移除，但已有调研、测试方案、原始测试结果、评分和报告记录会保留，不会物理删除。
          </DialogDescription>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" variant="destructive" disabled={isPending} onClick={handleDelete}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {isPending ? "正在删除..." : "确认删除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
