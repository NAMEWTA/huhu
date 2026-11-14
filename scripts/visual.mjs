#!/usr/bin/env node
// 样式等价性验证入口（tests/visual）。用法：
//   pnpm visual:baseline <name> [--themes claude,apple,notion,vercel] [--no-states] [--no-build]
//   pnpm visual:compare  <name> [同上]
//   pnpm visual:noise    [name]    连续生成两份基线并互相比对，找出不稳定的区域
// 基线保存在 .visual/<name>/（不进 git）。Linux 无显示环境时自动用 xvfb-run。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const [cmd, ...rest] = process.argv.slice(2);
const flags = rest.filter((a) => a.startsWith("--"));
const themesIdx0 = rest.indexOf("--themes");
const pos = rest.filter((a, i) => !a.startsWith("--") && i !== themesIdx0 + 1);
const themesIdx = rest.indexOf("--themes");
const themes = themesIdx >= 0 ? rest[themesIdx + 1] : "claude";
const noStates = flags.includes("--no-states");
if (!["baseline", "compare", "noise"].includes(cmd ?? "")) {
  console.error("用法：visual.mjs <baseline|compare|noise> <name> [--themes a,b] [--no-states]");
  process.exit(2);
}

function build() {
  if (flags.includes("--no-build")) return 0;
  console.log("先构建（visual 运行的是 apps/desktop/out 里的构建产物）…");
  return spawnSync("pnpm", ["build"], { stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;
}

function run(mode, name, update) {
  const env = { ...process.env, VISUAL_NAME: name, VISUAL_MODE: mode, VISUAL_THEMES: themes, ...(noStates ? { VISUAL_STATES: "0" } : {}) };
  const args = ["exec", "playwright", "test", "-c", "playwright.visual.config.ts", ...(update ? ["--update-snapshots"] : [])];
  const useXvfb = process.platform === "linux" && !process.env.DISPLAY && existsSync("/usr/bin/xvfb-run");
  const r = useXvfb ? spawnSync("xvfb-run", ["-a", "pnpm", ...args], { stdio: "inherit", env }) : spawnSync("pnpm", args, { stdio: "inherit", env, shell: process.platform === "win32" });
  return r.status ?? 1;
}

if (build() !== 0) process.exit(1);
if (cmd === "baseline") {
  if (!pos[0]) {
    console.error("需要基线名");
    process.exit(2);
  }
  process.exit(run("baseline", pos[0], true));
} else if (cmd === "compare") {
  if (!pos[0]) {
    console.error("需要基线名");
    process.exit(2);
  }
  process.exit(run("compare", pos[0], false));
} else {
  const a = pos[0] ?? "noise";
  if (run("baseline", a, true) !== 0) process.exit(1);
  console.log(`\n== 与刚生成的基线 ${a} 再比对一次：任何差异都是噪声，需要写入遮罩或等待条件（tests/visual/masks.ts）==`);
  process.exit(run("compare", a, false));
}
