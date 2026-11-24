import { legacyTextEncodings } from "../shared/text-encoding.js";
import { errors, isWorkbenchCaller } from "@huhu/contracts";
import type { Context } from "@huhu/cordis";
import type { CapabilityContext, HuhuApi } from "@huhu/kernel";
import { bindCapability, defineCapabilityDescriptor as descriptor, durableExternal } from "@huhu/kernel";
import { normalizeRelPath, OperationLog, protectedKindOf, resolveReadableAsset, versionOf } from "@huhu/vault";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CommentsService } from "./comments/service.js";
import { ArchivesService } from "./archives/service.js";
import { archiveCapabilityDescriptors, registerArchiveCapabilities } from "./archives/capabilities.js";
import { MAX_ATTACH_BYTES } from "../shared/attachments.js";
import { assertUnlinkedPath, ordinaryNotePath } from "./vault-path.js";
import { NotesService } from "./service.js";

export { NotesService } from "./service.js";
export { ArchivesService } from "./archives/service.js";
export { CommentsService } from "./comments/service.js";

const publicTool = { plugin: "notes", risk: "normal", exposable: true, defaultExposed: false } as const;
const Path = z.object({ path: z.string().min(1) });
const DraftOutcome = z.literal("unknown").optional();
const Draft = z.object({ path: z.string(), text: z.string(), baseVersion: z.string(), savedAt: z.string(), outcome: DraftOutcome });
const StoredDraft = Draft.extend({ recordId: z.string().optional() });
const VersionedPath = Path.extend({ expectedVersion: z.string().optional() });
const DraftView = Draft.extend({ version: z.string().optional() });
const HiddenPreferences = z.object({ hiddenPaths: z.array(z.string()), version: z.string().optional() });
const HiddenSetResult = z.union([HiddenPreferences, z.object({ version: z.string() })]);
const NoteRef = z.object({ path: z.string(), id: z.string().nullable(), title: z.string(), trashId: z.string().optional(), deletedAt: z.string().optional(), favorite: z.boolean().optional(), tags: z.array(z.string()).optional() });
const Moved = z.object({ moved: z.record(z.string(), z.string()), rewrittenFiles: z.array(z.string()), ambiguous: z.array(z.string()) });
const Filter = z.union([z.enum(["all", "favorites", "daily", "trash"]), z.object({ tag: z.string() })]);

const notesReadDescriptor = descriptor({
  name: "notes.read",
  ...publicTool,
  title: "读取笔记",
  description: "读取指定 Vault 相对路径的笔记，返回正文和文件版本。",
  scope: "read",
  input: Path,
  output: z.object({ path: z.string(), text: z.string(), version: z.string() }),
});

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

const noteTools = {
  read: notesReadDescriptor,
  list: descriptor({
    name: "notes.list",
    title: "列出笔记",
    description: "列出笔记。",
    ...publicTool,
    scope: "read",
    input: z.object({ filter: Filter.default("all") }),
    output: z.array(NoteRef),
  }),
  create: descriptor({
    name: "notes.create",
    title: "创建笔记",
    description: "创建笔记。",
    ...publicTool,
    scope: "write",
    input: z.object({ name: z.string(), folder: z.string().optional(), template: z.enum(["blank", "meeting", "project", "daily"]).optional(), templatePath: z.string().optional(), body: z.string().optional() }),
    output: z.object({ path: z.string(), id: z.string() }),
  }),
  templatesList: descriptor({
    name: "notes.templates.list",
    title: "列出模板",
    description: "列出模板。",
    ...publicTool,
    scope: "read",
    input: z.object({}),
    output: z.array(z.string()),
  }),
  templatesImport: descriptor({
    name: "notes.templates.import",
    title: "导入模板",
    description: "导入模板。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: VersionedPath,
    output: Path,
  }),
  textEncoding: descriptor({
    name: "notes.textEncoding",
    title: "探测文本编码",
    description: "探测文本编码。",
    ...publicTool,
    scope: "read",
    input: Path,
    output: z.object({ state: z.enum(["ok", "binary", "encoding"]), encodings: z.array(z.enum(legacyTextEncodings)), version: z.string() }),
  }),
  previewEncoding: descriptor({
    name: "notes.previewEncoding",
    title: "预览文本编码",
    description: "预览文本编码。",
    ...publicTool,
    scope: "read",
    risk: "high",
    input: Path.extend({ encoding: z.enum(legacyTextEncodings), expectedVersion: z.string() }),
    output: z.object({ text: z.string(), truncated: z.boolean() }),
  }),
  convertEncoding: descriptor({
    name: "notes.convertEncoding",
    title: "转换文本编码",
    description: "转换文本编码。",
    ...publicTool,
    scope: "write",
    risk: "high",
    ...durableExternal,
    input: Path.extend({ encoding: z.enum(legacyTextEncodings), expectedVersion: z.string() }),
    output: z.object({ version: z.string() }),
  }),
  save: descriptor({
    name: "notes.save",
    title: "保存笔记",
    description: "保存笔记。",
    ...publicTool,
    scope: "write",
    input: Path.extend({ text: z.string(), expectedVersion: z.string(), writeId: z.string().min(1).max(64).optional() }),
    output: z.object({ version: z.string() }),
  }),
  rename: descriptor({
    name: "notes.rename",
    title: "重命名笔记",
    description: "重命名笔记。",
    ...publicTool,
    scope: "write",
    input: Path.extend({ newName: z.string() }),
    output: Moved,
  }),
  move: descriptor({
    name: "notes.move",
    title: "移动笔记",
    description: "移动笔记。",
    ...publicTool,
    scope: "write",
    input: Path.extend({ targetDir: z.string() }),
    output: Moved,
  }),
  duplicate: descriptor({
    name: "notes.duplicate",
    title: "复制笔记",
    description: "复制笔记。",
    ...publicTool,
    scope: "write",
    input: Path,
    output: z.object({ path: z.string(), id: z.string(), paths: z.array(z.string()).optional() }),
  }),
  attach: descriptor({
    name: "notes.attach",
    title: "添加笔记附件",
    description: "添加笔记附件。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: z.object({
      notePath: z.string().optional(),
      expectedVersion: z.string().optional(),
      dir: z.string().optional(),
      name: z.string().min(1),
      dataBase64: z.string().max(Math.ceil((MAX_ATTACH_BYTES * 4) / 3) + 16),
    }),
    output: z.object({ path: z.string(), size: z.number(), deduped: z.boolean() }),
  }),
  trash: descriptor({
    name: "notes.trash",
    title: "移入笔记回收站",
    description: "移入笔记回收站。",
    ...publicTool,
    scope: "write",
    risk: "high",
    ...durableExternal,
    input: VersionedPath.extend({ noteId: z.string().nullable().optional() }),
    output: z.object({ trashId: z.string() }),
  }),
  restore: descriptor({
    name: "notes.restore",
    title: "恢复笔记",
    description: "恢复笔记。",
    ...publicTool,
    scope: "write",
    risk: "high",
    ...durableExternal,
    input: z.object({ trashId: z.string(), newName: z.string().optional() }),
    output: z.object({ path: z.string() }),
  }),
  deletePermanent: descriptor({
    name: "notes.deletePermanent",
    title: "永久删除笔记",
    description: "永久删除笔记。",
    ...publicTool,
    scope: "write",
    risk: "high",
    ...durableExternal,
    input: z.object({ trashId: z.string(), confirmed: z.boolean().optional() }),
    output: z.object({ ok: z.literal(true) }),
  }),
  hiddenGet: descriptor({
    name: "notes.hidden.get",
    title: "读取隐藏路径",
    description: "读取隐藏路径。",
    ...publicTool,
    scope: "read",
    input: z.object({}),
    output: HiddenPreferences,
  }),
  hiddenSet: descriptor({
    name: "notes.hidden.set",
    title: "更新隐藏路径",
    description: "更新隐藏路径。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: HiddenPreferences.omit({ version: true }).extend({ expectedVersion: z.string().optional() }),
    output: HiddenSetResult,
  }),
  setFavorite: descriptor({
    name: "notes.setFavorite",
    title: "设置笔记收藏",
    description: "设置笔记收藏。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: VersionedPath.extend({ favorite: z.boolean() }),
    output: z.object({ favorites: z.array(z.string()) }),
  }),
  backlinks: descriptor({
    name: "notes.backlinks",
    title: "查找反向链接",
    description: "查找反向链接。",
    ...publicTool,
    scope: "read",
    input: Path,
    output: z.array(z.object({ path: z.string(), title: z.string() })),
  }),
  openDaily: descriptor({
    name: "notes.openDaily",
    title: "打开每日笔记",
    description: "打开每日笔记。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: z.object({ date: z.iso.date().optional() }),
    output: z.object({ path: z.string(), created: z.boolean() }),
  }),
  folders: descriptor({
    name: "notes.folders",
    title: "列出笔记目录",
    description: "列出笔记目录。",
    ...publicTool,
    scope: "read",
    input: z.object({}),
    output: z.array(z.string()),
  }),
  tags: descriptor({
    name: "notes.tags",
    title: "列出笔记标签",
    description: "列出笔记标签。",
    ...publicTool,
    scope: "read",
    input: z.object({}),
    output: z.array(z.object({ tag: z.string(), count: z.number() })),
  }),
  foldersCreate: descriptor({
    name: "folders.create",
    title: "创建目录",
    description: "创建目录。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: Path,
    output: z.object({ ok: z.literal(true) }),
  }),
  commentsList: descriptor({
    name: "comments.list",
    title: "列出批注",
    description: "列出批注。",
    ...publicTool,
    scope: "read",
    input: z.object({ path: z.string().optional() }),
    output: z.array(CommentDto),
  }),
  commentsCreate: descriptor({
    name: "comments.create",
    title: "创建批注",
    description: "创建批注。",
    ...publicTool,
    scope: "write",
    input: z.object({
      path: z.string().min(1),
      target: z.enum(["body", "file", "property"]).default("body"),
      property: z.string().optional(),
      start: z.number().int().optional(),
      end: z.number().int().optional(),
      quote: z.string().optional(),
      prefix: z.string().optional(),
      suffix: z.string().optional(),
      expectedSourceVersion: z.string().optional(),
      text: z.string(),
    }),
    output: CommentDto,
  }),
  commentsReply: descriptor({
    name: "comments.reply",
    title: "回复批注",
    description: "回复批注。",
    ...publicTool,
    scope: "write",
    input: Cid.extend({ text: z.string() }),
    output: CommentDto,
  }),
  commentsResolve: descriptor({
    name: "comments.resolve",
    title: "解决批注",
    description: "解决批注。",
    ...publicTool,
    scope: "write",
    input: Cid,
    output: CommentDto,
  }),
  commentsReopen: descriptor({
    name: "comments.reopen",
    title: "重新打开批注",
    description: "重新打开批注。",
    ...publicTool,
    scope: "write",
    input: Cid,
    output: CommentDto,
  }),
  commentsRelocate: descriptor({
    name: "comments.relocate",
    title: "重定位批注",
    description: "重定位批注。",
    ...publicTool,
    scope: "write",
    input: Cid.extend({ start: z.number().int().optional(), end: z.number().int().optional(), quote: z.string().optional(), prefix: z.string().optional(), suffix: z.string().optional(), expectedSourceVersion: z.string().optional() }),
    output: CommentDto,
  }),
  commentsDelete: descriptor({
    name: "comments.delete",
    title: "删除批注",
    description: "删除批注。",
    ...publicTool,
    scope: "write",
    input: Cid,
    output: z.object({ ok: z.literal(true) }),
  }),
  draftGet: descriptor({
    name: "notes.draft.get",
    title: "读取草稿",
    description: "读取草稿。",
    ...publicTool,
    scope: "read",
    risk: "high",
    input: Path.extend({ withVersion: z.boolean().optional() }),
    output: DraftView.nullable(),
  }),
  draftSave: descriptor({
    name: "notes.draft.save",
    title: "保存草稿",
    description: "保存草稿。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: Path.extend({
      text: z.string().max(8 * 1024 * 1024),
      baseVersion: z.string(),
      expectedDraftVersion: z.string().nullable().optional(),
      outcome: DraftOutcome,
      withVersion: z.boolean().optional(),
    }),
    output: z.object({ ok: z.literal(true), version: z.string().optional() }),
  }),
  draftDiscard: descriptor({
    name: "notes.draft.discard",
    title: "丢弃草稿",
    description: "丢弃草稿。",
    ...publicTool,
    scope: "write",
    risk: "high",
    ...durableExternal,
    input: VersionedPath,
    output: z.object({ ok: z.literal(true) }),
  }),
};

export const notesCapabilityDescriptors = [...Object.values(noteTools), ...Object.values(archiveCapabilityDescriptors)];

export interface NotesOptions {
  zone?: () => string;
  now?: () => Date;
}

/** notes 插件入口：注册笔记与文件管理能力。 */
export function apply(_ctx: Context, api: HuhuApi, opts: NotesOptions = {}): NotesService {
  const { files } = api.vault;
  let pendingWrite: Promise<unknown> = Promise.resolve();
  const bind: typeof bindCapability = (descriptor, handler) =>
    bindCapability(
      descriptor,
      descriptor.scope === "write"
        ? (c, input) => {
            const writing = pendingWrite.then(() => {
              c.signal.throwIfAborted();
              return handler(c, input);
            });
            pendingWrite = writing.catch(() => undefined);
            return writing;
          }
        : handler,
    );
  const now = opts.now ?? (() => new Date());
  const workbench = (c: CapabilityContext) => isWorkbenchCaller(c.caller);
  const writePath = (c: CapabilityContext, rel: string) => (workbench(c) ? rel : ordinaryNotePath(files, rel));
  const checkVersion = (c: CapabilityContext, expected: string | null | undefined, actual: string | null) => {
    if (workbench(c) && expected === undefined) return;
    if (expected === undefined) throw errors.invalidInput("必须提供当前版本");
    if (actual !== expected) throw errors.versionConflict(actual ?? "");
  };
  const noteVersion = (rel: string) => {
    const current = files.currentVersion(rel);
    if (current === null) throw errors.notFound(rel);
    return current;
  };
  const readPath = (c: CapabilityContext, rel: string) => {
    if (!workbench(c)) resolveReadableAsset(files.root, rel);
    return rel;
  };
  const trashEntry = (c: CapabilityContext, trashId: string) => {
    const meta = api.vault.trash.list().find((entry) => entry.trashId === trashId);
    if (!workbench(c)) {
      if (!meta) throw errors.notFound("回收站条目不存在");
      writePath(c, meta.originalPath);
    }
    return meta;
  };
  const draftName = (rel: string) => `note-${createHash("sha1").update(rel).digest("hex").slice(0, 16)}.json`;
  const draftFile = (name: string) => path.join(api.vault.stateDir, "drafts", name);
  const draftFor = (c: CapabilityContext, rel: string) => {
    if (workbench(c)) return draftName(rel);
    const current = statSync(files.abs(rel), { bigint: true, throwIfNoEntry: false });
    if (!current?.isFile()) throw errors.notFound(rel);
    const note = svc.noteId(rel) ?? JSON.stringify([rel, String(current.dev), String(current.ino), String(current.birthtimeNs)]);
    return `tool-${createHash("sha256")
      .update(JSON.stringify([c.caller, c.subject, note]))
      .digest("hex")}.json`;
  };
  const readDraft = (rel: string, name = draftName(rel), relocated = false) => {
    let bytes: Buffer;
    try {
      bytes = readFileSync(draftFile(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const draft = StoredDraft.parse(JSON.parse(bytes.toString("utf8")));
    if (draft.path !== rel && !relocated) throw new Error("草稿路径与记录不一致");
    return { draft: { ...draft, path: rel }, version: versionOf(bytes) };
  };
  const svc = new NotesService({
    files: api.vault.files,
    stateDir: api.vault.stateDir,
    ops: new OperationLog(api.vault.files, path.join(api.vault.stateDir, "operations")),
    index: api.vault.index,
    trash: api.vault.trash,
    now: opts.now ?? (() => new Date()),
    zone: opts.zone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    draftMoveSteps: (from, to) => {
      let draft: z.infer<typeof StoredDraft> | undefined;
      try {
        draft = readDraft(from)?.draft;
      } catch {
        return [];
      }
      if (!draft) return [];
      if (existsSync(draftFile(draftName(to)))) throw errors.nameConflict(`目标路径已有草稿：${to}`);
      return [
        { action: "write", path: `.huhu/drafts/${draftName(to)}`, bytes: Buffer.from(JSON.stringify({ ...draft, path: to })) },
        { action: "delete", path: `.huhu/drafts/${draftName(from)}` },
      ];
    },
  });
  const comments = new CommentsService({
    repo: api.vault.repo,
    files: api.vault.files,
    ensureId: (rel) => svc.ensureId(rel),
    noteId: (rel) => svc.noteId(rel),
    publish: (t, p) => api.events.publish(t, p),
    now: opts.now ?? (() => new Date()),
  });
  const author = (caller: string) => (isWorkbenchCaller(caller) ? "我" : caller);
  const changed = (id: string | null, op: "created" | "updated" | "deleted") => api.events.publish("entity.changed", { kind: "note", id: id ?? "", op });

  api.defineCapability(bind(noteTools.list, (_c, i) => svc.list(i.filter)));
  api.defineCapability(bind(notesReadDescriptor, (c, i) => svc.read(readPath(c, i.path))));
  api.defineCapability(
    bind(noteTools.create, async (c, i) => {
      if (i.templatePath !== undefined && !isWorkbenchCaller(c.caller)) throw errors.permissionDenied("Vault 本地模板（仅工作台可用）");
      if (i.folder) writePath(c, i.folder);
      const r = await svc.create({
        name: i.name,
        ...(i.folder ? { folder: i.folder } : {}),
        ...(i.template ? { template: i.template } : {}),
        ...(i.templatePath !== undefined ? { templatePath: i.templatePath } : {}),
        ...(i.body !== undefined ? { body: i.body } : {}),
      });
      changed(r.id, "created");
      return r;
    }),
  );
  api.defineCapability(
    bind(noteTools.templatesList, (c) =>
      svc.templatePaths().filter((rel) => {
        if (workbench(c)) return true;
        try {
          ordinaryNotePath(files, rel);
          return statSync(resolveReadableAsset(files.root, rel)).isFile();
        } catch {
          return false;
        }
      }),
    ),
  );
  api.defineCapability(
    bind(noteTools.templatesImport, async (c, i) => {
      const rel = writePath(c, i.path);
      if (!workbench(c) && i.expectedVersion === undefined) throw errors.invalidInput("必须提供模板来源版本");
      const result = await svc.importTemplate(rel, i.expectedVersion, (destination) => writePath(c, destination));
      changed(null, "created");
      return result;
    }),
  );
  api.defineCapability(bind(noteTools.textEncoding, (c, i) => svc.inspectEncoding(readPath(c, i.path))));
  api.defineCapability(bind(noteTools.previewEncoding, (c, i) => svc.previewEncoding(readPath(c, i.path), i.encoding, i.expectedVersion)));
  api.defineCapability(
    bind(noteTools.convertEncoding, async (c, i) => {
      writePath(c, i.path);
      const result = await svc.convertEncoding(i.path, i.encoding, i.expectedVersion);
      changed(svc.noteId(i.path), "updated");
      return result;
    }),
  );
  api.defineCapability(
    bind(noteTools.save, async (c, i) => {
      writePath(c, i.path);
      const r = await svc.save(i.path, i.text, i.expectedVersion);
      api.service<{ saved(path: string, bytes: Uint8Array): void }>("versioningHistory")?.saved(i.path, Buffer.from(i.text));
      const source = r.previous.version === i.expectedVersion ? r.previous : undefined;
      await comments.refind(i.path, i.text, r.version, source).catch(() => undefined); // 批注重定位失败不应让保存失败
      // Watcher 会过滤本 Engine 的写入回声；其他工作台仍需接收已提交正文的路径通知。
      api.events.publish("vault.fileChanged", { path: normalizeRelPath(i.path), change: "modified", version: r.version, ...(workbench(c) && i.writeId && { writeId: i.writeId }) });
      changed(svc.noteId(i.path), "updated");
      return { version: r.version };
    }),
  );
  api.defineCapability(
    bind(noteTools.rename, async (c, i) => {
      writePath(c, i.path);
      const r = await svc.rename(i.path, i.newName);
      await comments.moveDocuments(r.moved);
      changed(null, "updated");
      return r;
    }),
  );
  api.defineCapability(
    bind(noteTools.move, async (c, i) => {
      writePath(c, i.path);
      if (i.targetDir) writePath(c, i.targetDir);
      const r = await svc.move(i.path, i.targetDir);
      await comments.moveDocuments(r.moved);
      changed(null, "updated");
      return r;
    }),
  );
  api.defineCapability(
    bind(noteTools.duplicate, async (c, i) => {
      writePath(c, i.path);
      const r = await svc.duplicate(i.path, workbench(c) ? undefined : (child) => writePath(c, child));
      changed(r.id || null, "created");
      return r;
    }),
  );
  api.defineCapability(
    bind(noteTools.attach, async (c, i) => {
      if (!workbench(c)) {
        if (!i.notePath || i.dir) throw errors.invalidInput("附件必须属于指定笔记");
        const notePath = writePath(c, i.notePath);
        checkVersion(c, i.expectedVersion, noteVersion(notePath));
        const parent = path.posix.dirname(notePath);
        writePath(c, parent === "." ? "attachments" : `${parent}/attachments`);
        if (!z.base64().safeParse(i.dataBase64).success) throw errors.invalidInput("附件须使用 Base64 编码");
      }
      const r = await svc.attach({ ...(i.notePath ? { notePath: i.notePath } : {}), ...(i.dir !== undefined ? { dir: i.dir } : {}), name: i.name, bytes: Buffer.from(i.dataBase64, "base64") });
      const dir = r.path.includes("/") ? r.path.slice(0, r.path.lastIndexOf("/")) : "";
      api.events.publish("vault.dirChanged", { path: dir });
      return r;
    }),
  );
  api.defineCapability(
    bind(noteTools.trash, async (c, i) => {
      const rel = writePath(c, i.path);
      if (!workbench(c) || i.expectedVersion !== undefined) checkVersion(c, i.expectedVersion, noteVersion(rel));
      const currentId = svc.noteId(rel);
      if (!workbench(c) && currentId !== (i.noteId ?? null)) throw errors.invalidInput("笔记 ID 与当前路径不符");
      const r = await svc.trash(rel, i.expectedVersion);
      changed(null, "deleted");
      return r;
    }),
  );
  api.defineCapability(
    bind(noteTools.restore, async (c, i) => {
      trashEntry(c, i.trashId);
      const p = await svc.restore(i.trashId, i.newName, (rel) => writePath(c, rel), (documents) => comments.trashProjection(documents, "restore"));
      changed(null, "created");
      return { path: p };
    }),
  );
  api.defineCapability(
    bind(noteTools.deletePermanent, async (c, i) => {
      if (!workbench(c) && !i.confirmed) throw errors.invalidInput("必须确认永久删除指定回收站条目");
      const meta = trashEntry(c, i.trashId);
      await svc.deletePermanent(i.trashId, (documents) => comments.trashProjection(documents, "purge"));
      if (meta) {
        changed(meta.noteId, "deleted");
      }
      return { ok: true as const };
    }),
  );
  api.defineCapability(bind(noteTools.hiddenGet, (c) => (workbench(c) ? { hiddenPaths: svc.hiddenPaths() } : svc.hiddenPreferences())));
  api.defineCapability(
    bind(noteTools.hiddenSet, async (c, i) => {
      if (!workbench(c)) {
        for (const rel of i.hiddenPaths) {
          if (protectedKindOf(normalizeRelPath(rel))) throw errors.permissionDenied(rel);
          resolveReadableAsset(files.root, rel);
        }
        checkVersion(c, i.expectedVersion, svc.hiddenPreferences().version);
      }
      const hiddenPaths = await svc.setHiddenPaths(i.hiddenPaths);
      changed(null, "updated");
      return workbench(c) && !c.parentOperationId ? { hiddenPaths } : { version: svc.hiddenPreferences().version };
    }),
  );
  api.defineCapability(
    bind(noteTools.setFavorite, async (c, i) => {
      const rel = writePath(c, i.path);
      if (!workbench(c) || i.expectedVersion !== undefined) checkVersion(c, i.expectedVersion, noteVersion(rel));
      const favorites = await svc.setFavorite(rel, i.favorite);
      changed(svc.noteId(rel), "updated");
      return { favorites };
    }),
  );
  api.defineCapability(bind(noteTools.backlinks, (_c, i) => svc.backlinks(i.path)));
  api.defineCapability(
    bind(noteTools.openDaily, async (c, i) => {
      if (!workbench(c) && i.date === undefined) throw errors.invalidInput("外部调用必须指定日报日期");
      const zone = opts.zone?.() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const date = i.date ?? new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format((opts.now ?? (() => new Date()))());
      writePath(c, `日记/${date} · 每日笔记.md`);
      const r = await svc.openDaily(date);
      if (r.created) changed(null, "created");
      return r;
    }),
  );
  api.defineCapability(bind(noteTools.folders, () => svc.folders()));
  api.defineCapability(bind(noteTools.tags, () => svc.tags()));
  api.defineCapability(
    bind(noteTools.foldersCreate, async (c, i) => {
      await svc.createFolder(writePath(c, i.path));
      changed(null, "created");
      return { ok: true as const };
    }),
  );
  api.defineCapability(bind(noteTools.commentsList, (_c, i) => comments.list(i.path)));
  api.defineCapability(
    bind(noteTools.commentsCreate, (c, i) =>
      comments.create({
        path: i.path,
        target: i.target,
        ...(i.property !== undefined ? { property: i.property } : {}),
        ...(i.start !== undefined ? { start: i.start } : {}),
        ...(i.end !== undefined ? { end: i.end } : {}),
        ...(i.quote !== undefined ? { quote: i.quote } : {}),
        ...(i.prefix !== undefined ? { prefix: i.prefix } : {}),
        ...(i.suffix !== undefined ? { suffix: i.suffix } : {}),
        expectedSourceVersion: i.expectedSourceVersion,
        text: i.text,
        author: author(c.caller),
      }),
    ),
  );
  api.defineCapability(bind(noteTools.commentsReply, (c, i) => comments.reply(i.id, i.text, author(c.caller))));
  api.defineCapability(bind(noteTools.commentsResolve, (_c, i) => comments.setResolved(i.id, true)));
  api.defineCapability(bind(noteTools.commentsReopen, (_c, i) => comments.setResolved(i.id, false)));
  api.defineCapability(bind(noteTools.commentsRelocate, (_c, i) => comments.relocate(i.id, { start: i.start, end: i.end, quote: i.quote, prefix: i.prefix, suffix: i.suffix, expectedSourceVersion: i.expectedSourceVersion })));
  api.defineCapability(bind(noteTools.commentsDelete, async (_c, i) => (await comments.delete(i.id), { ok: true as const })));
  // 手动保存模式下离开时保留的草稿：写在 .huhu/drafts/，不改动笔记文件（ACC-KN-04）
  api.defineCapability(
    bind(noteTools.draftGet, (c, i) => {
      const rel = writePath(c, i.path);
      const name = draftFor(c, rel);
      if (!workbench(c)) {
        noteVersion(rel);
        assertUnlinkedPath(files, `.huhu/drafts/${name}`);
      }
      const saved = readDraft(rel, name, !workbench(c));
      if (!saved) return null;
      const { recordId: _recordId, ...draft } = saved.draft;
      return workbench(c) && !i.withVersion ? draft : { ...draft, version: saved.version };
    }),
  );
  api.defineCapability(
    bind(noteTools.draftSave, async (c, i) => {
      files.assertWritable();
      const rel = writePath(c, i.path);
      const name = draftFor(c, rel);
      const data = Buffer.from(
        JSON.stringify({
          path: rel,
          text: i.text,
          baseVersion: i.baseVersion,
          savedAt: now().toISOString(),
          outcome: i.outcome,
          // 同一毫秒内内容也相同的两次保存仍是不同的恢复记录。
          ...(workbench(c) ? { recordId: randomUUID() } : {}),
        }),
      );
      if (workbench(c)) {
        const f = draftFile(name);
        mkdirSync(path.dirname(f), { recursive: true });
        writeFileSync(f, data);
      } else {
        checkVersion(c, i.baseVersion, noteVersion(rel));
        const destination = `.huhu/drafts/${name}`;
        assertUnlinkedPath(files, destination);
        const version = files.currentVersion(destination);
        checkVersion(c, i.expectedDraftVersion, version);
        await files.write(destination, data, { expectedVersion: version });
      }
      return { ok: true as const, ...(i.withVersion ? { version: versionOf(data) } : {}) };
    }),
  );
  api.defineCapability(
    bind(noteTools.draftDiscard, (c, i) => {
      const rel = writePath(c, i.path);
      const name = draftFor(c, rel);
      if (!workbench(c)) {
        files.assertWritable();
        noteVersion(rel);
        assertUnlinkedPath(files, `.huhu/drafts/${name}`);
      }
      if (!workbench(c) || i.expectedVersion !== undefined) {
        checkVersion(c, i.expectedVersion, readDraft(rel, name, !workbench(c))?.version ?? null);
      }
      rmSync(draftFile(name), { force: true });
      return { ok: true as const };
    }),
  );
  registerArchiveCapabilities(
    api,
    new ArchivesService({
      files: api.vault.files,
      ops: new OperationLog(api.vault.files, path.join(api.vault.stateDir, "operations")),
      index: api.vault.index,
      notes: svc,
      publish: (t, p) => api.events.publish(t, p),
      now,
    }),
    bind,
  );
  return svc;
}
