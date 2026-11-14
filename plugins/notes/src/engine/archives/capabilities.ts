import { ArchiveDetailDtoSchema, ArchiveDtoSchema, ArchiveFieldDefSchema, ArchiveTypeDtoSchema } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { defineCapability as def } from "@huhu/kernel";
import { z } from "zod";
import type { ArchivesService } from "./service.js";

const Path = z.object({ path: z.string().min(1) });
const Trashed = z.object({ trashed: z.number().int() });
const Fields = z.record(z.string(), z.unknown());

/** archives.* 能力：档案是 `Archives/<类型>/<名称>/` 下的文件夹笔记，能力由 notes 插件提供。类型相关能力只对内置界面开放。 */
export function registerArchiveCapabilities(api: HuhuApi, svc: ArchivesService): void {
  const read = { plugin: "notes", scope: "read", exposable: true, defaultExposed: true } as const;
  const write = { plugin: "notes", scope: "write", exposable: true, defaultExposed: false } as const;
  const internalRead = { plugin: "notes", scope: "read", exposable: false, defaultExposed: false } as const;
  const internalWrite = { plugin: "notes", scope: "write", exposable: false, defaultExposed: false } as const;

  api.defineCapability(def({ name: "archives.types.list", ...internalRead, input: z.object({}), output: z.array(ArchiveTypeDtoSchema), handler: () => svc.types() }));
  api.defineCapability(
    def({
      name: "archives.types.save",
      ...internalWrite,
      input: z.object({
        path: z.string().optional(),
        name: z.string(),
        icon: z.string().optional(),
        fields: z.array(ArchiveFieldDefSchema),
        renames: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
      }),
      output: ArchiveTypeDtoSchema,
      handler: (_c, i) => svc.saveType({ name: i.name, fields: i.fields, ...(i.path ? { path: i.path } : {}), ...(i.icon ? { icon: i.icon } : {}), ...(i.renames ? { renames: i.renames } : {}) }),
    }),
  );
  api.defineCapability(def({ name: "archives.types.delete", ...internalWrite, input: Path, output: Trashed, handler: (_c, i) => svc.deleteType(i.path) }));

  api.defineCapability(
    def({
      name: "archives.list",
      ...read,
      input: z.object({ type: z.string().optional(), query: z.string().optional() }),
      output: z.array(ArchiveDtoSchema),
      handler: (_c, i) => svc.list({ ...(i.type ? { type: i.type } : {}), ...(i.query ? { query: i.query } : {}) }),
    }),
  );
  api.defineCapability(def({ name: "archives.read", ...read, input: Path, output: ArchiveDetailDtoSchema, handler: (_c, i) => svc.read(i.path) }));
  api.defineCapability(
    def({ name: "archives.create", ...write, input: z.object({ type: z.string(), name: z.string(), fields: Fields.optional(), body: z.string().optional() }), output: ArchiveDtoSchema, handler: (_c, i) => svc.create(i) }),
  );
  api.defineCapability(
    def({
      name: "archives.update",
      ...write,
      input: Path.extend({ expectedVersion: z.string().optional(), fields: Fields.optional(), body: z.string().optional(), name: z.string().optional(), removeKeys: z.array(z.string()).optional() }),
      output: ArchiveDtoSchema,
      handler: (_c, i) => svc.update(i),
    }),
  );
  api.defineCapability(def({ name: "archives.move", ...write, input: Path.extend({ type: z.string() }), output: ArchiveDtoSchema, handler: (_c, i) => svc.move(i) }));
  api.defineCapability(def({ name: "archives.addFile", ...internalWrite, input: Path.extend({ name: z.string().min(1), dataBase64: z.string() }), output: z.object({ path: z.string() }), handler: (_c, i) => svc.addFile(i) }));
  api.defineCapability(def({ name: "archives.delete", ...write, input: Path, output: Trashed, handler: (_c, i) => svc.delete(i.path) }));
}
