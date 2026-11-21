import { realpathSync, statSync } from "node:fs";
import path from "node:path";
import { errors, isWorkbenchCaller } from "@huhu/contracts";
import { filesystemIdentity, protectedKindOf } from "@huhu/vault";
import { isWithin } from "./history/scanner.js";
import type { Space } from "../shared/space.js";

export const publicAgentTool = { plugin: "agent-cli", exposable: true, defaultExposed: false } as const;

export function isAgentTool(caller: string): boolean {
  // The built-in Automations owner still uses its private launch and output contracts.
  return !isWorkbenchCaller(caller) && caller !== "plugin:automations";
}

export function workspaceStamp({ id, revision, root }: Space): string {
  const stat = statSync(root, { bigint: true });
  return JSON.stringify([id, revision, root, filesystemIdentity(stat), String(stat.birthtimeNs)]);
}

/** External tools can select existing local bindings, but can only grant new bindings inside the Vault. */
export function vaultWorkspaceDirectory(vault: string, requested: string): string {
  if (!path.isAbsolute(requested)) throw errors.invalidInput("工作目录必须是绝对路径");
  if (!isWithin(vault, path.resolve(requested))) throw errors.permissionDenied("工作目录超出授权范围");
  try {
    const root = realpathSync(vault);
    const directory = realpathSync(requested);
    const relative = path.relative(root, directory).split(path.sep).join("/");
    if (isWithin(root, directory) && statSync(directory).isDirectory() && !protectedKindOf(relative) && !protectedKindOf(root.split(path.sep).join("/"))) return directory;
  } catch {
    throw errors.invalidInput("工作目录不存在或不可访问");
  }
  throw errors.permissionDenied("工作目录超出授权范围");
}
