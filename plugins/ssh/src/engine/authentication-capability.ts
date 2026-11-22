import { errors, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { SshAuthenticationPrompt } from "../shared/trust.js";
import type { SshManager } from "./manager.js";

export const sshAuthenticationDescriptor = defineCapabilityDescriptor({
  plugin: "ssh",
  name: "ssh.authentication.answer",
  title: "回答 SSH 交互认证",
  description: "向当前尝试的指定跳点提交一轮认证回答，或取消该尝试。",
  scope: "execute",
  risk: "normal",
  exposable: true,
  defaultExposed: false,
  input: SshAuthenticationPrompt.pick({ attemptId: true, hop: true, promptId: true }).extend({ answers: z.array(z.string().max(4096)).max(32).nullable() }),
  output: z.strictObject({ applied: z.boolean() }),
});

export function registerSshAuthentication(api: HuhuApi, manager: SshManager): void {
  api.defineCapability(bindCapability(sshAuthenticationDescriptor, ({ caller, signal }, { attemptId, hop, promptId, answers }) => {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(sshAuthenticationDescriptor.name);
    signal.throwIfAborted();
    return { applied: manager.decideAuthentication(attemptId, hop, promptId, answers) };
  }));
}
