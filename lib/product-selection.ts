export type SelectableProduct = { id: string; name: string; officialUrl: string | null };

export function findProductCandidates(products: SelectableProduct[], name: string, website: string) {
  const query = name.trim().toLocaleLowerCase();
  const host = officialHost(website);
  return products.filter(product =>
    (query.length > 0 && product.name.toLocaleLowerCase().includes(query))
    || (host !== null && host === officialHost(product.officialUrl ?? '')),
  ).slice(0, 6);
}

function officialHost(value: string) {
  try { return new URL(value).hostname.toLocaleLowerCase().replace(/^www\./, ''); }
  catch { return null; }
}
