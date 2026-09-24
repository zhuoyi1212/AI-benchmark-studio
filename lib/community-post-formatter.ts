import type { CommunityPostOutput } from "./ai/schemas/publish.schemas";

const markers = /[（(]\s*p\d+\s*[)）]/gi;
const paragraphs = (body: string) => body.replace(markers, "").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

/** Display references are derived from selection order, never stored in evidence IDs. */
export function formatCommunityBody(body: string, originalBody: string, selectedIds: string[], availableIds: string[], recommendations: CommunityPostOutput["screenshotRecommendations"]) {
  const original = paragraphs(originalBody);
  const current = paragraphs(body);
  const ids = [...new Set(selectedIds)].filter(id => availableIds.includes(id));
  const refs = new Map<number, number[]>();
  ids.forEach((id, index) => {
    const ref = recommendations.find(r => r.artifactId === id);
    if (!ref?.supportsParagraph || !ref.supportsClaim) return;
    const anchor = original[ref.supportsParagraph - 1];
    if (!anchor?.includes(ref.supportsClaim)) return;
    // Moving an unchanged paragraph is safe; editing or duplicating it invalidates the anchor.
    const positions = current.flatMap((p, i) => p === anchor ? [i] : []);
    if (positions.length !== 1) return;
    const position = positions[0]!;
    refs.set(position, [...(refs.get(position) ?? []), index + 1]);
  });
  return current.map((p, index) => p + (refs.get(index) ?? []).map(n => `（p${n}）`).join("")).join("\n\n");
}

export function formatPersonalRating(rating: NonNullable<CommunityPostOutput["editorialPlan"]>["personalRating"]) {
  if (!rating?.enabled || rating.score == null || !rating.scale || rating.score > rating.scale || rating.score < 0 || !rating.reason) return "";
  return `如果满分${rating.scale}分，我个人会给${rating.score}分。\n${rating.reason}`;
}
