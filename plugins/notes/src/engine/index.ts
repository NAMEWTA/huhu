import { errors } from "@huhu/contracts";
import type { Context } from "@huhu/cordis";
import type { HuhuApi } from "@huhu/kernel";
import { defineCapability as def } from "@huhu/kernel";
import { OperationLog } from "@huhu/vault";
import path from "node:path";
import { z } from "zod";
import { NotesService } from "./service.js";

/** 自动化规则（含 agent_prompt）是"会被调度器执行"的 Markdown：外部入口不得通过通用笔记写入口在 Automations/ 下创建、改写、复制或移出它们。 */
function assertNotAutomationsDir(caller: string, ...paths: (string | undefined)[]): void {
  if (caller === "desktop") return;
  for (const p of paths) {
    const first = (p ?? "")
      .replace(/\\/g, "/")
      .split("/")
      .filter((s) => s !== "" && s !== ".")[0]
      ?.toLowerCase(); // 与 normalizeRelPath 一致：忽略空段和 "." 段
    if (first === "automations") throw errors.permissionDenied("Automations 目录（仅桌面可写）");
  }
}

export { NotesService } from "./service.js";

const Path = z.object({ path: z.string().min(1) });
const NoteRef = z.object({ path: z.string(), id: z.string().nullable(), title: z.string(), trashId: z.string().optional(), deletedAt: z.string().optional(), favorite: z.boolean().optional(), tags: z.array(z.string()).optional() });
const Moved = z.object({ moved: z.record(z.string(), z.string()), rewrittenFiles: z.array(z.string()), ambiguous: z.array(z.string()) });
const Filter = z.union([z.enum(["all", "favorites", "daily", "trash"]), z.object({ tag: z.string() })]);

export interface NotesOptions {
  zone?: () => string;
  now?: () => Date;
}

/** notes 插件入口：注册笔记与文件管理能力。 */
export function apply(_ctx: Context, api: HuhuApi, opts: NotesOptions = {}): NotesService {
  const svc = new NotesService({
    files: api.vault.files,
    ops: new OperationLog(api.vault.files, path.join(api.vault.files.root, ".huhu", "operations")),
    index: api.vault.index,
    trash: api.vault.trash,
    now: opts.now ?? (() => new Date()),
    zone: opts.zone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  });
  const changed = (id: string | null, op: "created" | "updated" | "deleted") => api.events.publish("entity.changed", { kind: "note", id: id ?? "", op });

  api.defineCapability(
    def({ name: "notes.list", plugin: "notes", scope: "read", exposable: true, defaultExposed: true, input: z.object({ filter: Filter.default("all") }), output: z.array(NoteRef), handler: (_c, i) => svc.list(i.filter) }),
  );
  api.defineCapability(
    def({ name: "notes.read", plugin: "notes", scope: "read", exposable: true, defaultExposed: true, input: Path, output: z.object({ path: z.string(), text: z.string(), version: z.string() }), handler: (_c, i) => svc.read(i.path) }),
  );
  api.defineCapability(
    def({
      name: "notes.create",
      plugin: "notes",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: z.object({ name: z.string(), folder: z.string().optional(), template: z.enum(["blank", "meeting", "project", "daily"]).optional() }),
      output: z.object({ path: z.string(), id: z.string() }),
      handler: async (c, i) => {
        assertNotAutomationsDir(c.caller, i.folder);
        const r = await svc.create({ name: i.name, ...(i.folder ? { folder: i.folder } : {}), ...(i.template ? { template: i.template } : {}) });
        changed(r.id, "created");
        return r;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "notes.save",
      plugin: "notes",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: Path.extend({ text: z.string(), expectedVersion: z.string() }),
      output: z.object({ version: z.string() }),
      handler: async (c, i) => {
        assertNotAutomationsDir(c.caller, i.path);
        const r = await svc.save(i.path, i.text, i.expectedVersion);
        changed(svc.noteId(i.path), "updated");
        return r;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "notes.rename",
      plugin: "notes",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: Path.extend({ newName: z.string() }),
      output: Moved,
      handler: async (c, i) => {
        assertNotAutomationsDir(c.caller, i.path);
        const r = await svc.rename(i.path, i.newName);
        changed(null, "updated");
        return r;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "notes.move",
      plugin: "notes",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: Path.extend({ targetDir: z.string() }),
      output: Moved,
      handler: async (c, i) => {
        assertNotAutomationsDir(c.caller, i.path, i.targetDir);
        const r = await svc.move(i.path, i.targetDir);
        changed(null, "updated");
        return r;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "notes.duplicate",
      plugin: "notes",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: Path,
      output: z.object({ path: z.string(), id: z.string() }),
      handler: async (c, i) => {
        assertNotAutomationsDir(c.caller, i.path);
        const r = await svc.duplicate(i.path);
        changed(r.id, "created");
        return r;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "notes.trash",
      plugin: "notes",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: Path,
      output: z.object({ trashId: z.string() }),
      handler: (_c, i) => {
        const r = svc.trash(i.path);
        changed(null, "deleted");
        return r;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "notes.restore",
      plugin: "notes",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: z.object({ trashId: z.string(), newName: z.string().optional() }),
      output: z.object({ path: z.string() }),
      handler: (_c, i) => {
        const p = svc.restore(i.trashId, i.newName);
        changed(null, "created");
        return { path: p };
      },
    }),
  );
  api.defineCapability(
    def({
      name: "notes.deletePermanent",
      plugin: "notes",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: z.object({ trashId: z.string() }),
      output: z.object({ ok: z.literal(true) }),
      handler: (_c, i) => (svc.deletePermanent(i.trashId), { ok: true as const }),
    }),
  );
  api.defineCapability(
    def({
      name: "notes.setFavorite",
      plugin: "notes",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: Path.extend({ favorite: z.boolean() }),
      output: z.object({ favorites: z.array(z.string()) }),
      handler: async (_c, i) => ({ favorites: await svc.setFavorite(i.path, i.favorite) }),
    }),
  );
  api.defineCapability(
    def({ name: "notes.backlinks", plugin: "notes", scope: "read", exposable: true, defaultExposed: true, input: Path, output: z.array(z.object({ path: z.string(), title: z.string() })), handler: (_c, i) => svc.backlinks(i.path) }),
  );
  api.defineCapability(
    def({
      name: "notes.openDaily",
      plugin: "notes",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: z.object({ date: z.string().optional() }),
      output: z.object({ path: z.string(), created: z.boolean() }),
      handler: async (_c, i) => {
        const zone = opts.zone?.() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        const date = i.date ?? new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format((opts.now ?? (() => new Date()))());
        const r = await svc.openDaily(date);
        if (r.created) changed(null, "created");
        return r;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "notes.folders",
      plugin: "notes",
      scope: "read",
      exposable: true,
      defaultExposed: true,
      input: z.object({}),
      output: z.array(z.string()),
      handler: () => svc.folders(),
    }),
  );
  api.defineCapability(
    def({
      name: "notes.tags",
      plugin: "notes",
      scope: "read",
      exposable: true,
      defaultExposed: true,
      input: z.object({}),
      output: z.array(z.object({ tag: z.string(), count: z.number() })),
      handler: () => svc.tags(),
    }),
  );
  api.defineCapability(
    def({
      name: "folders.create",
      plugin: "notes",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: Path,
      output: z.object({ ok: z.literal(true) }),
      handler: async (_c, i) => (await svc.createFolder(i.path), { ok: true as const }),
    }),
  );
  return svc;
}
