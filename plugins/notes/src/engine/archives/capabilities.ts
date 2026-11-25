import { ArchiveDetailDtoSchema, ArchiveDtoSchema, ArchiveFieldDefSchema, ArchiveTypeDtoSchema, errors, isWorkbenchCaller } from "@huhu/contracts";
import type { CapabilityContext, HuhuApi } from "@huhu/kernel";
import { type bindCapability, defineCapabilityDescriptor as descriptor, durableExternal } from "@huhu/kernel";
import { z } from "zod";
import type { ArchivesService } from "./service.js";

const publicTool = { plugin: "notes", risk: "normal", exposable: true, defaultExposed: false } as const;
const Path = z.object({ path: z.string().min(1) });
const TypeView = ArchiveTypeDtoSchema.extend({
  version: z.string().optional(),
  affectedArchives: z.array(z.string()).optional(),
  referencedBy: z.array(z.string()).optional(),
});
const TypeRef = TypeView.pick({ path: true, noteId: true, version: true });
const ArchiveRef = ArchiveDtoSchema.pick({ path: true, noteId: true, type: true });
const Trashed = z.object({ trashed: z.number().int() });
const Fields = z.record(z.string(), z.unknown());

export const archiveCapabilityDescriptors = {
  typesList: descriptor({
    name: "archives.types.list",
    title: "列出档案类型",
    description: "列出档案类型。",
    ...publicTool,
    scope: "read",
    input: z.object({}),
    output: z.array(TypeView),
  }),
  typesSave: descriptor({
    name: "archives.types.save",
    title: "保存档案类型",
    description: "保存档案类型。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: z.object({
      path: z.string().optional(),
      expectedVersion: z.string().optional(),
      name: z.string(),
      icon: z.string().optional(),
      fields: z.array(ArchiveFieldDefSchema),
      renames: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
    }),
    output: z.union([TypeView, TypeRef]),
  }),
  typesDelete: descriptor({
    name: "archives.types.delete",
    title: "删除档案类型",
    description: "删除档案类型。",
    ...publicTool,
    scope: "write",
    risk: "high",
    ...durableExternal,
    input: Path.extend({ expectedVersion: z.string().optional(), confirmed: z.boolean().optional() }),
    output: Trashed,
  }),
  list: descriptor({
    name: "archives.list",
    title: "列出档案",
    description: "列出档案。",
    ...publicTool,
    scope: "read",
    input: z.object({ type: z.string().optional(), query: z.string().optional() }),
    output: z.array(ArchiveDtoSchema),
  }),
  read: descriptor({
    name: "archives.read",
    title: "读取档案",
    description: "读取档案。",
    ...publicTool,
    scope: "read",
    input: Path,
    output: ArchiveDetailDtoSchema,
  }),
  create: descriptor({
    name: "archives.create",
    title: "创建档案",
    description: "创建档案。",
    ...publicTool,
    scope: "write",
    input: z.object({ type: z.string(), name: z.string(), fields: Fields.optional(), body: z.string().optional(), inboxConversionId: z.uuid().optional() }),
    output: z.union([ArchiveDtoSchema, ArchiveRef]),
  }),
  update: descriptor({
    name: "archives.update",
    title: "更新档案",
    description: "更新档案。",
    ...publicTool,
    scope: "write",
    input: Path.extend({ expectedVersion: z.string().optional(), fields: Fields.optional(), body: z.string().optional(), name: z.string().optional(), removeKeys: z.array(z.string()).optional() }),
    output: z.union([ArchiveDtoSchema, ArchiveRef]),
  }),
  move: descriptor({
    name: "archives.move",
    title: "移动档案",
    description: "移动档案。",
    ...publicTool,
    scope: "write",
    input: Path.extend({ type: z.string() }),
    output: z.union([ArchiveDtoSchema, ArchiveRef]),
  }),
  addFile: descriptor({
    name: "archives.addFile",
    title: "添加档案附件",
    description: "添加档案附件。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: Path.extend({ name: z.string().min(1), dataBase64: z.string().max(4 * Math.ceil((50 * 1024 * 1024) / 3)), expectedVersion: z.string().nullable().optional() }),
    output: z.object({ path: z.string() }),
  }),
  delete: descriptor({
    name: "archives.delete",
    title: "删除档案",
    description: "删除档案。",
    ...publicTool,
    scope: "write",
    risk: "high",
    input: Path,
    output: Trashed,
  }),
};

/** archives.* 能力：档案是 `Archives/<类型>/<名称>/` 下的文件夹笔记，能力由 notes 插件提供。 */
export function registerArchiveCapabilities(api: HuhuApi, svc: ArchivesService, bind: typeof bindCapability): void {
  const workbench = (c: CapabilityContext) => isWorkbenchCaller(c.caller);
  const requireVersion = (expected: string | null | undefined, actual: string | null) => {
    if (expected === undefined) throw errors.invalidInput("必须提供当前版本");
    if (expected !== actual) throw errors.versionConflict(actual ?? "");
  };
  api.defineCapability(bind(archiveCapabilityDescriptors.typesList, (c) => svc.types().map((type) => (workbench(c) ? type : { ...type, ...svc.typeImpact(type.path) }))));
  api.defineCapability(
    bind(archiveCapabilityDescriptors.typesSave, async (c, i) => {
      if (!workbench(c) && i.path) requireVersion(i.expectedVersion, svc.typeImpact(i.path).version);
      const type = await svc.saveType({ name: i.name, fields: i.fields, ...(i.path ? { path: i.path } : {}), ...(i.icon ? { icon: i.icon } : {}), ...(i.renames ? { renames: i.renames } : {}) });
      return workbench(c) && !c.parentOperationId ? type : { ...TypeRef.parse(type), version: svc.typeImpact(type.path).version };
    }),
  );
  api.defineCapability(
    bind(archiveCapabilityDescriptors.typesDelete, (c, i) => {
      if (!workbench(c)) {
        if (!i.confirmed) throw errors.invalidInput("必须确认删除该类型及其档案");
        requireVersion(i.expectedVersion, svc.typeImpact(i.path).version);
      }
      return svc.deleteType(i.path);
    }),
  );

  api.defineCapability(bind(archiveCapabilityDescriptors.list, (_c, i) => svc.list({ ...(i.type ? { type: i.type } : {}), ...(i.query ? { query: i.query } : {}) })));
  api.defineCapability(bind(archiveCapabilityDescriptors.read, (_c, i) => svc.read(i.path)));
  api.defineCapability(
    bind(archiveCapabilityDescriptors.create, async (c, i) => {
      if (i.inboxConversionId && (c.caller !== "plugin:inbox" || c.delegatedBy)) throw errors.permissionDenied("收件转换标识");
      const result = await svc.create(i, i.inboxConversionId);
      return c.caller === "plugin:inbox" || c.parentOperationId ? ArchiveRef.parse(result) : result;
    }),
  );
  api.defineCapability(
    bind(archiveCapabilityDescriptors.update, async (c, i) => {
      const result = await svc.update(i);
      return c.parentOperationId ? ArchiveRef.parse(result) : result;
    }),
  );
  api.defineCapability(
    bind(archiveCapabilityDescriptors.move, async (c, i) => {
      const result = await svc.move(i);
      return c.parentOperationId ? ArchiveRef.parse(result) : result;
    }),
  );
  api.defineCapability(
    bind(archiveCapabilityDescriptors.addFile, (c, i) => {
      if (!workbench(c)) {
        requireVersion(i.expectedVersion, svc.archiveVersion(i.path));
        if (/[\\/]/.test(i.name) || !z.base64().safeParse(i.dataBase64).success) throw errors.invalidInput("必须提供文件名和有效 Base64 数据");
      }
      return svc.addFile(i);
    }),
  );
  api.defineCapability(bind(archiveCapabilityDescriptors.delete, (_c, i) => svc.delete(i.path)));
}
