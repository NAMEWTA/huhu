import { errors, isWorkbenchCaller } from "@huhu/contracts";
import type { CapabilityContext } from "@huhu/kernel";
import type { Context } from "@huhu/cordis";
import { bindCapability, defineCapabilityDescriptor as descriptor, durableExternal, type HuhuApi } from "@huhu/kernel";
import { OperationLog } from "@huhu/vault";
import path from "node:path";
import { z } from "zod";
import { GUIDE_PATHS, type GuideCapability } from "../shared/guide-files.js";
import { GuideService, type GuideVersions } from "./service.js";

export { GuideService } from "./service.js";

const publicTool = { plugin: "agent-guide", risk: "normal", exposable: true, defaultExposed: false } as const;
const Status = z.enum(["current", "missing", "outdated", "conflict", "preserved", "needs-check", "error"]);
const PathEnum = z.enum(GUIDE_PATHS);
const StatusDto = z.object({ version: z.string(), readOnly: z.boolean(), overall: Status, files: z.array(z.object({ path: PathEnum, status: Status, contentVersion: z.string().nullable() })) });
const Versions = z.partialRecord(PathEnum, z.string().nullable());
const Opt = z.object({ path: PathEnum.optional(), expectedVersions: Versions.optional() });

export const guideCapabilityDescriptors = {
  status: descriptor({
    name: "guide.status",
    title: "读取指南状态",
    description: "读取指南状态。",
    ...publicTool,
    scope: "read",
    input: z.object({}),
    output: StatusDto,
  }),
  view: descriptor({
    name: "guide.view",
    title: "阅读指南",
    description: "阅读指南。",
    ...publicTool,
    scope: "read",
    risk: "high",
    input: z.object({ path: PathEnum }),
    output: z.object({ path: PathEnum, current: z.string().nullable(), builtin: z.string(), status: Status, contentVersion: z.string().nullable() }),
  }),
  check: descriptor({
    name: "guide.check",
    title: "检查指南",
    description: "检查指南。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: z.object({}),
    output: StatusDto,
  }),
  preserve: descriptor({
    name: "guide.preserve",
    title: "保留当前指南",
    description: "保留当前指南。",
    ...publicTool,
    scope: "write",
    ...durableExternal,
    input: Opt,
    output: StatusDto,
  }),
  restoreBuiltin: descriptor({
    name: "guide.restoreBuiltin",
    title: "恢复内置指南",
    description: "恢复内置指南。",
    ...publicTool,
    scope: "write",
    risk: "high",
    ...durableExternal,
    input: Opt,
    output: StatusDto.extend({ backupId: z.string().nullable() }),
  }),
  backupsList: descriptor({
    name: "guide.backups.list",
    title: "列出指南备份",
    description: "列出指南备份。",
    ...publicTool,
    scope: "read",
    input: z.object({}),
    output: z.array(z.object({ id: z.string(), files: z.array(PathEnum) })),
  }),
  backupsRestore: descriptor({
    name: "guide.backups.restore",
    title: "恢复指南备份",
    description: "恢复指南备份。",
    ...publicTool,
    scope: "write",
    risk: "high",
    ...durableExternal,
    input: z.object({ id: z.string(), expectedVersions: Versions.optional() }),
    output: StatusDto,
  }),
};

/** Agent 指南维护（plugins §4）。自动补写 / 升级由宿主在所有插件启用之后调用 `maintain()`（指南里的能力表取决于完整的注册表）。 */
export function apply(_ctx: Context, api: HuhuApi, opts: { version: string; capabilities(): GuideCapability[] }): GuideService {
  const svc = new GuideService({
    files: api.vault.files,
    operations: new OperationLog(api.vault.files, path.join(api.vault.stateDir, "operations")),
    version: opts.version,
    capabilities: opts.capabilities,
  });
  api.provide("agent-guide", svc);
  const versions = (c: CapabilityContext, expected: GuideVersions | undefined) => {
    if (!isWorkbenchCaller(c.caller) && expected === undefined) throw errors.invalidInput("必须提供目标指南文件版本");
    return expected;
  };
  api.defineCapability(bindCapability(guideCapabilityDescriptors.status, () => svc.status()));
  api.defineCapability(bindCapability(guideCapabilityDescriptors.view, (_c, i) => svc.view(i.path)));
  api.defineCapability(
    bindCapability(guideCapabilityDescriptors.check, (c) => {
      if (!isWorkbenchCaller(c.caller)) api.vault.files.assertWritable();
      return svc.check();
    }),
  );
  api.defineCapability(bindCapability(guideCapabilityDescriptors.preserve, (c, i) => svc.preserve(i.path, versions(c, i.expectedVersions))));
  api.defineCapability(bindCapability(guideCapabilityDescriptors.restoreBuiltin, (c, i) => svc.restoreBuiltin(i.path, versions(c, i.expectedVersions))));
  api.defineCapability(bindCapability(guideCapabilityDescriptors.backupsList, () => svc.backups()));
  api.defineCapability(bindCapability(guideCapabilityDescriptors.backupsRestore, (c, i) => svc.restoreBackup(i.id, versions(c, i.expectedVersions))));
  return svc;
}
