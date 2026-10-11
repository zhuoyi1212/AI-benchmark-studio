import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // React Compiler is not enabled in this project. Keep its extra diagnostics
  // visible as advice; the conventional Hooks and TypeScript checks stay errors.
  { files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"], rules: { "react-hooks/purity": "warn", "react-hooks/set-state-in-effect": "warn" } },
  // Node test harnesses are intentionally CommonJS, outside Next.js application modules.
  { files: ["scripts/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  globalIgnores([".next*/**", "outputs/**", "node_modules/**", "next-env.d.ts"]),
]);
