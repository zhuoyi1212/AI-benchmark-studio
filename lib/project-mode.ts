export type ProjectMode = "single" | "comparison";

export function getProjectMode(products: Array<unknown>): ProjectMode {
  return products.length === 1 ? "single" : "comparison";
}

export function isSingleProductMode(products: Array<unknown>): boolean {
  return getProjectMode(products) === "single";
}
