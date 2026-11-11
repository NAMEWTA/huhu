#!/usr/bin/env node
// 按 scripts/herdr.lock.json 下载官方 Herdr Core 发布包，校验 SHA-256，解压到 apps/desktop/resources/herdr/<platform>-<arch>/。
// 用法：node scripts/fetch-herdr.mjs [--target win32-x64] [--print-path]
// 校验失败即退出非 0（构建失败）；已下载且校验通过的包缓存在 .cache/herdr/<version>/。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(readFileSync(path.join(root, "scripts", "herdr.lock.json"), "utf8"));
const args = process.argv.slice(2);
const targetArg = args.includes("--target") ? args[args.indexOf("--target") + 1] : undefined;
if (args.includes("--target") && !targetArg) {
  console.error("--target 需要一个值，例如 win32-x64");
  process.exit(1);
}
const target = targetArg ?? `${process.platform}-${process.arch}`;
const entry = lock.targets[target];
if (!entry) {
  console.error(`herdr.lock.json 没有目标 ${target}（可用：${Object.keys(lock.targets).join(", ")}）`);
  process.exit(1);
}
const exe = target.startsWith("win32") ? "herdr-core.exe" : "herdr-core";
const dest = path.join(root, "apps", "desktop", "resources", "herdr", target);
const bin = path.join(dest, exe);
const marker = path.join(dest, ".herdr-lock");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const log = (m) => console.error(`[fetch-herdr] ${m}`); // stdout 留给 --print-path

async function download() {
  const cacheDir = path.join(root, ".cache", "herdr", lock.version);
  mkdirSync(cacheDir, { recursive: true });
  const file = path.join(cacheDir, path.basename(new URL(entry.url).pathname));
  if (existsSync(file) && sha256(readFileSync(file)) === entry.sha256) return file;
  log(`下载 ${entry.url}`);
  const res = await fetch(entry.url);
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== entry.sha256) throw new Error(`SHA-256 不匹配：期望 ${entry.sha256}，实际 ${got}`);
  writeFileSync(file, buf);
  return file;
}

function extract(archive) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "huhu-herdr-"));
  try {
    // tar：Linux/macOS 自带；Windows 10+ 的 bsdtar 也能解 zip
    execFileSync("tar", ["-xf", archive, "-C", tmp], { stdio: "inherit" });
    if (!existsSync(path.join(tmp, exe))) throw new Error(`压缩包里没有 ${exe}（内容：${readdirSync(tmp).join(", ")}）`);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    cpSync(tmp, dest, { recursive: true });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

try {
  const current = existsSync(marker) ? readFileSync(marker, "utf8").trim() : "";
  if (current === `${lock.version} ${entry.sha256}` && existsSync(bin)) {
    log(`${target} 已就绪（${lock.version}）`);
  } else {
    extract(await download());
    if (!target.startsWith("win32")) chmodSync(bin, 0o755);
    writeFileSync(marker, `${lock.version} ${entry.sha256}\n`);
    log(`${target} ${lock.version} 已放置到 ${path.relative(root, dest)}`);
  }
  if (args.includes("--print-path")) process.stdout.write(`${bin}\n`);
} catch (e) {
  console.error(`[fetch-herdr] 失败：${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
