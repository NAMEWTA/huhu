import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { checkEvidence } from "../.agents/skills/dev-verify/scripts/check-evidence.mjs";

const root = resolve(import.meta.dirname, "..");
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0");
const changePath = /^(\.agents\/dev\/(?:changes|archive\/changes\/(?:implemented|rejected))\/[^/]+)\/(.+)$/;
const capture = /\.(?:png|jpe?g|webp|webm|mp4|har|log|out|jsonl|zip|tgz|gz|exe|bundle)$/i;
const changes = new Set();
const failures = [];

for (const file of files) {
  if (/^temp\/(?:dev|system)\//.test(file) || (/^\.agents\/system\/herdr(?:-core)?\//.test(file) && capture.test(file))) {
    failures.push(`运行原件应放进忽略的 temp/ 目录：${file}`);
    continue;
  }
  const match = changePath.exec(file);
  if (!match) continue;
  const [, change, localPath] = match;
  if (/^(?:tasks|evidences)\//.test(localPath)) changes.add(change);
  if (localPath.startsWith("evidence/")) {
    failures.push(`使用根 evidence.md、同名 evidences/ 或 temp/dev/：${file}`);
  } else if (capture.test(localPath) && !/^(?:prototype|recovery)\//.test(localPath)) {
    failures.push(`运行原件应放进忽略的 temp/dev/ 目录：${file}`);
  }
}

let count = 0;
for (const change of changes) {
  try {
    const result = checkEvidence(join(root, change));
    count += result.count;
    failures.push(...result.problems.map((problem) => `${change}：${problem}`));
  } catch (error) {
    failures.push(error.message);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(`证据结构通过，共 ${changes.size} 项变更、${count} 对票据和报告。`);
}
