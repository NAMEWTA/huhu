import path from "node:path";
import { parseFrontmatter, patchFrontmatter } from "@huhu/vault";
import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { FileHistory, type HistoryEntry } from "./history.js";
import { VaultGit } from "./repo.js";

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
export function guardRestoredContent(rel: string, restored: string, current = ""): string {
  if (rel.startsWith("Automations/")) return patchFrontmatter(restored, { enabled: false });
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
    pending.set(rel, setTimeout(() => { pending.delete(rel); void history.record(rel, source).catch(() => undefined); }, opts.debounceMs ?? DEBOUNCE_MS));
  };
  api.events.subscribe((e) => {
    if (e.type === "vault.fileChanged") {
      const p = e.payload as { path: string; change: string };
      if (p.change !== "deleted") schedule(p.path, "external");
    }
  });
  ctx.effect(() => () => { for (const t of pending.values()) clearTimeout(t); pending.clear(); });

  api.defineCapability(def({ name: "history.timeline", plugin: "versioning", scope: "read", exposable: true, defaultExposed: true, input: Path, output: z.array(Entry), handler: (_c, i) => history.timeline(i.path) }));
  api.defineCapability(def({
    name: "history.read", plugin: "versioning", scope: "read", exposable: true, defaultExposed: false,
    input: Path.extend({ entryId: z.string() }), output: z.object({ text: z.string() }),
    handler: async (_c, i) => ({ text: await history.read({ id: i.entryId, path: i.path }) }),
  }));
  api.defineCapability(def({
    name: "history.checkpoint", plugin: "versioning", scope: "write", exposable: false, defaultExposed: false,
    input: Path.extend({ title: z.string().min(1).max(80) }), output: Entry.nullable(),
    handler: async (_c, i) => (await history.record(i.path, "checkpoint", i.title)) satisfies HistoryEntry | null,
  }));
  api.defineCapability(def({
    name: "history.restore", plugin: "versioning", scope: "write", exposable: false, defaultExposed: false,
    input: Path.extend({ entryId: z.string(), expectedCurrentVersion: z.string() }), output: z.object({ restored: z.boolean() }),
    handler: async (_c, i) => {
      const r = await history.restore(i.path, i.entryId, i.expectedCurrentVersion, {
        transform: (restored, current) => guardRestoredContent(i.path, restored, current),
        afterWrite: () => {
          // 任务文件：恢复后的输入不应触发自动化重复处理（restore 之后读取新的 inputHash）
          const id = i.path.startsWith("Tasks/") ? /--(task-[0-9a-z]+)\.md$/.exec(path.basename(i.path))?.[1] : undefined;
          if (!id) return;
          const hold = opts.holdRestoredInput ?? api.service<{ holdRestoredInput(taskId: string, inputHash: string): void }>("automations")?.holdRestoredInput;
          const q = api.service<{ snapshot(taskId: string): { inputHash: string } }>("taskQuery");
          if (hold && q) hold(id, q.snapshot(id).inputHash);
        },
      });
      return { restored: r.restored !== null || r.checkpoint !== null };
    },
  }));

  const git = new VaultGit(files.root);
  const Commit = z.object({ id: z.string(), short: z.string(), author: z.string(), at: z.string(), subject: z.string() });
  const Status = z.object({ branch: z.string().nullable(), files: z.array(z.object({ path: z.string(), index: z.string(), worktree: z.string(), from: z.string().optional() })) });
  api.defineCapability(def({ name: "git.status", plugin: "versioning", scope: "read", exposable: true, defaultExposed: true, input: z.object({}), output: Status.extend({ isRepo: z.boolean() }), handler: async () => (git.isRepo() ? { isRepo: true, ...(await git.status()) } : { isRepo: false, branch: null, files: [] }) }));
  api.defineCapability(def({ name: "git.init", plugin: "versioning", scope: "write", exposable: false, defaultExposed: false, input: z.object({}), output: z.object({ created: z.boolean(), gitignore: z.string() }), handler: () => git.init() }));
  api.defineCapability(def({ name: "git.log", plugin: "versioning", scope: "read", exposable: true, defaultExposed: true, input: z.object({ limit: z.number().int().min(1).max(500).default(50) }), output: z.array(Commit), handler: (_c, i) => git.log(i.limit) }));
  api.defineCapability(def({ name: "git.diff", plugin: "versioning", scope: "read", exposable: true, defaultExposed: true, input: z.object({ path: z.string().optional(), staged: z.boolean().optional(), commit: z.string().optional() }), output: z.object({ diff: z.string() }), handler: async (_c, i) => ({ diff: await git.diff({ ...(i.path ? { path: i.path } : {}), ...(i.staged ? { staged: true } : {}), ...(i.commit ? { commit: i.commit } : {}) }) }) }));
  api.defineCapability(def({ name: "git.stage", plugin: "versioning", scope: "write", exposable: false, defaultExposed: false, input: z.object({ paths: z.array(z.string()).min(1) }), output: z.object({ ok: z.literal(true) }), handler: async (_c, i) => (await git.stage(i.paths), { ok: true as const }) }));
  api.defineCapability(def({ name: "git.unstage", plugin: "versioning", scope: "write", exposable: false, defaultExposed: false, input: z.object({ paths: z.array(z.string()).min(1) }), output: z.object({ ok: z.literal(true) }), handler: async (_c, i) => (await git.unstage(i.paths), { ok: true as const }) }));
  api.defineCapability(def({ name: "git.commit", plugin: "versioning", scope: "write", exposable: false, defaultExposed: false, input: z.object({ message: z.string() }), output: Commit, handler: (_c, i) => git.commit(i.message) }));
  return { history };
}
