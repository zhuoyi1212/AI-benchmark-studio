"use client";

import { Textarea } from '@/components/ui/textarea';
import { emptyAuthorPerspective, type AuthorPerspective } from '@/lib/author-perspective';

const fields = [
  ['goal', '这次想解决什么', '这次测评对你有什么实际用途？'],
  ['focus', '最在意哪个细节', '哪句话、哪个结果最值得说？为什么？'],
  ['tradeoff', '能接受什么，不能接受什么', '哪些不足不影响使用，哪些会影响你的选择？'],
  ['verdict', '测完之后怎么选', '你会怎么用它，或者在什么条件下推荐？'],
] as const;

export function AuthorPerspectiveFields({ value, onChange, disabled = false }: {
  value?: AuthorPerspective;
  onChange: (value: AuthorPerspective) => void;
  disabled?: boolean;
}) {
  const current = value ?? emptyAuthorPerspective;
  return <details className="rounded-lg border bg-white p-4">
    <summary className="cursor-pointer text-sm font-medium">补充你的判断 <span className="font-normal text-muted-foreground">（选填）</span></summary>
    <p className="mt-2 text-xs text-muted-foreground">只写真实想法，不用填满。文章会保留你的关注点和取舍。</p>
    <fieldset disabled={disabled} className="mt-4 grid gap-4 sm:grid-cols-2">
      {fields.map(([key, label, placeholder]) => <label key={key} className="block">
        <span className="text-xs font-medium">{label}</span>
        <Textarea className="mt-2 min-h-20" maxLength={600} value={current[key]} placeholder={placeholder}
          onChange={event => onChange({ ...current, [key]: event.target.value })} />
      </label>)}
    </fieldset>
  </details>;
}
