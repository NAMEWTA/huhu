// 构建时写入 apps/desktop/out/build-info.json（版本、提交、构建时间），“关于”页读取。
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
let commit = process.env["GITHUB_SHA"] ?? "";
if (!commit) {
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    commit = "unknown";
  }
}
const out = path.join(root, "apps/desktop/out");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "build-info.json"), `${JSON.stringify({ version, commit, builtAt: new Date().toISOString() }, null, 2)}\n`);
console.log(`build-info.json：${version} ${commit.slice(0, 7)}`);
