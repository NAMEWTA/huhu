// 版本号的单一来源是根 package.json 的 version：写入各 workspace 包与 CLI 的 VERSION 常量。
// 用法：node scripts/sync-version.mjs        写入
//       node scripts/sync-version.mjs --check  只检查，不一致则退出非 0（CI 用）
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const rootPkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = rootPkg.version;
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`根 package.json 的 version 不是语义化版本：${version}`);
  process.exit(1);
}

const files = execFileSync("git", ["ls-files", "--", "**/package.json", "package.json"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !f.includes("node_modules") && !f.startsWith("vendor/") && !f.startsWith("temp/") && !f.startsWith(".agents/"));
const drift = [];
for (const rel of files) {
  const abs = path.join(root, rel);
  const text = readFileSync(abs, "utf8");
  const pkg = JSON.parse(text);
  if (pkg.version === undefined || pkg.version === version) continue;
  drift.push(`${rel}: ${pkg.version}`);
  if (!check) writeFileSync(abs, text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`));
}
const cliMain = path.join(root, "apps/cli/src/main.ts");
const cliText = readFileSync(cliMain, "utf8");
const cliNext = cliText.replace(/(export const VERSION = ")[^"]*(")/, `$1${version}$2`);
if (cliNext !== cliText) {
  drift.push("apps/cli/src/main.ts: VERSION");
  if (!check) writeFileSync(cliMain, cliNext);
}

if (check && drift.length > 0) {
  console.error(`版本号与根 package.json（${version}）不一致，请运行 node scripts/sync-version.mjs：\n  ${drift.join("\n  ")}`);
  process.exit(1);
}
console.log(drift.length === 0 ? `版本号一致：${version}` : `已同步到 ${version}：${drift.length} 处`);
