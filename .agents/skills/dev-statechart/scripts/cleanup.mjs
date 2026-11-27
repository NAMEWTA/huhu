// 父进程正常关闭或意外退出时，管道 EOF 触发本次子进程和临时文件回收。
import fs from "node:fs";
import { killGroup } from "./process-lifecycle.mjs";

const [pid, ...directories] = process.argv.slice(2);
let workerExited = false;
let pending = "";
process.stdin.setEncoding("utf8").on("data", (chunk) => {
  pending += chunk;
  workerExited ||= pending.includes("exited\n");
});
await new Promise((resolve) => { process.stdin.once("end", resolve); process.stdin.once("error", resolve); });
try { if (!workerExited || process.platform !== "win32") await killGroup(Number(pid)); }
finally { for (const directory of directories) fs.rmSync(directory, { recursive: true, force: true }); }
