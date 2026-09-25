const internalE2EProductName = /^E2E(?:\s|[-_])/i;

export function isVisibleProductLibraryEntry(product: { name: string }): boolean {
  return !internalE2EProductName.test(product.name.trim());
}
