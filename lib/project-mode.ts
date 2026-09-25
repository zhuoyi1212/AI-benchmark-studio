export type ProjectMode = "single" | "comparison";
export type EvaluationMode = "quick" | "professional";

export const defaultEvaluationMode: EvaluationMode = "quick";

export function isEvaluationMode(value: unknown): value is EvaluationMode {
  return value === "quick" || value === "professional";
}

export function getProjectMode(products: ReadonlyArray<unknown>): ProjectMode {
  return products.length === 1 ? "single" : "comparison";
}

export function isSingleProductMode(products: ReadonlyArray<unknown>): boolean {
  return getProjectMode(products) === "single";
}
