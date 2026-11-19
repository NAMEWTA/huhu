#!/usr/bin/env node
// 对照 closure-manifest（上游路径 + SHA-256）与 vendor 目录，列出：改动 / 删除 / 新增（非上游）的文件，
// 并与 PATCHES.md 登记的路径逐一比对（G02：登记集合必须与实际差异完全一致，否则失败）。
// 用法：node scripts/ok-patches.mjs [--check] [--json] 或 OK_SRC=... node scripts/ok-patches.mjs [--replay | --refresh-replay]
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

const ROOT = resolve(import.meta.dirname, "..");
const V = join(ROOT, "packages/editor/src/vendor/open-knowledge");
const man = JSON.parse(readFileSync(join(ROOT, ".agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/closure-manifest.json"), "utf8"));
// 上游测试 / 助手 / fixtures（迁入 vendor、与被测源码同目录）：路径 → 上游 SHA-256；不在闭包清单里，单独一份清单。
// 重新生成：OK_SRC=<上游工作副本> node scripts/ok-patches.mjs --write-tests-manifest（只收录与上游同路径的文件）
const TESTS_MANIFEST = join(ROOT, ".agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/tests-manifest.json");
const testsMan = existsSync(TESTS_MANIFEST) ? JSON.parse(readFileSync(TESTS_MANIFEST, "utf8")) : {};
const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha = (f) => hashBytes(readFileSync(f));
const rel = (p) => p.replace(/^packages\/(app|core)\//, "$1/");

const REPLAY_DIR = join(ROOT, ".agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity");
const REPLAY_MANIFEST = join(REPLAY_DIR, "vendor-replay.json");
const REPLAY_PATCH = join(REPLAY_DIR, "vendor-replay.patch.gz");
const PIN = "44a2e0a6acce5952da0764746e3693fded5025b4";

function filePaths(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.name === ".git") return [];
    if (entry.isDirectory()) return filePaths(root, file);
    if (!entry.isFile()) throw new Error(`闭包只接受普通文件：${file}`);
    return [relative(root, file).split("\\").join("/")];
  });
}

function upstreamObjects(upstream) {
  const gitTree = execFileSync("git", ["-C", upstream, "ls-tree", "-rz", PIN], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return new Map(
    gitTree
      .split("\0")
      .filter(Boolean)
      .map((entry) => {
        const [meta, path] = entry.split("\t");
        return [path, meta.split(" ")[2]];
      }),
  );
}

function upstreamPathFor(target, objects) {
  if (objects.has(`packages/${target}`)) return `packages/${target}`;
  if (target === "LICENSE" && objects.has(target)) return target;
  if (!target.startsWith("server-bridge/")) return null;
  const file = target.split("/").at(-1);
  const exact = `packages/server/src/${file}`;
  if (objects.has(exact)) return exact;
  const named = [...objects.keys()].filter((path) => path.startsWith("packages/server/src/") && path.endsWith(`/${file}`));
  return named.length === 1 ? named[0] : null;
}

function projectUpstream(upstream, rows, target) {
  const items = rows.filter((row) => row.upstream);
  const input = items.map((row) => `${PIN}:${row.upstream}\n`).join("");
  const batch = spawnSync("git", ["-C", upstream, "cat-file", "--batch"], { input, maxBuffer: 256 * 1024 * 1024 });
  if (batch.error || batch.status !== 0) throw batch.error ?? new Error(String(batch.stderr));
  let offset = 0;
  for (const row of items) {
    const end = batch.stdout.indexOf(10, offset);
    const [blob, type, size] = batch.stdout.toString("ascii", offset, end).split(" ");
    if (blob !== row.blob || type !== "blob") throw new Error(`固定上游 blob 有误：${row.upstream}`);
    offset = end + 1;
    const bytes = batch.stdout.subarray(offset, offset + Number(size));
    offset += Number(size) + 1;
    const file = join(target, row.target);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
}

function listDifference(expected, actual) {
  const files = new Set([...expected.keys(), ...actual.keys()]);
  return [...files].filter((path) => expected.get(path) !== actual.get(path));
}

function replayVendor(refresh) {
  const upstream = process.env.OK_SRC;
  if (!upstream) throw new Error("需要 OK_SRC=<固定上游 Git 工作副本>");
  const objects = upstreamObjects(upstream);
  const scratch = mkdtempSync(join(tmpdir(), "huhu-ok-replay-"));
  const git = (args, options = {}) => execFileSync("git", ["-c", "core.autocrlf=false", "-c", "core.fileMode=false", "-C", scratch, ...args], options);
  try {
    const actualFiles = filePaths(V).sort();
    const actual = new Map(actualFiles.map((path) => [path, sha(join(V, path))]));
    if (refresh) {
      const notes = readFileSync(join(V, "PATCHES.md"), "utf8").split("\n");
      const rows = actualFiles.map((target) => {
        const source = upstreamPathFor(target, objects);
        return { target, upstream: source, blob: source ? objects.get(source) : null, sha256: actual.get(target) };
      });
      projectUpstream(upstream, rows, scratch);
      for (const row of rows) {
        const unchanged = row.upstream && sha(join(scratch, row.target)) === row.sha256;
        row.method = unchanged ? "copy" : row.upstream ? "patch" : "local";
        if (!unchanged) {
          const index = notes.findIndex((line) => line.includes(`\`${row.target}\``));
          row.description = index >= 0 ? `PATCHES.md:${index + 1} ${notes[index].trim()}` : "本地说明或生成文件，实际改动见重放补丁。";
        }
      }
      git(["init", "-q"]);
      git(["add", "-f", "."]);
      const base = git(["write-tree"], { encoding: "utf8" }).trim();
      for (const path of actualFiles) {
        mkdirSync(dirname(join(scratch, path)), { recursive: true });
        cpSync(join(V, path), join(scratch, path));
      }
      git(["add", "-f", "."]);
      const delta = git(["diff", "--cached", "--no-ext-diff", "--binary", "--full-index", base, "--"], { maxBuffer: 64 * 1024 * 1024 });
      writeFileSync(REPLAY_MANIFEST, JSON.stringify({ upstreamCommit: PIN, files: rows }, null, 2) + "\n");
      writeFileSync(REPLAY_PATCH, gzipSync(delta, { level: 9 }));
      console.log(`已登记 ${rows.length} 项来源，差异补丁 ${delta.length} 字节`);
      return;
    }
    const ledger = JSON.parse(readFileSync(REPLAY_MANIFEST, "utf8"));
    if (ledger.upstreamCommit !== PIN) throw new Error("重放清单的上游提交不匹配");
    const expected = new Map(ledger.files.map((row) => [row.target, row.sha256]));
    const staleFiles = listDifference(expected, actual);
    if (staleFiles.length) throw new Error(`闭包清单与 vendor 不符：\n${staleFiles.join("\n")}`);
    projectUpstream(upstream, ledger.files, scratch);
    git(["apply", "--binary", "--whitespace=nowarn", "-"], { input: gunzipSync(readFileSync(REPLAY_PATCH)) });
    const replayed = new Map(filePaths(scratch).map((path) => [path, sha(join(scratch, path))]));
    const diffs = listDifference(actual, replayed);
    if (diffs.length) throw new Error(`重放不一致：\n${diffs.join("\n")}`);
    console.log(`从固定上游重放 ${replayed.size} 文件，文件集合及字节零差异`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv.includes("--refresh-replay") || process.argv.includes("--replay")) {
  replayVendor(process.argv.includes("--refresh-replay"));
  process.exit(0);
}

const modified = [];
const removed = [];
const manifestPaths = new Set();
for (const f of man.files) {
  const r = rel(f.upstream);
  manifestPaths.add(r);
  const dst = join(V, r);
  if (!existsSync(dst)) removed.push(r);
  else if (sha(dst) !== f.sha256) modified.push(r);
}
// 非上游文件：vendor 目录下不在清单里的（不含 PATCHES / UPSTREAM / LICENSE 说明文件与资源目录 locales / css 拷贝）
const added = [];
const testsModified = [];
// 收尾迁入的测试有固定上游 blob，归档测试清单仍按归档时的版本保存。
const replay = existsSync(REPLAY_MANIFEST) ? JSON.parse(readFileSync(REPLAY_MANIFEST, "utf8")) : null;
const replayTestBlobs = new Map(
  (replay?.upstreamCommit === PIN ? replay.files : []).filter(({ target, upstream, blob }) => blob && upstream === `packages/${target}` && /\.test\.tsx?$/.test(target)).map(({ target, blob }) => [target, blob]),
);
const EXTRA_OK = new Set(["PATCHES.md", "UPSTREAM.md", "LICENSE"]);
function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else {
      const r = relative(V, p).split("\\").join("/");
      if (manifestPaths.has(r) || EXTRA_OK.has(r)) continue;
      if (testsMan[r]) {
        if (sha(p) !== testsMan[r]) testsModified.push(r);
        continue;
      }
      const upstreamTestBlob = replayTestBlobs.get(r);
      if (upstreamTestBlob) {
        const bytes = readFileSync(p);
        const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
        if (blob !== upstreamTestBlob) {
          testsModified.push(r);
          continue;
        }
      }
      added.push(r);
    }
  }
}
walk(V);

const patchesFile = join(V, "PATCHES.md");
const registered = new Set();
if (existsSync(patchesFile)) for (const m of readFileSync(patchesFile, "utf8").matchAll(/`((?:app|core|server-bridge)\/[^`\s]+)`/g)) registered.add(m[1]);
const actual = new Set([...modified, ...removed, ...added, ...testsModified]);
const unregistered = [...actual].filter((p) => !registered.has(p));
const stale = [...registered].filter((p) => !actual.has(p));

if (process.argv.includes("--write-tests-manifest")) {
  const OK = process.env.OK_SRC;
  if (!OK) throw new Error("需要 OK_SRC=上游工作副本路径");
  const out = {};
  const walk2 = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk2(p);
      else {
        const r = relative(V, p).split("\\").join("/");
        if (manifestPaths.has(r) || EXTRA_OK.has(r)) continue;
        const up = join(OK, "packages", r.replace(/^(app|core)\//, "$1/"));
        if (existsSync(up)) out[r] = sha(up);
      }
    }
  };
  walk2(V);
  writeFileSync(TESTS_MANIFEST, JSON.stringify(Object.fromEntries(Object.entries(out).sort()), null, 2) + "\n");
  console.log(`tests-manifest: ${Object.keys(out).length} files`);
  process.exit(0);
}
if (process.argv.includes("--json")) console.log(JSON.stringify({ modified, testsModified, removed, added, unregistered, stale }, null, 2));
else console.log(`改动 ${modified.length}｜测试改动 ${testsModified.length}｜删除 ${removed.length}｜新增 ${added.length}｜PATCHES.md 登记 ${registered.size}｜未登记 ${unregistered.length}｜多余登记 ${stale.length}`);
if (unregistered.length) console.log("未登记：\n  " + unregistered.join("\n  "));
if (stale.length) console.log("多余登记：\n  " + stale.join("\n  "));
if (process.argv.includes("--check") && (unregistered.length || stale.length)) process.exit(1);
