import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();

// Execute the real domain modules without generating build artifacts or
// introducing a separate test implementation of the scoring rules.
export function loadTypeScript(relativePath) {
  const filename = path.resolve(relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const localRequire = (specifier) => specifier.startsWith("@/")
    ? loadTypeScript(`${specifier.slice(2)}.ts`) : require(specifier);
  vm.runInThisContext(`(function(require, module, exports) {${code}\n})`, { filename })(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
