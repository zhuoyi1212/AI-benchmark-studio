// Isolated Node harness for production TS modules; never bundled into the app.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
module.exports = function createLoader(root, overrides = {}) {
  const cache = new Map();
  return function load(specifier, parent = path.join(root, 'index.ts')) {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
    if (specifier === 'server-only') return {};
    if (!specifier.startsWith('@/') && !specifier.startsWith('.')) return require(specifier);
    let file = specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(parent), specifier);
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
    if (cache.has(file)) return cache.get(file).exports;
    const tsModule = { exports: {} };
    cache.set(file, tsModule);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const localRequire = name => load(name, file);
    localRequire.resolve = createRequire(file).resolve;
    new Function('require', 'module', 'exports', '__filename', '__dirname', code)(localRequire, tsModule, tsModule.exports, file, path.dirname(file));
    return tsModule.exports;
  };
};
