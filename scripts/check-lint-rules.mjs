import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = [
  ["scripts/lint-samples/bad-any.ts", "no-explicit-any"],
  ["scripts/lint-samples/plugins/x/src/engine/bad-boundary.ts", "no-restricted-imports"],
];
for (const [file, rule] of cases) {
  const r = spawnSync("pnpm", ["exec", "oxlint", "-c", "scripts/lint-samples/oxlint.json", file], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
  if (r.error || r.status !== 1 || !(r.stdout + r.stderr).includes(rule)) {
    console.error(`样例 ${file} 未被规则 ${rule} 拦截\n${r.stdout}${r.stderr}`);
    process.exit(1);
  }
}
console.log("lint 规则拦截样例：OK");
