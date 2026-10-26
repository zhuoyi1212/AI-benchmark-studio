import type { CommunityStyleEdit } from './ai/schemas/publish.schemas';

export type CommunityDetail = { kind: 'quote' | 'number' | 'name'; value: string };
type ReviewIssue = { field: string; quote: string | null; kind: string; instruction: string; reason: string };
const canonical = (text: string) => text.normalize('NFKC').replace(/\[\[(\d+)\]\]/g, '[$1]').replace(/\*\*|\s+/g, '');

/** Verbatim long quotes in text evidence, allowing typography and explicit ellipses only. */
export function originalQuoteIssues(body: string, originalDetails: string): ReviewIssue[] {
  const typography = (text: string) => canonical(text).replace(/[“”‘’「」『』"']/g, '');
  const source = typography(originalDetails);
  return extractCommunityDetails(body).filter(detail => detail.kind === 'quote' && Array.from(detail.value).length >= 8)
    .filter(detail => {
      const excerpts = typography(detail.value).split(/…+|\.{3,}/).filter(Boolean);
      let position = 0;
      for (const excerpt of excerpts) {
        const found = source.indexOf(excerpt, position);
        if (found < 0) return true;
        position = found + excerpt.length;
      }
      return false;
    }).map(detail => ({ field: 'body', quote: detail.value, kind: 'fact', reason: '直接引语不是原始材料的连续原文', instruction: '按原文纠正这段引语，或删除该引语；不能静默删改中间成分后仍冒充逐字引用' }));
}

export function verbatimTextMatches(body: string, originalDetails: string) {
  const invalid = new Set(originalQuoteIssues(body, originalDetails).map(issue => issue.quote));
  return extractCommunityDetails(body).filter(detail => detail.kind === 'quote' && detail.value.length >= 8 && !invalid.has(detail.value))
    .map(detail => ({ quote: detail.value, basis: 'originalDetails literal text, typography/explicit ellipses normalized; not external verification' }));
}

/** Surface details, not a semantic completeness metric. Chinese names need supplied known names. */
export function extractCommunityDetails(text: string, knownNames: string[] = []): CommunityDetail[] {
  const details: CommunityDetail[] = [];
  const pairs: Record<string, string> = { '“': '”', '「': '」', '『': '』', '"': '"' };
  const stack: Array<{ end: string; start: number }> = [];
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (stack.at(-1)?.end === char) {
      const open = stack.pop()!;
      const value = text.slice(open.start + 1, index).trim();
      if (value) details.push({ kind: 'quote', value });
    } else if (pairs[char]) stack.push({ end: pairs[char]!, start: index });
  }
  const numberPattern = /\[\[\d+\]\]|\[\d+\]|\d+(?:\.\d+)?\s*[×xX]\s*\d+(?:\.\d+)?(?:\s*(?:px|像素))?|\d{1,2}:\d{2}(?:[—–-]\d{1,2}:\d{2})?|\d+(?:\.\d+)?(?:\s*(?:%|％|分钟|小时|秒|毫秒|元|万元|张|次|篇|条|个|年|px|像素))?/g;
  for (const match of text.matchAll(numberPattern)) details.push({ kind: 'number', value: match[0] });
  for (const match of text.matchAll(/\b[A-Z][A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*\b/g)) details.push({ kind: 'name', value: match[0] });
  for (const name of knownNames) if (name && text.includes(name)) details.push({ kind: 'name', value: name });
  return [...new Map(details.map(detail => [`${detail.kind}:${canonical(detail.value)}`, detail])).values()];
}

export function detailIsPresent(detail: CommunityDetail, text: string) {
  // Numbers/names must match complete tokens: 43 is not retained by 143, 15 by 150.
  if (detail.kind === 'quote') return canonical(text).includes(canonical(detail.value));
  return extractCommunityDetails(text, detail.kind === 'name' ? [detail.value] : []).some(candidate => candidate.kind === detail.kind && canonical(candidate.value) === canonical(detail.value));
}

function explicitlyRemoved(detail: CommunityDetail, issues: ReviewIssue[]) {
  return issues.some(issue => issue.field === 'body' && issue.quote && canonical(issue.quote).includes(canonical(detail.value)) && (
    (/删除|删去|移除|去掉/.test(issue.instruction) && (
      canonical(issue.instruction).includes(canonical(detail.value)) ||
      canonical(issue.quote).replace(/[“”「」"『』]/g, '') === canonical(detail.value) ||
      /(?:删除|删去|移除|去掉)(?:该|这|此|整)?(?:句|段|引语|引文|引用|数字|数值|说法)/.test(issue.instruction)
    )) ||
    (issue.kind === 'fact' && /纠正|更正|改为|修正/.test(issue.instruction)) ||
    (detail.kind === 'quote' && /引用过长|引文过长/.test(issue.reason + issue.instruction) && /压缩|缩短|转述/.test(issue.instruction))
  ));
}

export function revisionDetailIssues(original: CommunityStyleEdit, revised: CommunityStyleEdit, issues: ReviewIssue[], originalDetails = '', knownNames: string[] = []) {
  return extractCommunityDetails(original.body, knownNames)
    // Ordinary capitalized prose is not a known proper noun without source support.
    .filter(detail => detail.kind !== 'name' || canonical(originalDetails).includes(canonical(detail.value)) || knownNames.includes(detail.value))
    .filter(detail => !detailIsPresent(detail, revised.body) && !explicitlyRemoved(detail, issues))
    .map(detail => `具体细节丢失（${detail.kind}）：“${detail.value}”；审核未明确要求删除，请恢复原话/数值/专名，不能把引用改成转述`);
}

/** Only originalDetails-backed quotes/numbers count; source selection and naturalness are separate. */
export function groundedDetailMetrics(body: string, originalDetails: string) {
  const retained = extractCommunityDetails(body).filter(detail => detail.kind !== 'name' && detailIsPresent(detail, originalDetails));
  return { count: retained.length, quotes: retained.filter(detail => detail.kind === 'quote').length, numbers: retained.filter(detail => detail.kind === 'number').length, details: retained };
}
