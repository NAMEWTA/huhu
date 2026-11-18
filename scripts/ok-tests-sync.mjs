#!/usr/bin/env node
// 把上游测试迁入 vendor 目录（与被测源码同目录，保持上游相对导入不变）。
// 只迁入“所在目录有 closure 文件”的 core 测试及其助手 / fixtures；app（dom）测试需要 jsdom 预加载与 test-support，S2a 2a-3 首版未迁。
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OK = process.env.OK_SRC ?? join(ROOT, "temp/sources/open-knowledge");
const V = join(ROOT, "packages/editor/src/vendor/open-knowledge");
const man = JSON.parse(readFileSync(join(ROOT, ".agents/dev/changes/2026-11-14-knowledge-ok-parity/evidence/closure-manifest.json"), "utf8"));
const dirs = new Set(man.files.filter((f) => f.area === "core").map((f) => dirname(f.upstream)));
const isTestLike = (n) => /\.(test|test-helper|type-tests)\.[tj]sx?$/.test(n) || n === "fixtures";
// vendor-tests-na.json（ok-tests-prune.mjs 维护）里的测试是“不适用”，不再迁入
const NA = new Set(JSON.parse(readFileSync(join(ROOT, ".agents/dev/changes/2026-11-14-knowledge-ok-parity/evidence/vendor-tests-na.json"), "utf8")).map((x) => x.file));
let n = 0;
function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) copyTree(s, d);
    else if (!existsSync(d)) {
      copyFileSync(s, d);
      n++;
    }
  }
}
for (const dir of dirs) {
  const abs = join(OK, dir);
  for (const name of readdirSync(abs)) {
    if (!isTestLike(name)) continue;
    const s = join(abs, name);
    const d = join(V, relative(join(OK, "packages"), s));
    if (statSync(s).isDirectory()) copyTree(s, d);
    else if (!existsSync(d) && !NA.has(relative(V, d).split("\\").join("/"))) {
      mkdirSync(dirname(d), { recursive: true });
      copyFileSync(s, d);
      n++;
    }
  }
}
console.log(`copied ${n} test files`);
