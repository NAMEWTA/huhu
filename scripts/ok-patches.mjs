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
const ARCHIVE = join(ROOT, ".agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence");
const man = JSON.parse(readFileSync(join(ARCHIVE, "closure-manifest.json"), "utf8"));
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

function upstreamObjects(upstream, pin) {
  const gitTree = execFileSync("git", ["-C", upstream, "ls-tree", "-rz", pin], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
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
  if (target === "server-bridge/link-preview/ip-classifier.ts") return "packages/core/src/util/ip-classifier.ts";
  if (objects.has(`packages/${target}`)) return `packages/${target}`;
  if (target === "LICENSE" && objects.has(target)) return target;
  if (!target.startsWith("server-bridge/")) return null;
  const file = target.split("/").at(-1);
  const exact = `packages/server/src/${file}`;
  if (objects.has(exact)) return exact;
  const named = [...objects.keys()].filter((path) => path.startsWith("packages/server/src/") && path.endsWith(`/${file}`));
  return named.length === 1 ? named[0] : null;
}

function projectUpstream(upstream, pin, rows, target) {
  const items = rows.filter((row) => row.upstream);
  const input = items.map((row) => `${pin}:${row.upstream}\n`).join("");
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

function replayVendor({ root, pin, env, manifest, patch, sourcePath }, refresh) {
  const upstream = process.env[env];
  if (!upstream) throw new Error(`需要 ${env}=<固定上游 Git 工作副本>`);
  const objects = upstreamObjects(upstream, pin);
  const scratch = mkdtempSync(join(tmpdir(), "huhu-ok-replay-"));
  const git = (args, options = {}) => execFileSync("git", ["-c", "core.autocrlf=false", "-c", "core.fileMode=false", "-C", scratch, ...args], options);
  try {
    const actualFiles = filePaths(root).sort();
    const actual = new Map(actualFiles.map((path) => [path, sha(join(root, path))]));
    if (refresh) {
      const notes = readFileSync(join(root, "PATCHES.md"), "utf8").split("\n");
      const rows = actualFiles.map((target) => {
        const source = sourcePath(target, objects);
        return { target, upstream: source, blob: source ? objects.get(source) : null, sha256: actual.get(target) };
      });
      projectUpstream(upstream, pin, rows, scratch);
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
        cpSync(join(root, path), join(scratch, path));
      }
      git(["add", "-f", "."]);
      const delta = git(["diff", "--cached", "--no-ext-diff", "--binary", "--full-index", base, "--"], { maxBuffer: 64 * 1024 * 1024 });
      writeFileSync(manifest, JSON.stringify({ upstreamCommit: pin, files: rows }, null, 2) + "\n");
      writeFileSync(patch, gzipSync(delta, { level: 9 }));
      console.log(`已登记 ${rows.length} 项来源，差异补丁 ${delta.length} 字节`);
      return;
    }
    const ledger = JSON.parse(readFileSync(manifest, "utf8"));
    if (ledger.upstreamCommit !== pin) throw new Error("重放清单的上游提交不匹配");
    const expected = new Map(ledger.files.map((row) => [row.target, row.sha256]));
    const staleFiles = listDifference(expected, actual);
    if (staleFiles.length) throw new Error(`闭包清单与 vendor 不符：\n${staleFiles.join("\n")}`);
    projectUpstream(upstream, pin, ledger.files, scratch);
    git(["apply", "--binary", "--whitespace=nowarn", "-"], { input: gunzipSync(readFileSync(patch)) });
    const replayed = new Map(filePaths(scratch).map((path) => [path, sha(join(scratch, path))]));
    const diffs = listDifference(actual, replayed);
    if (diffs.length) throw new Error(`重放不一致：\n${diffs.join("\n")}`);
    console.log(`从固定上游重放 ${replayed.size} 文件，文件集合及字节零差异`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const OK = { root: V, pin: PIN, env: "OK_SRC", manifest: REPLAY_MANIFEST, patch: REPLAY_PATCH, sourcePath: upstreamPathFor };
const orcaEditor = "src/renderer/src/components/editor";
const ORCA = {
  root: join(ROOT, "plugins/notes/src/vendor/orca/pdf"),
  pin: "7041ea022826ec19d627cd3a129b665822e7bf0a",
  env: "ORCA_SRC",
  manifest: join(ARCHIVE, "orca-replay.json"),
  patch: join(ARCHIVE, "orca-replay.patch.gz"),
  sourcePath(target, objects) {
    const path =
      {
        LICENSE: "LICENSE",
        "pdf-range-transport.ts": `${orcaEditor}/pdf-orca-media-range-transport.ts`,
        "zoom-wheel.ts": `${orcaEditor}/image-viewer-zoom.ts`,
        "scroll-cache.ts": "src/renderer/src/lib/scroll-cache.ts",
      }[target] ?? `${orcaEditor}/${target}`;
    return objects.has(path) ? path : null;
  },
};

const ORCA_RELATED = new Map([
  ["config/patches/pdfjs-dist@6.3.289.patch", ["patches/pdfjs-dist@6.3.289.patch", "R-44 PDF.js 局部渲染补丁"]],
  ["config/build-plugins/pdfjs-viewer-assets.ts", ["apps/desktop/scripts/pdfjs-viewer-assets.ts", "R-44 调整依赖解析根"]],
  [`${orcaEditor}/file-view-preference-storage.ts`, ["plugins/notes/src/vendor/orca/pdf/pdf-scale-preference-storage.ts", "P-S7-04 合并偏好存储逻辑"]],
  [`${orcaEditor}/pdf-orca-media-range-transport.test.ts`, ["plugins/notes/test/orca-pdf-range-transport.test.ts", "范围读适配"]],
  [`${orcaEditor}/pdf-scale-preference.test.ts`, ["plugins/notes/test/orca-pdf-scale-preference.test.ts", "本地缩放偏好适配"]],
  [`${orcaEditor}/image-viewer-zoom.test.ts`, ["plugins/notes/test/orca-pdf-zoom-wheel.test.ts", "滚轮缩放测试改用 Huhu 摘取模块"]],
  [`${orcaEditor}/pdf-view-position.test.ts`, ["plugins/notes/test/orca-pdf-view-position.test.ts", "本地查看位置适配"]],
]);

const ORCA_OMISSIONS = new Map([
  [`${orcaEditor}/PdfViewer.tsx`, "OP-D09 查看外壳由 Huhu PdfView.tsx 重写，待确认复制范围"],
  [`${orcaEditor}/PdfFind.tsx`, "OP-D09 查找外壳由 Huhu PdfView.tsx 重写，待确认复制范围"],
  [`${orcaEditor}/use-viewer-zoom-commands.ts`, "OP-D09 缩放由 Huhu 查看器本地键盘处理"],
  [`${orcaEditor}/viewer-zoom-request.ts`, "OP-D09 明确不复制，依赖 ORCA store"],
  [`${orcaEditor}/pdf-export-error-copy.ts`, "Huhu PDF 闭包不含导出"],
  ["src/main/browser/document-preview/doc-preview-protocol.ts", "R-45 仅参考协议，Huhu 自行实现"],
]);

function checkReplayCatalog(origin, ledger, objects = null) {
  if (ledger.upstreamCommit !== origin.pin) throw new Error(`清单固定点不一致：${origin.manifest}`);
  const rows = new Map(ledger.files.map((row) => [row.target, row.sha256]));
  if (rows.size !== ledger.files.length) throw new Error(`清单目标重复：${origin.manifest}`);
  const actual = new Map(filePaths(origin.root).map((path) => [path, sha(join(origin.root, path))]));
  const differences = listDifference(rows, actual);
  if (differences.length)
    throw new Error(`目录与来源清单不符：
${differences.join("\n")}`);
  for (const row of ledger.files) {
    if (row.upstream && objects && objects.get(row.upstream) !== row.blob) throw new Error(`固定来源不符：${row.upstream}`);
  }
}

function sourceCatalog(refresh) {
  const output = [];
  for (const origin of [OK, ORCA]) {
    const path = process.env[origin.env];
    if (!path) throw new Error(`需要 ${origin.env}=<固定上游 Git 工作副本>`);
    const objects = upstreamObjects(path, origin.pin);
    const ledger = JSON.parse(readFileSync(origin.manifest, "utf8"));
    checkReplayCatalog(origin, ledger, objects);
    const sources = new Map();
    for (const row of ledger.files) {
      if (!row.upstream) continue;
      const target = relative(ROOT, join(origin.root, row.target)).replaceAll("\\", "/");
      sources.set(row.upstream, {
        target,
        action: row.method,
        reason: row.description ?? "固定上游 Git blob 原样复制",
      });
    }
    if (origin === ORCA) {
      for (const [upstream, [target, reason]] of ORCA_RELATED) {
        if (!objects.has(upstream)) throw new Error(`ORCA 固定点缺少 ${upstream}`);
        const bytes = readFileSync(join(ROOT, target));
        const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
        sources.set(upstream, { target, action: blob === objects.get(upstream) ? "copy" : "patch", reason });
      }
    } else {
      const upstream = "packages/app/src/globals.css";
      const row = sources.get(upstream);
      if (!row) throw new Error("OK 台账必须保留 globals.css 的生成来源");
      sources.set(upstream, { ...row, derived: "packages/editor/src/ok/ok-globals.css", reason: `${row.reason}；P-WP6-01 生成隔离样式` });
      for (const file of filePaths(join(ROOT, "patches"))) {
        const target = `patches/${file}`;
        if (!objects.has(target)) continue;
        const bytes = readFileSync(join(ROOT, target));
        const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
        sources.set(target, { target, action: blob === objects.get(target) ? "copy" : "patch", reason: "R-51 pnpm patchedDependencies" });
      }
    }
    const archived = new Set(origin === OK ? man.files.map(({ upstream }) => upstream) : []);
    const files = [...objects].map(([upstream, blob]) => {
      const selected = sources.get(upstream);
      if (selected) return { upstream, blob, ...selected };
      const reason =
        origin === OK
          ? archived.has(upstream)
            ? "历史闭包后删去；按 PATCHES.md 的同路径登记复核"
            : "固定点文件未选入本地编辑闭包；测试适用性另见 vendor-test-catalog"
          : (ORCA_OMISSIONS.get(upstream) ?? "不属于 OP-D09 的 PDF 最小依赖闭包或 R-44 的构建资源");
      return { upstream, blob, target: null, action: "omit", reason };
    });
    output.push({ upstreamCommit: origin.pin, source: origin.env === "OK_SRC" ? "open-knowledge" : "orca", files });
    console.log(`${origin.env}：固定点 ${files.length} 个文件，${sources.size} 条目标映射`);
  }
  const bytes = gzipSync(output.map((origin) => JSON.stringify(origin)).join("\n") + "\n", { level: 9 });
  const file = join(ARCHIVE, "source-file-catalog.jsonl.gz");
  if (refresh) writeFileSync(file, bytes);
  else if (!gunzipSync(readFileSync(file)).equals(gunzipSync(bytes))) throw new Error("上游逐文件清单过期");
}

if (process.argv.includes("--refresh-catalog") || process.argv.includes("--check-catalog")) {
  sourceCatalog(process.argv.includes("--refresh-catalog"));
  process.exit(0);
}

if (process.argv.includes("--check-vendor-directories")) {
  for (const origin of [OK, ORCA]) checkReplayCatalog(origin, JSON.parse(readFileSync(origin.manifest, "utf8")));
  console.log("OK 与 ORCA 的目录和字节均有来源登记");
  process.exit(0);
}

if (process.argv.includes("--refresh-replay") || process.argv.includes("--replay")) {
  replayVendor(process.argv.includes("--orca") ? ORCA : OK, process.argv.includes("--refresh-replay"));
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
