import { InboxDocumentReceipt, inboxDocumentReceiptPath } from "@huhu/vault";
import { errors, isWorkbenchCaller, KINDS } from "@huhu/contracts";
import { lstatSync } from "node:fs";
import path from "node:path";
import type { CapabilityContext } from "@huhu/kernel";
import type { Context } from "@huhu/cordis";
import { bindCapability, defineCapabilityDescriptor as descriptor, durableExternal, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { InboxService, type CaptureDto, type ConvertTarget } from "./service.js";

export { InboxService, sourceFor } from "./service.js";

const publicTool = { plugin: "inbox", risk: "normal", exposable: true, defaultExposed: false } as const;
const Id = z.object({ id: z.string() });
const Dto = z.object({
  id: z.string(),
  path: z.string(),
  version: z.string(),
  title: z.string(),
  body: z.string(),
  source: z.string(),
  status: z.enum(["pending", "processed", "dismissed"]),
  createdAt: z.string(),
  processedAt: z.string().nullable(),
  result: z.object({ kind: z.enum(["task", "note", "archive"]), id: z.string() }).nullable(),
  pendingConversion: z.enum(["task", "note", "archive"]).nullable(),
});
const Versioned = Id.extend({ expectedVersion: z.string().optional() });
const ResultRef = Dto.omit({ title: true, body: true, path: true });
const CaptureRef = ResultRef.extend({ title: z.string() });
const WriteDto = z.union([Dto, ResultRef]);
const CREATE_CAP: Record<ConvertTarget, string> = { task: "tasks.create", note: "notes.create", archive: "archives.create" };
const TARGET_PLUGIN: Record<ConvertTarget, string> = { task: "tasks", note: "notes", archive: "notes" };

export const inboxCapabilityDescriptors = {
  list: descriptor({
    name: "inbox.list",
    title: "列出收件项",
    description: "列出收件项。",
    ...publicTool,
    scope: "read",
    input: z.object({ status: z.enum(["pending", "processed", "dismissed"]).optional(), source: z.string().optional(), query: z.string().optional() }),
    output: z.array(Dto),
  }),
  capture: descriptor({
    name: "inbox.capture",
    title: "采集收件项",
    description: "采集收件项。",
    ...publicTool,
    scope: "write",
    input: z.object({ title: z.string().optional(), body: z.string().default(""), source: z.string().optional() }),
    output: z.union([Dto, CaptureRef]),
  }),
  update: descriptor({
    name: "inbox.update",
    title: "编辑收件项",
    description: "编辑收件项。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: Id.extend({ expectedVersion: z.string(), title: z.string().optional(), body: z.string().optional() }),
    output: WriteDto,
  }),
  convert: descriptor({
    name: "inbox.convert",
    title: "转换收件项",
    description: "转换收件项。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: Versioned.extend({ target: z.enum(["task", "note", "archive"]), fields: z.record(z.string(), z.unknown()), resume: z.boolean().optional() }),
    output: WriteDto,
  }),
  dismiss: descriptor({
    name: "inbox.dismiss",
    title: "忽略收件项",
    description: "忽略收件项。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: Versioned,
    output: WriteDto,
  }),
  restore: descriptor({
    name: "inbox.restore",
    title: "恢复收件项",
    description: "恢复收件项。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: Versioned,
    output: WriteDto,
  }),
  undo: descriptor({
    name: "inbox.undo",
    title: "撤销收件转换",
    description: "撤销收件转换。",
    ...publicTool,
    scope: "write",
    risk: "high",
    ...durableExternal,
    input: Versioned,
    output: WriteDto,
  }),
  delete: descriptor({
    name: "inbox.delete",
    title: "删除收件项",
    description: "删除收件项。",
    ...publicTool,
    scope: "write",
    risk: "high",
    ...durableExternal,
    input: Versioned.extend({ confirmed: z.boolean().optional() }),
    output: z.object({ ok: z.literal(true) }),
  }),
};

export interface InboxOptions {
  now?: () => Date;
  isPluginEnabled?: (id: string) => boolean;
}

export function apply(_ctx: Context, api: HuhuApi, opts: InboxOptions = {}): InboxService {
  const svc = new InboxService({
    repo: api.vault.repo,
    trash: api.vault.trash,
    publish: (t, p) => api.events.publish(t, p),
    now: opts.now ?? (() => new Date()),
    isTargetEnabled: (k) => opts.isPluginEnabled?.(TARGET_PLUGIN[k]) ?? true,
    createTarget: async (kind, fields, id, captureId, signal) => {
      await api.call(CREATE_CAP[kind], { ...fields, inboxConversionId: id, ...(kind === "task" && { inboxCaptureId: captureId }) }, { idempotencyKey: `inbox-convert-${id}`, ...(signal && { signal }) });
    },
    readTarget: (kind, id) => {
      if (kind === "task") {
        try {
          return api.vault.repo.read("task", id).id;
        } catch (error) {
          if ((error as { code?: string })?.code === "NOT_FOUND") return null;
          throw error;
        }
      }
      const receipt = api.vault.files.read(inboxDocumentReceiptPath(id));
      if (!receipt) return null;
      return InboxDocumentReceipt.parse(JSON.parse(receipt.bytes.toString("utf8"))).id;
    },
  });

  const trusted = (c: CapabilityContext) => isWorkbenchCaller(c.caller) || (c.caller.startsWith("plugin:") && !c.delegatedBy);
  const view = (c: CapabilityContext, item: CaptureDto) => (trusted(c) && !c.parentOperationId ? item : ResultRef.parse(item));
  const assertInbox = (c: CapabilityContext) => {
    if (!trusted(c) && lstatSync(path.join(api.vault.files.root, KINDS.capture.dir), { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw errors.permissionDenied(KINDS.capture.dir);
    }
  };
  const change = <T>(c: CapabilityContext, i: { id: string; expectedVersion?: string | undefined }, allowed: CaptureDto["status"] | undefined, apply: () => Promise<T> | T, verifyVersion = true) =>
    svc.change(i.id, () => {
      c.signal.throwIfAborted();
      assertInbox(c);
      if (!trusted(c) || i.expectedVersion !== undefined) {
        if (i.expectedVersion === undefined) throw errors.invalidInput("必须提供收件项版本");
        const source = svc.read(i.id);
        if (lstatSync(path.join(api.vault.files.root, source.path), { throwIfNoEntry: false })?.isSymbolicLink()) throw errors.permissionDenied(source.path);
        if (verifyVersion && source.version !== i.expectedVersion) throw errors.versionConflict(source.version);
        if (allowed && source.status !== allowed) throw errors.invalidInput("收件项当前状态无法执行该操作");
      }
      return apply();
    });

  api.defineCapability(
    bindCapability(inboxCapabilityDescriptors.list, (c, i) => {
      assertInbox(c);
      return svc
        .list({ ...(i.status ? { status: i.status } : {}), ...(i.source ? { source: i.source } : {}), ...(i.query ? { query: i.query } : {}) })
        .filter((item) => trusted(c) || !lstatSync(path.join(api.vault.files.root, item.path), { throwIfNoEntry: false })?.isSymbolicLink());
    }),
  );
  api.defineCapability(
    bindCapability(inboxCapabilityDescriptors.capture, async (c, i) => {
      assertInbox(c);
      const item = await svc.capture({ ...(i.title ? { title: i.title } : {}), body: i.body, ...(i.source !== undefined ? { source: i.source } : {}) }, c);
      return trusted(c) && !c.parentOperationId ? item : CaptureRef.parse(item);
    }),
  );
  api.defineCapability(
    bindCapability(inboxCapabilityDescriptors.update, (c, i) =>
      change(c, i, undefined, async () => view(c, await svc.update(i.id, i.expectedVersion, { ...(i.title !== undefined ? { title: i.title } : {}), ...(i.body !== undefined ? { body: i.body } : {}) }))),
    ),
  );
  api.defineCapability(
    bindCapability(inboxCapabilityDescriptors.convert, (c, i) => change(c, i, undefined, async () => view(c, await svc.convert(i.id, i.target, i.fields, { expectedVersion: i.expectedVersion, resume: i.resume, signal: c.signal })), false)),
  );
  api.defineCapability(bindCapability(inboxCapabilityDescriptors.dismiss, (c, i) => change(c, i, undefined, async () => view(c, await svc.dismiss(i.id)))));
  api.defineCapability(bindCapability(inboxCapabilityDescriptors.restore, (c, i) => change(c, i, "dismissed", async () => view(c, await svc.restore(i.id)))));
  api.defineCapability(bindCapability(inboxCapabilityDescriptors.undo, (c, i) => change(c, i, "processed", async () => view(c, await svc.undo(i.id)))));
  api.defineCapability(
    bindCapability(inboxCapabilityDescriptors.delete, (c, i) =>
      change(c, i, undefined, async () => {
        if (!trusted(c) && !i.confirmed) throw errors.invalidInput("必须确认移除原收件项");
        await svc.delete(i.id);
        return { ok: true as const };
      }),
    ),
  );
  return svc;
}
