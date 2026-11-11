import path from "node:path";
import { normalizeRelPath, parseFrontmatter, patchFrontmatter } from "@huhu/vault";
import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { AutoSync } from "./auto-sync.js";
import { FileHistory, type HistoryEntry } from "./history.js";
import { VaultGit } from "./repo.js";
import { VaultSync } from "./sync.js";

export { FileHistory } from "./history.js";
export { GitRunner } from "./git.js";
export { VaultGit } from "./repo.js";

const Entry = z.object({ id: z.string(), at: z.string(), source: z.string(), title: z.string().nullable(), path: z.string(), size: z.number() });
const Path = z.object({ path: z.string().min(1) });
const DEBOUNCE_MS = 2000;

export interface VersioningOptions {
  debounceMs?: number;
  /** 恢复任务文件后通知 automations：该输入不应被重复处理（缺省时从 `automations` 服务取）。 */
  holdRestoredInput?: (taskId: string, inputHash: string) => void;
}

/**
 * 恢复后对语义文件的保护：
 * - 自动化规则恢复后一律暂停（旧版本里的 enabled: true 不能立刻重新生效）；
 * - 任务文件恢复输入内容，但完成状态保持当前值（ACC-VS-03：completed 仍为 true）。
 */
export function guardRestoredContent(relInput: string, restored: string, current = ""): string {
  const rel = normalizeRelPath(relInput); // 与 restore 内部一致：忽略 "./"、重复斜杠
  // 大小写不敏感的文件系统上 automations/ 与 Automations/ 是同一目录
  if (rel.toLowerCase().startsWith("automations/")) return patchFrontmatter(restored, { enabled: false });
  if (rel.startsWith("Tasks/") && current) {
    const cur = parseFrontmatter(current).data;
    return patchFrontmatter(restored, { completed: cur["completed"] ?? false, completedAt: cur["completedAt"] ?? null });
  }
  return restored;
}

export function apply(ctx: Context, api: HuhuApi, opts: VersioningOptions = {}): { history: FileHistory } {
  const files = api.vault.files;
  const history = new FileHistory(files);
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  // HUHU 自己的写入与外部修改都会触发 entity/vault 事件；统一在去抖后记录
  const schedule = (rel: string, source: "edit" | "external") => {
    if (!history.recordable(rel)) return;
    clearTimeout(pending.get(rel));
    pending.set(
      rel,
      setTimeout(() => {
        pending.delete(rel);
        void history.record(rel, source).catch(() => undefined);
      }, opts.debounceMs ?? DEBOUNCE_MS),
    );
  };
  api.events.subscribe((e) => {
    if (e.type === "vault.fileChanged") {
      const p = e.payload as { path: string; change: string };
      if (p.change !== "deleted") schedule(p.path, "external");
    }
  });
  ctx.effect(() => () => {
    for (const t of pending.values()) clearTimeout(t);
    pending.clear();
  });

  api.defineCapability(def({ name: "history.timeline", plugin: "versioning", scope: "read", exposable: true, defaultExposed: true, input: Path, output: z.array(Entry), handler: (_c, i) => history.timeline(i.path) }));
  api.defineCapability(
    def({
      name: "history.read",
      plugin: "versioning",
      scope: "read",
      exposable: true,
      defaultExposed: false,
      input: Path.extend({ entryId: z.string() }),
      output: z.object({ text: z.string() }),
      handler: async (_c, i) => ({ text: await history.read({ id: i.entryId, path: i.path }) }),
    }),
  );
  api.defineCapability(
    def({
      name: "history.checkpoint",
      plugin: "versioning",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: Path.extend({ title: z.string().min(1).max(80) }),
      output: Entry.nullable(),
      handler: async (_c, i) => (await history.record(i.path, "checkpoint", i.title)) satisfies HistoryEntry | null,
    }),
  );
  api.defineCapability(
    def({
      name: "history.restore",
      plugin: "versioning",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: Path.extend({ entryId: z.string(), expectedCurrentVersion: z.string() }),
      output: z.object({ restored: z.boolean() }),
      handler: async (_c, i) => {
        const r = await history.restore(i.path, i.entryId, i.expectedCurrentVersion, {
          transform: (restored, current) => guardRestoredContent(i.path, restored, current),
          afterWrite: () => {
            // 任务文件：恢复后的输入不应触发自动化重复处理（restore 之后读取新的 inputHash）
            const id = normalizeRelPath(i.path).startsWith("Tasks/") ? /--(task-[0-9a-z]+)\.md$/.exec(path.basename(i.path))?.[1] : undefined;
            if (!id) return;
            const hold = opts.holdRestoredInput ?? api.service<{ holdRestoredInput(taskId: string, inputHash: string): void }>("automations")?.holdRestoredInput;
            const q = api.service<{ snapshot(taskId: string): { inputHash: string } }>("taskQuery");
            if (hold && q) hold(id, q.snapshot(id).inputHash);
          },
        });
        return { restored: r.restored !== null || r.checkpoint !== null };
      },
    }),
  );

  const git = new VaultGit(files.root);
  const Commit = z.object({ id: z.string(), short: z.string(), author: z.string(), at: z.string(), subject: z.string() });
  const Status = z.object({ branch: z.string().nullable(), files: z.array(z.object({ path: z.string(), index: z.string(), worktree: z.string(), from: z.string().optional() })) });
  api.defineCapability(
    def({
      name: "git.status",
      plugin: "versioning",
      scope: "read",
      exposable: true,
      defaultExposed: true,
      input: z.object({}),
      output: Status.extend({ isRepo: z.boolean() }),
      handler: async () => (git.isRepo() ? { isRepo: true, ...(await git.status()) } : { isRepo: false, branch: null, files: [] }),
    }),
  );
  api.defineCapability(
    def({ name: "git.init", plugin: "versioning", scope: "write", exposable: false, defaultExposed: false, input: z.object({}), output: z.object({ created: z.boolean(), gitignore: z.string() }), handler: () => git.init() }),
  );
  api.defineCapability(
    def({
      name: "git.log",
      plugin: "versioning",
      scope: "read",
      exposable: true,
      defaultExposed: true,
      input: z.object({ limit: z.number().int().min(1).max(500).default(50) }),
      output: z.array(Commit),
      handler: (_c, i) => git.log(i.limit),
    }),
  );
  api.defineCapability(
    def({
      name: "git.diff",
      plugin: "versioning",
      scope: "read",
      exposable: true,
      defaultExposed: true,
      input: z.object({ path: z.string().optional(), staged: z.boolean().optional(), commit: z.string().optional() }),
      output: z.object({ diff: z.string() }),
      handler: async (_c, i) => ({ diff: await git.diff({ ...(i.path ? { path: i.path } : {}), ...(i.staged ? { staged: true } : {}), ...(i.commit ? { commit: i.commit } : {}) }) }),
    }),
  );
  api.defineCapability(
    def({
      name: "git.stage",
      plugin: "versioning",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: z.object({ paths: z.array(z.string()).min(1) }),
      output: z.object({ ok: z.literal(true) }),
      handler: async (_c, i) => (await git.stage(i.paths), { ok: true as const }),
    }),
  );
  api.defineCapability(
    def({
      name: "git.unstage",
      plugin: "versioning",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: z.object({ paths: z.array(z.string()).min(1) }),
      output: z.object({ ok: z.literal(true) }),
      handler: async (_c, i) => (await git.unstage(i.paths), { ok: true as const }),
    }),
  );
  api.defineCapability(def({ name: "git.commit", plugin: "versioning", scope: "write", exposable: false, defaultExposed: false, input: z.object({ message: z.string() }), output: Commit, handler: (_c, i) => git.commit(i.message) }));
  const sync = new VaultSync(
    files.root,
    undefined,
    {
      // 覆盖前给每个冲突文件留一个可恢复的检查点（规格总则 8）
      // 失败则中止解决，此时还没有覆盖任何文件
      beforeOverwrite: async (paths) => {
        for (const p of paths) await history.record(p, "checkpoint", "解决冲突前");
      },
      // 带 frontmatter 的文件，解决后必须仍能解析（语义文件的 kind 校验由各插件在读取时再次把关）
      validateResolved: (_p, text) => {
        if (text.startsWith("---")) parseFrontmatter(text);
      },
    },
    (ref) => {
      // 秘密只经 SecretUse 取得，且仅限被允许引用的模块（versioning）
      const su = api.service<{ resolve(ref: string, c: { plugin: string; purpose: string }): string }>("secretUse");
      if (!su) throw Object.assign(new Error("保险箱插件未启用"), { code: "SECRET_REF_INVALID" });
      return su.resolve(ref, { plugin: "versioning", purpose: "sync" });
    },
  );
  let publishStatus = () => {};
  // 自动同步：按模式与间隔定时拉取/推送；认证失败或冲突后暂停，插件停用即停止
  const auto = new AutoSync({
    config: () => sync.config(),
    run: (m) => sync.run(m),
    hasConflict: () => sync.status().name === "conflict",
    schedule: (fn, ms) => {
      const t = setTimeout(fn, ms);
      t.unref();
      return () => clearTimeout(t);
    },
    onChange: () => publishStatus(),
  });
  publishStatus = () => {
    const st = sync.status();
    const paused = auto.state().pausedReason;
    api.events.publish("sync.statusChanged", { status: st.name, ahead: 0, behind: 0, conflicts: st.name === "conflict" ? st.detail.split("、").filter(Boolean).length : 0, ...(paused ? { pausedReason: paused } : {}) });
  };
  ctx.effect(() => () => auto.stop());
  // 保险箱解锁：因为锁定/凭据不可用而暂停的自动同步自动恢复（真正的认证失败会在下一拍再次暂停）
  api.events.subscribe((e) => {
    if (e.type === "safe.unlocked" && auto.state().pausedReason === "auth-failed") auto.restart();
  });
  const Cfg = z.object({
    remote: z.string(),
    branch: z.string(),
    mode: z.enum(["off", "follow", "full"]),
    pullIntervalSec: z.number().int(),
    pushIntervalSec: z.number().int(),
    credential: z.string(),
    credentialUser: z.string(),
    exclude: z.array(z.string()),
  });
  api.defineCapability(def({ name: "sync.get", plugin: "versioning", scope: "read", exposable: false, defaultExposed: false, input: z.object({}), output: Cfg, handler: () => sync.config() }));
  api.defineCapability(
    def({
      name: "sync.update",
      plugin: "versioning",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: Cfg.partial(),
      output: Cfg,
      handler: (_c, i) => {
        const next = sync.update(i as never);
        auto.restart();
        return next;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "sync.preview",
      plugin: "versioning",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      timeoutMs: 120_000,
      input: z.object({}),
      output: z.object({ push: z.array(z.string()), skipped: z.array(z.object({ path: z.string(), reason: z.string() })), pull: z.array(z.string()), ahead: z.number(), behind: z.number() }),
      handler: () => sync.preview(),
    }),
  );
  api.defineCapability(
    def({
      name: "sync.run",
      plugin: "versioning",
      scope: "execute",
      exposable: false,
      defaultExposed: false,
      timeoutMs: 10 * 60_000,
      input: z.object({ mode: z.enum(["pull", "push", "sync"]).default("sync") }),
      output: z.object({ pulled: z.boolean(), pushed: z.boolean(), committed: z.boolean() }),
      handler: async (_c, i) => {
        try {
          const r = await sync.run(i.mode);
          auto.restart(); // 手动同步成功：清除暂停与退避
          return r;
        } catch (e) {
          auto.noteManualFailure(e);
          throw e;
        } finally {
          publishStatus(); // 成功、冲突、离线、认证失败都发布真实状态
        }
      },
    }),
  );
  const Side = z.object({ exists: z.boolean(), mode: z.string().optional(), size: z.number().optional(), binary: z.boolean().optional(), preview: z.string().optional() });
  const Seg = z.union([z.object({ kind: z.literal("common"), text: z.string() }), z.object({ kind: z.literal("conflict"), index: z.number(), base: z.string(), ours: z.string(), theirs: z.string() })]);
  const Choice = z.union([z.enum(["ours", "theirs", "both"]), z.object({ custom: z.string().max(10 * 1024 * 1024) })]);
  api.defineCapability(
    def({
      name: "conflicts.list",
      plugin: "versioning",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.object({}),
      output: z.object({
        conflict: z
          .object({
            id: z.string(),
            createdAt: z.string(),
            localHead: z.string(),
            remoteHead: z.string(),
            files: z.array(z.object({ path: z.string(), kind: z.enum(["blocks", "whole"]), blocks: z.number(), reason: z.string().optional() })),
          })
          .nullable(),
      }),
      handler: async () => ({ conflict: await sync.conflicts() }),
    }),
  );
  api.defineCapability(
    def({
      name: "conflicts.read",
      plugin: "versioning",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: Path,
      output: z.union([z.object({ path: z.string(), kind: z.literal("blocks"), segments: z.array(Seg) }), z.object({ path: z.string(), kind: z.literal("whole"), reason: z.string(), ours: Side, theirs: Side })]),
      handler: (_c, i) => sync.conflictFile(i.path) as never,
    }),
  );
  api.defineCapability(
    def({
      name: "conflicts.resolve",
      plugin: "versioning",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      timeoutMs: 10 * 60_000,
      input: z.object({ sessionId: z.string(), resolutions: z.array(z.union([z.object({ path: z.string(), blocks: z.array(Choice) }), z.object({ path: z.string(), whole: z.enum(["ours", "theirs", "delete"]) })])).min(1) }),
      output: z.object({ commit: z.string(), pushed: z.boolean(), syncError: z.string().optional() }),
      handler: async (_c, i) => {
        try {
          const r = await sync.resolveConflicts(i.sessionId, i.resolutions as never);
          auto.restart();
          return r;
        } finally {
          publishStatus();
        }
      },
    }),
  );
  api.defineCapability(
    def({
      name: "conflicts.cancel",
      plugin: "versioning",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: z.object({}),
      output: z.object({ cancelled: z.boolean() }),
      handler: async () => {
        const r = await sync.cancelConflicts();
        auto.restart();
        publishStatus();
        return r;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "sync.status",
      plugin: "versioning",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.object({}),
      output: z.object({ name: z.string(), detail: z.string(), pausedReason: z.enum(["conflict", "auth-failed"]).nullable() }),
      handler: () => ({ ...sync.status(), pausedReason: auto.state().pausedReason }),
    }),
  );
  auto.restart(); // 启动时按已保存的模式与间隔排程
  return { history };
}
