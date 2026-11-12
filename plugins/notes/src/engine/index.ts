import { errors } from "@huhu/contracts";
import type { Context } from "@huhu/cordis";
import type { HuhuApi } from "@huhu/kernel";
import { defineCapability as def } from "@huhu/kernel";
import { OperationLog } from "@huhu/vault";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CommentsService } from "./comments/service.js";
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
export { CommentsService } from "./comments/service.js";

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
    ops: new OperationLog(api.vault.files, path.join(api.vault.stateDir, "operations")),
    index: api.vault.index,
    trash: api.vault.trash,
    now: opts.now ?? (() => new Date()),
    zone: opts.zone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  });
  api.defineCapability(
    def({
      name: "notes.files",
      plugin: "notes",
      scope: "read",
      exposable: true,
      defaultExposed: true,
      input: z.object({}),
      output: z.array(z.object({ path: z.string(), size: z.number(), mtimeMs: z.number() })),
      handler: () => svc.otherFiles(),
    }),
  );
  const comments = new CommentsService({
    repo: api.vault.repo,
    files: api.vault.files,
    ensureId: (rel) => svc.ensureId(rel),
    noteId: (rel) => svc.noteId(rel),
    publish: (t, p) => api.events.publish(t, p),
    now: opts.now ?? (() => new Date()),
  });
  const author = (caller: string) => (caller === "desktop" ? "我" : caller);
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
        await comments.refind(i.path, i.text, r.version).catch(() => undefined); // 批注重定位失败不应让保存失败
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
        await comments.moveDocuments(r.moved);
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
        await comments.moveDocuments(r.moved);
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
      handler: async (_c, i) => {
        const r = await svc.trash(i.path);
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
      handler: async (_c, i) => {
        const p = await svc.restore(i.trashId, i.newName);
        await comments.syncPath(p).catch(() => undefined);
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
      handler: async (_c, i) => {
        const meta = api.vault.trash.list().find((m) => m.trashId === i.trashId);
        await svc.deletePermanent(i.trashId);
        if (meta) await comments.deleteForDocument(meta.noteId, meta.originalPath).catch(() => undefined); // 永久删除笔记时一并删除它的批注
        return { ok: true as const };
      },
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
  const Cid = z.object({ id: z.string() });
  const Anchor = z.object({ exact: z.string(), prefix: z.string(), suffix: z.string(), start: z.number(), end: z.number(), sourceVersion: z.string() });
  const CommentDto = z.object({
    id: z.string(),
    path: z.string(),
    version: z.string(),
    documentId: z.string(),
    documentPath: z.string(),
    target: z.enum(["body", "file", "property"]),
    property: z.string().nullable(),
    anchor: Anchor.nullable(),
    state: z.enum(["anchored", "orphaned"]),
    resolved: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    messages: z.array(z.object({ at: z.string(), author: z.string(), text: z.string() })),
  });
  const cw = { plugin: "notes", scope: "write" as const, exposable: true, defaultExposed: false };
  api.defineCapability(
    def({ name: "comments.list", plugin: "notes", scope: "read", exposable: true, defaultExposed: true, input: z.object({ path: z.string().optional() }), output: z.array(CommentDto), handler: (_c, i) => comments.list(i.path) }),
  );
  api.defineCapability(
    def({
      name: "comments.create",
      ...cw,
      input: z.object({ path: z.string().min(1), target: z.enum(["body", "file", "property"]).default("body"), property: z.string().optional(), start: z.number().int().optional(), end: z.number().int().optional(), text: z.string() }),
      output: CommentDto,
      handler: (c, i) =>
        comments.create({
          path: i.path,
          target: i.target,
          ...(i.property !== undefined ? { property: i.property } : {}),
          ...(i.start !== undefined ? { start: i.start } : {}),
          ...(i.end !== undefined ? { end: i.end } : {}),
          text: i.text,
          author: author(c.caller),
        }),
    }),
  );
  api.defineCapability(def({ name: "comments.reply", ...cw, input: Cid.extend({ text: z.string() }), output: CommentDto, handler: (c, i) => comments.reply(i.id, i.text, author(c.caller)) }));
  api.defineCapability(def({ name: "comments.resolve", ...cw, input: Cid, output: CommentDto, handler: (_c, i) => comments.setResolved(i.id, true) }));
  api.defineCapability(def({ name: "comments.reopen", ...cw, input: Cid, output: CommentDto, handler: (_c, i) => comments.setResolved(i.id, false) }));
  api.defineCapability(def({ name: "comments.relocate", ...cw, input: Cid.extend({ start: z.number().int(), end: z.number().int() }), output: CommentDto, handler: (_c, i) => comments.relocate(i.id, i.start, i.end) }));
  api.defineCapability(def({ name: "comments.delete", ...cw, input: Cid, output: z.object({ ok: z.literal(true) }), handler: async (_c, i) => (await comments.delete(i.id), { ok: true as const }) }));
  // 手动保存模式下离开时保留的草稿：写在 .huhu/drafts/，不改动笔记文件（ACC-KN-04）
  const draftFile = (rel: string) => path.join(api.vault.stateDir, "drafts", `note-${createHash("sha1").update(rel).digest("hex").slice(0, 16)}.json`);
  const Draft = z.object({ path: z.string(), text: z.string(), baseVersion: z.string(), savedAt: z.string() });
  const dw = { plugin: "notes", scope: "write" as const, exposable: false, defaultExposed: false };
  api.defineCapability(
    def({
      name: "notes.draft.get",
      plugin: "notes",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: Path,
      output: Draft.nullable(),
      handler: (_c, i) => {
        const f = draftFile(i.path);
        if (!existsSync(f)) return null;
        try {
          const d = JSON.parse(readFileSync(f, "utf8")) as z.infer<typeof Draft>;
          return d.path === i.path ? d : null;
        } catch {
          return null;
        }
      },
    }),
  );
  api.defineCapability(
    def({
      name: "notes.draft.save",
      ...dw,
      input: Path.extend({ text: z.string().max(8 * 1024 * 1024), baseVersion: z.string() }),
      output: z.object({ ok: z.literal(true) }),
      handler: (_c, i) => {
        api.vault.files.assertWritable();
        const f = draftFile(i.path);
        mkdirSync(path.dirname(f), { recursive: true });
        writeFileSync(f, JSON.stringify({ path: i.path, text: i.text, baseVersion: i.baseVersion, savedAt: (opts.now ?? (() => new Date()))().toISOString() }));
        return { ok: true as const };
      },
    }),
  );
  api.defineCapability(def({ name: "notes.draft.discard", ...dw, input: Path, output: z.object({ ok: z.literal(true) }), handler: (_c, i) => (rmSync(draftFile(i.path), { force: true }), { ok: true as const }) }));
  return svc;
}
