import { errors, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { ChangeWorkbenchWorkspaceRun, WorkspaceRun } from "../shared/workspace.js";
import { ChangeOwnedWorkspaceLayout, type PublicWorkspaces } from "./public-workspaces.js";
import type { WorkspaceRuns } from "./workspace-runs.js";

export const sshWorkspacePaneDescriptor = defineCapabilityDescriptor({
  plugin: "ssh",
  name: "ssh.workspace.runs.changeLayout",
  title: "更新 SSH 工作区运行分栏",
  description: "按布局版本交换、调整或关闭当前运行的分栏。工作台还可增加分栏，外部入口需要原代次和意图键。",
  scope: "write",
  risk: "normal",
  exposable: true,
  defaultExposed: false,
  resourceGuarded: "ssh.hosts",
  idempotency: "handler",
  input: z.union([ChangeOwnedWorkspaceLayout, ChangeWorkbenchWorkspaceRun]),
  output: WorkspaceRun,
});

export function registerSshWorkspacePanes(api: HuhuApi, runs: WorkspaceRuns, external: PublicWorkspaces) {
  api.defineCapability(
    bindCapability(sshWorkspacePaneDescriptor, (context, input) => {
      if ("generation" in input) return external.changeLayout(context, input);
      if (!isWorkbenchCaller(context.caller)) throw errors.invalidInput("外部 SSH 工作区布局修改需要原代次和意图键");
      return runs.changeLayout(input, context.signal);
    }),
  );
}
