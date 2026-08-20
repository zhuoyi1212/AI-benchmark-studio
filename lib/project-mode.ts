export type ProjectMode = "single" | "comparison";

export function getProjectMode(products: ReadonlyArray<unknown>): ProjectMode {
  return products.length === 1 ? "single" : "comparison";
}

export function isSingleProductMode(products: ReadonlyArray<unknown>): boolean {
  return getProjectMode(products) === "single";
}
