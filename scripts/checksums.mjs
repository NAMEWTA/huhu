import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [dir, target] = process.argv.slice(2);
if (!dir || !target) throw new Error("用法: checksums.mjs <目录> <目标>");
const exts = [".exe", ".dmg", ".AppImage", ".deb"];
const lines = readdirSync(dir)
  .filter((f) => exts.some((e) => f.endsWith(e)))
  .sort()
  .map((f) => `${createHash("sha256").update(readFileSync(path.join(dir, f))).digest("hex")}  ${f}`);
writeFileSync(path.join(dir, `SHA256SUMS-${target}.txt`), lines.join("\n") + "\n");
console.log(lines.join("\n"));
