import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HuhuError, errors } from "@huhu/contracts";
import type { GitRunner } from "../git.js";
import { applyChoices, countConflicts, splitThreeWay, type Choice, type Segment } from "./diff3.js";
import { clearSession, loadSession, parseConflictNames, parseMergeTree, saveSession, type ConflictFile, type ConflictSession, type Stage } from "./session.js";

/** 文本冲突的体积上限（与历史记录的文本上限一致）；超过按整文件处理。 */
const MAX_TEXT_BYTES = 10 * 1024 * 1024;
const PREVIEW_CHARS = 4000;

export interface ConflictHooks {
  /** 覆盖用户内容之前（规格总则 8：必须可恢复）；给出将被改写的路径。 */
  beforeOverwrite?: (paths: string[]) => Promise<void> | void;
  /** 语义文件拼出结果后的校验（kind/frontmatter）；不合法时抛错并指明文件。 */
  validateResolved?: (path: string, text: string) => void;
}

export interface WholeSide { exists: boolean; mode?: string; size?: number; binary?: boolean; preview?: string }
export type ConflictFileView =
  | { path: string; kind: "blocks"; segments: (Segment & { index?: number })[] }
  | { path: string; kind: "whole"; reason: string; ours: WholeSide; theirs: WholeSide };

export interface ConflictListing {
  id: string; createdAt: string; localHead: string; remoteHead: string;
  files: { path: string; kind: "blocks" | "whole"; blocks: number; reason?: string }[];
}

export type Resolution = { path: string } & ({ blocks: Choice[] } | { whole: "ours" | "theirs" | "delete" });

type Analysis = { kind: "blocks"; segments: Segment[]; ours: Buffer; theirs: Buffer } | { kind: "whole"; reason: string };

const stale = () => new HuhuError("VERSION_CONFLICT", "冲突已过期（本地或远端又有变化），请重新同步", { details: { currentVersion: "" } });

function decodeText(b: Buffer): string | null {
  if (b.byteLength > MAX_TEXT_BYTES) return null;
  if (b.subarray(0, 8000).includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(b);
  } catch {
    return null;
  }
}

export class SyncConflicts {
  constructor(
    private readonly root: string,
    private readonly git: GitRunner,
    private readonly identity: { name: string; email: string },
    private readonly hooks: ConflictHooks = {},
  ) {}

  session(): ConflictSession | null {
    return loadSession(this.root);
  }

  cancel(): boolean {
    return clearSession(this.root);
  }

  /** 不碰工作区地预判合并：有冲突就记录会话并返回；无冲突返回 null；merge-tree 不可用（旧 git/无共同祖先等）返回 undefined。 */
  async detect(localHead: string, remoteRef: string): Promise<ConflictSession | null | undefined> {
    const r = await this.git.run(["merge-tree", "--write-tree", "-z", localHead, remoteRef], { okCodes: [1] }).catch(() => null);
    if (!r) return undefined;
    if (r.code === 0) return null;
    const { files } = parseMergeTree(r.stdout);
    if (files.length === 0) return undefined;
    const remoteHead = (await this.git.run(["rev-parse", "--verify", remoteRef])).stdout.trim();
    const s: ConflictSession = { id: `cf-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString(), localHead, remoteHead, remoteRef, files };
    saveSession(this.root, s);
    return s;
  }

  private blob(st: Stage | null): Promise<Buffer | null> {
    return st ? this.git.runBuffer(["cat-file", "blob", st.oid]) : Promise.resolve(null);
  }

  private async analyze(f: ConflictFile): Promise<Analysis> {
    if (!f.base || !f.ours || !f.theirs) return { kind: "whole", reason: !f.ours || !f.theirs ? "一方删除了该文件" : "双方各自新增了该文件" };
    if (f.base.mode !== f.ours.mode || f.ours.mode !== f.theirs.mode) return { kind: "whole", reason: "文件类型或权限发生了变化" };
    if (f.ours.mode !== "100644" && f.ours.mode !== "100755") return { kind: "whole", reason: "符号链接或子模块" };
    const [b, o, t] = await Promise.all([this.blob(f.base), this.blob(f.ours), this.blob(f.theirs)]) as [Buffer, Buffer, Buffer];
    const [bs, os_, ts] = [decodeText(b), decodeText(o), decodeText(t)];
    if (bs === null || os_ === null || ts === null) return { kind: "whole", reason: "二进制文件或体积过大" };
    const segments = splitThreeWay(bs, os_, ts);
    if (!segments) return { kind: "whole", reason: "文件改动过大，无法逐块比较" };
    return { kind: "blocks", segments, ours: o, theirs: t };
  }

  private need(): ConflictSession {
    const s = this.session();
    if (!s) throw errors.invalidInput("当前没有待解决的同步冲突");
    return s;
  }

  async list(): Promise<ConflictListing | null> {
    const s = this.session();
    if (!s) return null;
    const files: ConflictListing["files"] = [];
    for (const f of s.files) {
      const a = await this.analyze(f).catch(() => ({ kind: "whole", reason: "读取冲突内容失败（对象库缺失，请重新同步）" }) as Analysis);
      files.push(a.kind === "blocks" ? { path: f.path, kind: "blocks", blocks: countConflicts(a.segments) } : { path: f.path, kind: "whole", blocks: 0, reason: a.reason });
    }
    return { id: s.id, createdAt: s.createdAt, localHead: s.localHead, remoteHead: s.remoteHead, files };
  }

  private async side(st: Stage | null): Promise<WholeSide> {
    if (!st) return { exists: false };
    const b = await this.blob(st) as Buffer;
    const text = decodeText(b);
    return { exists: true, mode: st.mode, size: b.byteLength, binary: text === null, ...(text !== null && b.byteLength <= 1024 * 1024 ? { preview: text.slice(0, PREVIEW_CHARS) } : {}) };
  }

  async read(p: string): Promise<ConflictFileView> {
    const f = this.need().files.find((x) => x.path === p);
    if (!f) throw errors.invalidInput("该文件不在当前冲突中");
    const a = await this.analyze(f);
    if (a.kind === "whole") return { path: p, kind: "whole", reason: a.reason, ours: await this.side(f.ours), theirs: await this.side(f.theirs) };
    let n = 0;
    return { path: p, kind: "blocks", segments: a.segments.map((s) => (s.kind === "conflict" ? { ...s, index: n++ } : s)) };
  }

  /** 应用逐块选择并生成合并提交（不经过带冲突标记的工作区）。返回新提交 OID。 */
  async resolve(sessionId: string, resolutions: Resolution[]): Promise<string> {
    const s = this.need();
    if (s.id !== sessionId) throw stale();
    // 重验：本地分支没动、远端对象还在、重新预判的冲突文件集合与会话一致
    const head = await this.git.run(["rev-parse", "--verify", "HEAD"]).then((r) => r.stdout.trim(), () => "");
    if (head !== s.localHead) { clearSession(this.root); throw stale(); }
    const remoteOk = await this.git.run(["cat-file", "-e", `${s.remoteHead}^{commit}`]).then(() => true, () => false);
    if (!remoteOk) { clearSession(this.root); throw stale(); }
    const mt = await this.git.run(["merge-tree", "--write-tree", "--name-only", "-z", s.localHead, s.remoteHead], { okCodes: [1] }).catch(() => null);
    const now = mt && mt.code === 1 ? parseConflictNames(mt.stdout) : null;
    const want = s.files.map((f) => f.path).sort((a, b) => a.localeCompare(b));
    if (!mt || !now || now.length !== want.length || now.some((n, i) => n !== want[i])) { clearSession(this.root); throw stale(); }
    const mergedTree = mt.stdout.split("\0")[0] as string;

    // 输入必须恰好覆盖会话里的每个文件
    const byPath = new Map(resolutions.map((r) => [r.path, r]));
    if (byPath.size !== resolutions.length || resolutions.length !== s.files.length || s.files.some((f) => !byPath.has(f.path))) throw errors.invalidInput("必须为每个冲突文件给出解决方式，且不能包含其他文件");

    type Plan = { f: ConflictFile; action: { kind: "text"; text: string; mode: string } | { kind: "stage"; stage: Stage } | { kind: "remove" } };
    const plans: Plan[] = [];
    for (const f of s.files) {
      const r = byPath.get(f.path) as Resolution;
      const a = await this.analyze(f);
      if ("blocks" in r) {
        if (a.kind !== "blocks") throw errors.invalidInput(`${f.path} 只能整文件选择`);
        if (r.blocks.length !== countConflicts(a.segments)) throw errors.invalidInput(`${f.path} 的冲突块选择数量不对`);
        const text = applyChoices(a.segments, r.blocks);
        try { this.hooks.validateResolved?.(f.path, text); } catch (e) { throw errors.invalidInput(`${f.path} 解决后的内容不合法：${e instanceof Error ? e.message : String(e)}`); }
        plans.push({ f, action: { kind: "text", text, mode: (f.ours as Stage).mode } });
      } else {
        if (a.kind === "blocks") throw errors.invalidInput(`${f.path} 需要逐块选择`);
        const st = r.whole === "ours" ? f.ours : r.whole === "theirs" ? f.theirs : null;
        plans.push({ f, action: st ? { kind: "stage", stage: st } : { kind: "remove" } });
      }
    }

    await this.hooks.beforeOverwrite?.(s.files.map((f) => f.path));

    const dir = mkdtempSync(path.join(os.tmpdir(), "huhu-cf-"));
    const ident = { GIT_AUTHOR_NAME: this.identity.name, GIT_AUTHOR_EMAIL: this.identity.email, GIT_COMMITTER_NAME: this.identity.name, GIT_COMMITTER_EMAIL: this.identity.email };
    const env = { GIT_INDEX_FILE: path.join(dir, "index"), ...ident };
    let commit: string;
    try {
      await this.git.run(["read-tree", mergedTree], { env });
      for (const { f, action } of plans) {
        if (action.kind === "remove") await this.git.run(["update-index", "--force-remove", "--", f.path], { env });
        else if (action.kind === "stage") await this.git.run(["update-index", "--add", "--cacheinfo", `${action.stage.mode},${action.stage.oid},${f.path}`], { env });
        else {
          const oid = (await this.git.run(["hash-object", "-w", "--stdin"], { env, input: action.text })).stdout.trim();
          await this.git.run(["update-index", "--add", "--cacheinfo", `${action.mode},${oid},${f.path}`], { env });
        }
      }
      const tree = (await this.git.run(["write-tree"], { env })).stdout.trim();
      commit = (await this.git.run(["commit-tree", tree, "-p", s.localHead, "-p", s.remoteHead, "-m", "HUHU 同步：解决冲突"], { env })).stdout.trim();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    // 先让工作区与 index 前进到合并结果：git 会拒绝覆盖有未提交改动的文件或未跟踪的同名文件
    await this.git.run(["read-tree", "-m", "-u", s.localHead, commit]).catch((e: unknown) => {
      const m = e instanceof Error ? e.message : String(e);
      if (/overwritten|not uptodate|untracked|local changes|would lose/i.test(m)) throw new HuhuError("INVALID_INPUT", `无法应用解决结果：本地有未提交的改动会被覆盖，请先保存或处理这些文件（${m}）`, { retryable: false });
      throw e; // index.lock、超时等：保留原始错误（可重试）
    });
    try {
      await this.git.run(["update-ref", "-m", "huhu resolve conflicts", "HEAD", commit, s.localHead]);
    } catch (e) {
      const back = await this.git.run(["read-tree", "-m", "-u", commit, s.localHead]).then(() => null, (e2: unknown) => e2); // 回到解决前
      if (back) throw new HuhuError("INTERNAL", `提交解决结果失败且回退也失败，请检查 Git 页的状态后重新同步（${e instanceof Error ? e.message : String(e)}）`, { retryable: false });
      throw e;
    }
    clearSession(this.root);
    return commit;
  }
}
