'use client';
import { useActionState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { quickAction } from './actions';
export function QuickActionButton({ projectId, operation, id, children }: { projectId: string; operation: string; id?: string; children: React.ReactNode }) {
  const [state, action, pending] = useActionState(quickAction, { message: null });
  return <form action={action}>
    <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="operation" value={operation} />
    {id && <input type="hidden" name="id" value={id} />}
    <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? <><LoaderCircle className="h-4 w-4 animate-spin" />正在提交…</> : children}</Button>
    {state.message && <p role="alert" className="mt-3 text-sm text-red-600">{state.message}</p>}
  </form>;
}
