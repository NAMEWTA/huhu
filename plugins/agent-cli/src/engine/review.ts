import { execFile } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

export interface DiffLine { kind: "ctx" | "add" | "del"; oldLine: number | null; newLine: number | null; text: string; noNewline?: boolean }
export interface Hunk { header: string; oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[] }
export interface ReviewFile {
  path: string;
  oldPath: string | null;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  binary: boolean;
  additions: number;
  deletions: number;
  /** 太大（单文件）或总量超限：只给统计，不给逐行内容。 */
  tooLarge: boolean;
  hunks: Hunk[];
}
export interface ReviewDiff { isRepo: boolean; hasHead: boolean; truncated: boolean; files: ReviewFile[] }

export const LIMITS = { files: 500, filePatchBytes: 256 * 1024, totalPatchBytes: 4 * 1024 * 1024 } as const;
const EMPTY_TREE_SHA1 = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const EMPTY_TREE_SHA256 = "6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321";

function git(root: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    // 仓库配置里的 diff.external / textconv / pager 可能执行任意程序：一律关掉；只读命令，不取可选锁
    execFile("git", ["--literal-pathspecs", "-C", root, "-c", "core.quotepath=false", "-c", "core.fsmonitor=false", ...args], { // 文件名里的 * ? [ 不是通配符（否则 a*b.txt 会连带别的文件）
      encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat", GIT_EXTERNAL_DIFF: "" },
    }, (err, stdout) => {
      const code = err ? (typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : 1) : 0;
      resolve({ code, stdout: stdout ?? "" });
    });
  });
}

/** 解析 unified diff（单个文件的 patch）为 hunk/行。 */
export function parsePatch(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  let cur: Hunk | null = null;
  let o = 0;
  let n = 0;
  for (const raw of patch.split("\n")) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(raw);
    if (m) {
      cur = { header: raw, oldStart: Number(m[1]), oldLines: m[2] === undefined ? 1 : Number(m[2]), newStart: Number(m[3]), newLines: m[4] === undefined ? 1 : Number(m[4]), lines: [] };
      hunks.push(cur);
      o = cur.oldStart; n = cur.newStart;
      continue;
    }
    if (!cur) continue; // hunk 之前的 diff --git / index / --- / +++ 头
    if (raw.startsWith("\\")) { const last = cur.lines[cur.lines.length - 1]; if (last) last.noNewline = true; continue; }
    const c = raw[0];
    if (c === "+") cur.lines.push({ kind: "add", oldLine: null, newLine: n++, text: raw.slice(1) });
    else if (c === "-") cur.lines.push({ kind: "del", oldLine: o++, newLine: null, text: raw.slice(1) });
    else if (c === " ") cur.lines.push({ kind: "ctx", oldLine: o++, newLine: n++, text: raw.slice(1) });
  }
  return hunks;
}

function untrackedFile(root: string, rel: string): ReviewFile {
  const base: ReviewFile = { path: rel, oldPath: null, status: "untracked", binary: false, additions: 0, deletions: 0, tooLarge: false, hunks: [] };
  try {
    const abs = path.join(root, rel);
    const st = lstatSync(abs);
    if (st.isSymbolicLink() || !st.isFile()) return { ...base, tooLarge: true }; // 不跟随符号链接，也不读特殊文件
    if (st.size > LIMITS.filePatchBytes) return { ...base, tooLarge: true };
    const buf = readFileSync(abs);
    if (buf.subarray(0, 8000).includes(0)) return { ...base, binary: true };
    const text = buf.toString("utf8");
    const lines = text.split("\n");
    const endsNl = text.endsWith("\n");
    if (endsNl) lines.pop();
    if (lines.length === 0) return base;
    const hunk: Hunk = { header: `@@ -0,0 +1,${lines.length} @@`, oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines: lines.map((t, i) => ({ kind: "add" as const, oldLine: null, newLine: i + 1, text: t, ...(i === lines.length - 1 && !endsNl ? { noNewline: true } : {}) })) };
    return { ...base, additions: lines.length, hunks: [hunk] };
  } catch {
    return { ...base, tooLarge: true };
  }
}

/** 工作树相对 HEAD 的变更（含未跟踪文件）。root 是 Space 根；不是 Git 仓库时 isRepo=false。 */
export async function reviewDiff(root: string): Promise<ReviewDiff> {
  const inside = await git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.code !== 0 || inside.stdout.trim() !== "true") return { isRepo: false, hasHead: false, truncated: false, files: [] };
  const hasHead = (await git(root, ["rev-parse", "--verify", "--quiet", "HEAD"])).code === 0;
  const sha256 = (await git(root, ["rev-parse", "--show-object-format"])).stdout.trim() === "sha256";
  const base = hasHead ? "HEAD" : sha256 ? EMPTY_TREE_SHA256 : EMPTY_TREE_SHA1; // 空仓库：与空树比较
  const common = ["diff", base, "--no-ext-diff", "--no-textconv", "--no-color", "--relative", "-M"];

  const st = await git(root, [...common, "--name-status", "-z"]);
  if (st.code !== 0) throw new Error("读取变更失败（git diff 出错）"); // 不能把失败当作“没有变更”
  const status = st.stdout.split("\0");
  const files = new Map<string, ReviewFile>();
  for (let i = 0; i < status.length - 1;) {
    const code = status[i++] as string;
    if (!code) continue;
    const kind = code[0];
    if (kind === "R" || kind === "C") {
      const from = status[i++] as string; const to = status[i++] as string;
      files.set(to, { path: to, oldPath: from, status: "renamed", binary: false, additions: 0, deletions: 0, tooLarge: false, hunks: [] });
    } else {
      const p = status[i++] as string;
      files.set(p, { path: p, oldPath: null, status: kind === "A" ? "added" : kind === "D" ? "deleted" : "modified", binary: false, additions: 0, deletions: 0, tooLarge: false, hunks: [] });
    }
  }
  // numstat -z：`adds\tdels\tpath\0`；重命名为 `adds\tdels\t\0old\0new\0`
  const num = (await git(root, [...common, "--numstat", "-z"])).stdout.split("\0");
  for (let i = 0; i < num.length - 1;) {
    const head = num[i++] as string;
    if (!head) continue;
    const t1 = head.indexOf("\t"); const t2 = head.indexOf("\t", t1 + 1); // 文件名里可能有 tab：只按前两个分隔
    const a = head.slice(0, t1); const d = head.slice(t1 + 1, t2); const p = head.slice(t2 + 1);
    let target = p;
    if (p === "") { i++; target = num[i++] as string; }
    const f = files.get(target);
    if (!f) continue;
    if (a === "-" || d === "-") f.binary = true; else { f.additions = Number(a); f.deletions = Number(d); }
  }

  const untracked = (await git(root, ["ls-files", "--others", "--exclude-standard", "-z"])).stdout.split("\0").filter(Boolean);
  // 先按上限截断再读未跟踪文件，避免成千上万个文件都被读进内存
  const roomForUntracked = Math.max(0, LIMITS.files - files.size);
  const untrackedNames = untracked.filter((u) => !files.has(u));
  const list = [...files.values(), ...untrackedNames.slice(0, roomForUntracked).map((u) => untrackedFile(root, u))];
  const dropped = untrackedNames.length > roomForUntracked;
  let total = 0;
  let truncated = false;
  const out: ReviewFile[] = [];
  for (const f of list.slice(0, LIMITS.files)) {
    if (f.status !== "untracked" && !f.binary && f.hunks.length === 0) {
      if (total >= LIMITS.totalPatchBytes) { f.tooLarge = true; truncated = true; }
      else {
        const patch = (await git(root, [...common, "-U3", "--", f.path])).stdout;
        if (patch.length > LIMITS.filePatchBytes) f.tooLarge = true;
        else { total += patch.length; f.hunks = parsePatch(patch); }
      }
    } else if (f.status === "untracked") {
      const size = f.hunks.reduce((n, h) => n + h.lines.reduce((m, l) => m + l.text.length, 0), 0);
      if (total + size > LIMITS.totalPatchBytes) { out.push({ ...f, hunks: [], tooLarge: true }); truncated = true; continue; }
      total += size;
    }
    out.push(f);
  }
  if (list.length > LIMITS.files || dropped) truncated = true;
  return { isRepo: true, hasHead, truncated, files: out.sort((a, b) => a.path.localeCompare(b.path)) };
}
