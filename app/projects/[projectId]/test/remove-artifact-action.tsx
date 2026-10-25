"use client";

import { useActionState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { removeTestArtifactAction } from './actions';

export function RemoveArtifactAction({ projectId, protocolId, artifactId, fileName, retry = false }: {
  projectId: string; protocolId: string; artifactId: string; fileName: string; retry?: boolean;
}) {
  const [state, action, pending] = useActionState(removeTestArtifactAction, { ok: false, message: null });
  return <form action={action} className={retry ? 'relative flex items-center gap-2' : 'absolute right-1 top-1 z-10'}>
    <input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="protocolId" value={protocolId} />
    <input type="hidden" name="artifactId" value={artifactId} />
    <button type="submit" disabled={pending} aria-busy={pending} aria-label={`删除 ${fileName}`} title={retry ? '重试删除' : '删除文件'}
      className="inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md bg-white/95 text-slate-500 shadow-sm ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-60">
      {pending ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <X aria-hidden="true" className="h-3.5 w-3.5" />}
      {retry && <span className="pr-2 text-xs">重试删除</span>}
    </button>
    {state.message && <p role="alert" className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-red-100 bg-white p-2 text-xs text-red-600 shadow">{state.message}</p>}
  </form>;
}
