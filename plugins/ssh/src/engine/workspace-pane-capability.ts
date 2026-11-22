import { errors, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { ChangeWorkspaceRun, WorkspaceRun } from "../shared/workspace.js";
import type { WorkspaceRuns } from "./workspace-runs.js";

export const sshWorkspacePaneDescriptor = defineCapabilityDescriptor({
  plugin: "ssh",
  name: "ssh.workspace.runs.changeLayout",
  title: "更新 SSH 工作区运行分栏",
  description: "按布局版本交换、调整或关闭当前运行的分栏。",
  scope: "write",
  risk: "normal",
  exposable: true,
  defaultExposed: false,
  input: ChangeWorkspaceRun,
  output: WorkspaceRun,
});

export function registerSshWorkspacePanes(api: HuhuApi, runs: WorkspaceRuns) {
  api.defineCapability(bindCapability(sshWorkspacePaneDescriptor, ({ caller, signal }, input) => {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(sshWorkspacePaneDescriptor.name);
    return runs.changeLayout(input, signal);
  }));
}
