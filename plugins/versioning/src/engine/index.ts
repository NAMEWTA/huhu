import path from "node:path";
import { patchFrontmatter } from "@huhu/vault";
import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { FileHistory, type HistoryEntry } from "./history.js";

export { FileHistory } from "./history.js";
export { GitRunner } from "./git.js";

const Entry = z.object({ id: z.string(), at: z.string(), source: z.string(), title: z.string().nullable(), path: z.string(), size: z.number() });
const Path = z.object({ path: z.string().min(1) });
const DEBOUNCE_MS = 2000;

export interface VersioningOptions {
  debounceMs?: number;
  /** 恢复任务文件后通知 automations：该输入不应被重复处理。 */
  holdRestoredInput?: (taskId: string, inputHash: string) => void;
}

/** 恢复后对语义文件的保护：自动化规则恢复后一律暂停，避免旧版本里的 enabled: true 立即重新生效。 */
export function guardRestoredContent(rel: string, text: string): string {
  if (rel.startsWith("Automations/")) return patchFrontmatter(text, { enabled: false });
  return text;
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
      const entry = (await history.timeline(i.path)).find((e) => e.id === i.entryId);
      const r = await history.restore(i.path, i.entryId, i.expectedCurrentVersion, {
        transform: (text) => guardRestoredContent(i.path, text),
        afterWrite: (text) => {
          // 任务文件：恢复后的输入不应触发自动化重复处理
          if (i.path.startsWith("Tasks/")) {
            const id = /--(task-[0-9a-z]+)\.md$/.exec(path.basename(i.path))?.[1];
            if (id && opts.holdRestoredInput) {
              const dto = api.service<{ read(id: string): { inputHash: string } }>("taskQuery");
              if (dto) opts.holdRestoredInput(id, dto.read(id).inputHash);
            }
          }
          void text;
        },
      });
      void entry;
      return { restored: r.restored !== null || r.checkpoint !== null };
    },
  }));
  return { history };
}
