import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { GUIDE_PATHS, type GuideCapability } from "../shared/guide-files.js";
import { GuideService } from "./service.js";

export { GuideService } from "./service.js";

const Status = z.enum(["current", "missing", "outdated", "conflict", "preserved", "needs-check", "error"]);
const PathEnum = z.enum(GUIDE_PATHS);
const StatusDto = z.object({ version: z.string(), readOnly: z.boolean(), overall: Status, files: z.array(z.object({ path: PathEnum, status: Status })) });
const Opt = z.object({ path: PathEnum.optional() });

/** Agent 指南维护（plugins §4）。自动补写 / 升级由宿主在所有插件启用之后调用 `maintain()`（指南里的能力表取决于完整的注册表）。 */
export function apply(_ctx: Context, api: HuhuApi, opts: { version: string; capabilities(): GuideCapability[] }): GuideService {
  const svc = new GuideService({ files: api.vault.files, version: opts.version, capabilities: opts.capabilities });
  api.provide("agent-guide", svc);
  const read = { plugin: "agent-guide", scope: "read" as const };
  const write = { plugin: "agent-guide", scope: "write" as const, exposable: false, defaultExposed: false };
  api.defineCapability(def({ name: "guide.status", ...read, exposable: true, defaultExposed: true, input: z.object({}), output: StatusDto, handler: () => svc.status() }));
  api.defineCapability(
    def({
      name: "guide.view",
      ...read,
      exposable: false,
      defaultExposed: false,
      input: z.object({ path: PathEnum }),
      output: z.object({ path: PathEnum, current: z.string().nullable(), builtin: z.string(), status: Status }),
      handler: (_c, i) => svc.view(i.path),
    }),
  );
  api.defineCapability(def({ name: "guide.check", ...write, input: z.object({}), output: StatusDto, handler: () => svc.check() }));
  api.defineCapability(def({ name: "guide.preserve", ...write, input: Opt, output: StatusDto, handler: (_c, i) => svc.preserve(i.path) }));
  api.defineCapability(def({ name: "guide.restoreBuiltin", ...write, input: Opt, output: StatusDto.extend({ backupId: z.string().nullable() }), handler: (_c, i) => svc.restoreBuiltin(i.path) }));
  api.defineCapability(def({ name: "guide.backups.list", ...read, exposable: false, defaultExposed: false, input: z.object({}), output: z.array(z.object({ id: z.string(), files: z.array(PathEnum) })), handler: () => svc.backups() }));
  api.defineCapability(def({ name: "guide.backups.restore", ...write, input: z.object({ id: z.string() }), output: StatusDto, handler: (_c, i) => svc.restoreBackup(i.id) }));
  return svc;
}
