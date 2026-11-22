import { errors } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { AddSshKey, RemoveSshKey, SshKeySummary } from "../shared/key-library.js";
import type { HostConfigurations } from "./host-configurations.js";

const desktop = { plugin: "ssh", desktopOnly: true, exposable: true, defaultExposed: false, risk: "normal" } as const;

export const sshKeyDescriptors = {
  keysList: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.keys.list",
    title: "列出 SSH 密钥",
    description: "读取公钥指纹、身份来源状态与引用状态。",
    scope: "read",
    input: z.strictObject({}),
    output: z.array(SshKeySummary),
  }),
  keysAdd: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.keys.add",
    title: "导入或生成 SSH 密钥",
    description: "粘贴私钥或生成 Ed25519 身份，并使用本机凭据保护保存。",
    scope: "write",
    input: AddSshKey,
    output: SshKeySummary,
  }),
  keysRemove: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.keys.remove",
    title: "删除未引用的 SSH 密钥",
    description: "按版本删除未被主机引用的密钥。",
    scope: "write",
    input: RemoveSshKey,
    output: z.strictObject({ ok: z.literal(true) }),
  }),
};

export function registerSshKeys(api: HuhuApi, hosts: HostConfigurations): void {
  api.defineCapability(
    bindCapability(sshKeyDescriptors.keysList, ({ caller }) => {
      if (caller !== "desktop") throw errors.permissionDenied(sshKeyDescriptors.keysList.name);
      return hosts.listKeys();
    }),
  );
  api.defineCapability(
    bindCapability(sshKeyDescriptors.keysAdd, ({ caller, signal }, input) => {
      if (caller !== "desktop") throw errors.permissionDenied(sshKeyDescriptors.keysAdd.name);
      return hosts.addKey(input, signal);
    }),
  );
  api.defineCapability(
    bindCapability(sshKeyDescriptors.keysRemove, async ({ caller, signal }, { id, revision }) => {
      if (caller !== "desktop") throw errors.permissionDenied(sshKeyDescriptors.keysRemove.name);
      await hosts.removeKey(id, revision, signal);
      return { ok: true as const };
    }),
  );
}
