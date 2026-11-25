import { randomUUID } from "node:crypto";
import { errors } from "@huhu/contracts";
import { canonicalJson, type CapabilityContext } from "@huhu/kernel";
import { readBoundedZip, writeBoundedZip } from "@huhu/vault";
import { z } from "zod";
import { maxLedgerArchiveBytes, moduleSelection, type BackupIssue, type BackupPreview, type ConfirmBackup, type ExportBackup, type InspectBackup } from "../../shared/backups.js";
import { BookName } from "../../shared/books.js";
import { attachmentPath, stateSchema, withLedgerSnapshot, type BookState, type LedgerStore } from "../store.js";
import { archiveJson } from "./archive-json.js";
import { inspectHomibook } from "./homibook.js";
import { digest, json, remapBook, requireAttachment, requireModules, selectModules, validateBookRelations } from "./snapshot.js";

const manifestName = "manifest.json";
const stateName = "book.json";
const limits = { archiveBytes: maxLedgerArchiveBytes, entryBytes: 16 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, entries: 1024 };
const fileEntry = z.strictObject({ name: z.string(), size: z.int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/u) });
const manifestSchema = z.strictObject({ format: z.literal("huhu-ledger"), version: z.literal(1), modules: moduleSelection, files: z.array(fileEntry).max(limits.entries) });
type FileSet = ReadonlyMap<string, Uint8Array>;
type Decisions = z.infer<typeof ConfirmBackup>["decisions"];
export type PreparedBackup = {
  state: BookState;
  attachments: FileSet;
  issues: BackupIssue[];
  warnings?: string[];
  resolve?(decisions: Decisions): BookState;
  sourceBooks: BackupPreview["sourceBooks"];
  modules: BackupPreview["modules"];
};
const caller = (context: CapabilityContext) =>
  digest(canonicalJson([context.caller, context.subject ?? null, ...(context.delegatedBy ? [context.delegatedBy] : [])]));

function nativeBackup(files: FileSet, rawManifest: unknown): PreparedBackup {
  const parsed = manifestSchema.safeParse(rawManifest);
  if (!parsed.success) throw errors.invalidInput("账本包版本或清单无效");
  const { modules, files: manifest } = parsed.data;
  requireModules(modules);
  const seen = new Set<string>([manifestName]);
  for (const { name, size, sha256 } of manifest) {
    const contents = files.get(name);
    if (seen.has(name) || !contents || contents.byteLength !== size || digest(contents) !== sha256) throw errors.invalidInput("清单与压缩包内容不一致");
    seen.add(name);
  }
  if (seen.size !== files.size || !seen.has(stateName)) throw errors.invalidInput("存在清单之外的文件或缺少账本内容");
  const result = stateSchema.safeParse(archiveJson(files, stateName));
  if (!result.success) throw errors.invalidInput("账本包中的事实格式无效");
  const state = selectModules(result.data, modules);
  validateBookRelations(state);
  const attachments = new Map(state.attachments.map((item) => [item.id, requireAttachment(files.get("attachments/" + item.id), item)]));
  if (files.size !== attachments.size + 2) throw errors.invalidInput("附件清单和账本引用不一致");
  const warnings = state.resourceReferences.length
    ? ["账本包保留财务笔记与档案关联。若要备份笔记正文，请使用全 Vault 备份。"]
    : [];
  return { state, issues: [], attachments, sourceBooks: [{ id: state.book.id, name: state.book.name }], modules, warnings };
}

export class LedgerBackups {
  private readonly previews = new Map<string, { owner: string; until: number; backup: PreparedBackup }>();
  constructor(private readonly store: LedgerStore) {}

  dispose() {
    this.previews.clear();
  }

  async export(context: CapabilityContext, { bookId, modules }: z.infer<typeof ExportBackup>) {
    const stateAndFiles = await withLedgerSnapshot(this.store.files, () => {
      context.signal.throwIfAborted();
      context.assertCapabilityCurrent?.();
      const state = selectModules(this.store.snapshot(bookId), modules);
      validateBookRelations(state);
      const files = new Map<string, Uint8Array>([[stateName, json(state)]]);
      let total = files.get(stateName)!.byteLength;
      for (const attachment of state.attachments) {
        if (files.size + 2 > limits.entries || (total += attachment.size) > limits.totalBytes) throw errors.invalidInput("账本包大小超出上传或下载上限");
        const bytes = requireAttachment(this.store.files.read(attachmentPath(bookId, attachment.id))?.bytes, attachment);
        files.set("attachments/" + attachment.id, bytes);
      }
      return { files, name: state.book.name };
    });
    const { files, name } = stateAndFiles;
    const entries = [...files].map(([path, bytes]) => ({ name: path, size: bytes.length, sha256: digest(bytes) }));
    files.set(manifestName, json({ format: "huhu-ledger", version: 1, modules, files: entries }));
    return { fileName: (name.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_") || "ledger") + ".zip",
      base64: Buffer.from(writeBoundedZip(files, limits)).toString("base64") };
  }

  preview(context: CapabilityContext, input: z.infer<typeof InspectBackup>): BackupPreview {
    const owner = caller(context);
    context.signal.throwIfAborted();
    const files = readBoundedZip(Buffer.from(input.base64, "base64"), limits);
    const manifest = archiveJson(files, manifestName);
    const isNative = typeof manifest === "object" && manifest !== null && "format" in manifest && manifest.format === "huhu-ledger";
    let backup: PreparedBackup;
    try {
      backup = isNative ? nativeBackup(files, manifest) : inspectHomibook(files, manifest, input);
    } catch (failure) {
      if (failure instanceof z.ZodError) throw errors.invalidInput("备份版本、清单或账本字段无效");
      throw failure;
    }
    if (backup.issues.length > 400) throw errors.invalidInput("有过多条目需要逐行处理，请分批迁入");
    const previewId = randomUUID();
    const now = Date.now();
    for (const [id, prior] of this.previews) if (prior.until <= now) this.previews.delete(id);
    if (this.previews.size >= 4) throw errors.invalidInput("当前有多份待确认的预览，请取消一份后重试");
    this.previews.set(previewId, { owner, until: now + 15 * 60_000, backup });
    const { state } = backup;
    return {
      previewId, source: isNative ? "huhu" : "homibook", sourceBookId: isNative ? state.book.id : backup.sourceBooks.find((book) => book.id === input.sourceBookId)?.id ?? backup.sourceBooks[0]!.id,
      sourceBooks: backup.sourceBooks, suggestedName: BookName.parse(state.book.name.slice(0, 90) + " · 恢复"),
      timeZone: state.book.timeZone, currency: state.book.defaultCurrency, modules: backup.modules,
      counts: { accounts: state.accounts.length, records: state.records.length, attachments: state.attachments.length }, issues: backup.issues, warnings: backup.warnings ?? [],
    };
  }

  cancel(context: CapabilityContext, previewId: string) {
    const owner = caller(context);
    if (this.previews.get(previewId)?.owner === owner) this.previews.delete(previewId);
    return { cancelled: true as const };
  }

  async status(context: CapabilityContext, previewId: string) {
    const owner = caller(context);
    await this.store.idle();
    context.assertCapabilityCurrent?.();
    return this.store.restoredBook(previewId, owner);
  }

  async confirm(context: CapabilityContext, { previewId, name, modules, decisions }: z.infer<typeof ConfirmBackup>) {
    const owner = caller(context);
    const fingerprint = digest(canonicalJson([name, [...modules].sort(), decisions]));
    const result = await this.store.restore(context, { previewId, name, owner, fingerprint }, () => {
      const plan = this.previews.get(previewId);
      if (!plan || plan.owner !== owner || plan.until <= Date.now()) throw errors.notFound("找不到可确认的预览，请重新检查备份");
      const { backup } = plan;
      requireModules(modules);
      if (modules.some((module) => !backup.modules.includes(module))) throw errors.invalidInput("备份不包含所选模块");
      const issues = backup.issues.filter(({ module }) => modules.includes(module));
      const byId = new Map(issues.map((issue) => [issue.id, issue]));
      if (issues.some(({ id, choices }) => !choices.includes(decisions[id]!)) ||
          Object.keys(decisions).some((id) => !byId.has(id))) throw errors.invalidInput("请处理所选模块中的每个待决条目");
      const state = selectModules(backup.resolve?.(decisions) ?? backup.state, modules);
      validateBookRelations(state);
      const attachments = new Map(state.attachments.map(({ id }) => [id, backup.attachments.get(id)!]));
      const restored = remapBook(state, attachments, name);
      validateBookRelations(restored.state);
      return restored;
    });
    this.previews.delete(previewId);
    return result;
  }
}
