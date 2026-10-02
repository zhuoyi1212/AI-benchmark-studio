const internalE2EProductName = /^E2E(?:\s|[-_])/i;
const legacyFixtureNames = new Set(["storage fixture product", "soft delete fixture"]);

export function isVisibleProductLibraryEntry(product: { name: string }): boolean {
  const name = product.name.trim();
  return !internalE2EProductName.test(name) && !legacyFixtureNames.has(name.toLowerCase());
}
