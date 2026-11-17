#!/usr/bin/env node
// 生成 packages/editor/src/host/core-barrel.ts：vendor 的 server-bridge 文件从 '@inkeep/open-knowledge-core'（根入口）
// 取符号，而根入口 index.ts 会拖进 git / acp / sharing 等无关模块。这里只按实际用到的符号，从上游 index.ts
// 的 re-export 反查所属子模块，生成一个精确的 barrel。
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OK = process.env.OK_SRC ?? join(ROOT, "temp/sources/open-knowledge");
const V = join(ROOT, "packages/editor/src/vendor/open-knowledge");
const used = new Set();
for (const dir of ["server-bridge"]) {
  for (const f of readdirSync(join(V, dir))) {
    if (!f.endsWith(".ts")) continue;
    const s = readFileSync(join(V, dir, f), "utf8");
    for (const m of s.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'@inkeep\/open-knowledge-core'/g))
      for (let n of m[1].split(",")) {
        n = n
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0];
        if (n) used.add(n);
      }
  }
}
const idx = readFileSync(join(OK, "packages/core/src/index.ts"), "utf8");
const map = new Map();
for (const m of idx.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/gs))
  for (let n of m[1].split(",")) {
    n = n.trim();
    if (!n) continue;
    const isType = /^type\s/.test(n);
    const parts = n.replace(/^type\s+/, "").split(/\s+as\s+/);
    map.set((parts[1] ?? parts[0]).trim(), { mod: m[2], orig: parts[0].trim(), isType });
  }
const byMod = new Map();
const missing = [];
for (const n of [...used].sort()) {
  const e = map.get(n);
  if (!e) {
    missing.push(n);
    continue;
  }
  if (!byMod.has(e.mod)) byMod.set(e.mod, []);
  byMod.get(e.mod).push(e.orig === n ? `${e.isType ? "type " : ""}${n}` : `${e.isType ? "type " : ""}${e.orig} as ${n}`);
}
let out = `// 生成文件（scripts/ok-barrel-gen.mjs）——不要手改。上游 core 根入口的精确子集（只含 server-bridge 实际用到的符号）。\n`;
for (const [mod, names] of byMod) out += `export {\n  ${names.join(",\n  ")},\n} from '${mod.replace(/^\.\//, "../vendor/open-knowledge/core/src/")}';\n`;
mkdirSync(join(ROOT, "packages/editor/src/host"), { recursive: true });
writeFileSync(join(ROOT, "packages/editor/src/host/core-barrel.ts"), out);
console.log("symbols", used.size, "missing", missing);
