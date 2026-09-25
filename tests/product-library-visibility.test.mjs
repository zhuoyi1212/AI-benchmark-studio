import assert from "node:assert/strict";
import test from "node:test";
import { isVisibleProductLibraryEntry } from "../lib/product-library-visibility.ts";

test("hides internal E2E products from the customer product library", () => {
  assert.equal(isVisibleProductLibraryEntry({ name: "E2E Experience Product mudvjc1m-0fb6f220" }), false);
  assert.equal(isVisibleProductLibraryEntry({ name: "E2E Compare A run-1234" }), false);
  assert.equal(isVisibleProductLibraryEntry({ name: "E2E-test-product" }), false);
});

test("keeps normal consumer AI products visible", () => {
  assert.equal(isVisibleProductLibraryEntry({ name: "豆包" }), true);
  assert.equal(isVisibleProductLibraryEntry({ name: "Kimi" }), true);
  assert.equal(isVisibleProductLibraryEntry({ name: "E2E Studio" }), false);
  assert.equal(isVisibleProductLibraryEntry({ name: "E2EStudio" }), true);
});
