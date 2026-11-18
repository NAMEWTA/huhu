#!/usr/bin/env node
// 把 closure-manifest 中尚未存在的上游文件复制进 vendor 目录（不覆盖已有文件，补丁文件不会被动）。
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
const ROOT = resolve(import.meta.dirname, "..");
const OK = process.env.OK_SRC ?? join(ROOT, "temp/sources/open-knowledge");
const man = JSON.parse(readFileSync(join(ROOT, ".agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/closure-manifest.json"), "utf8"));
// 被 Huhu 宿主版取代 / 删除的上游文件（P-S2a-01..03），不再复制
const REMOVED = new Set(["app/src/editor/provider-pool.ts", "app/src/editor/branch-invalidation.ts", "app/src/lib/auth-token.ts", "app/src/lib/server-info-refresh.ts"]);
let n = 0;
for (const f of man.files) {
  const dst = join(ROOT, "packages/editor/src/vendor/open-knowledge", f.upstream.replace(/^packages\/(app|core)\//, "$1/"));
  if (REMOVED.has(f.upstream.replace(/^packages\//, "").replace(/^(app|core)\//, "$1/")) || existsSync(dst)) continue;
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(join(OK, f.upstream), dst);
  n++;
}
console.log(`copied ${n} missing files`);
