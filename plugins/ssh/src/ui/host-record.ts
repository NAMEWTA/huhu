import type { z } from "zod";
import { purposes, type AuthKind, type LegacyHostView, type ManagedHostView, type Purpose } from "../engine/auth-profile.js";

export type ManagedHost = z.output<typeof ManagedHostView>;
export type Host = ManagedHost | z.output<typeof LegacyHostView>;
export const isManagedHost = (host: Host): host is ManagedHost => "revision" in host;

export const authLabels: Record<AuthKind, string> = {
  password: "密码",
  key: "SSH 私钥",
  agent: "SSH Agent",
  "identity-file": "本机身份文件",
};

export const credentialLabels: Record<Purpose, string> = {
  password: "密码",
  privateKey: "私钥",
  passphrase: "私钥口令",
  identityFile: "身份文件路径",
};

const credentialStates: Record<ManagedHost["authState"][string], string> = {
  unconfigured: "未配置",
  configured: "已配置",
  "temporarily-unavailable": "暂不可用",
  "needs-reconfiguration": "需要重新配置",
  corrupt: "记录损坏",
};

export function authAvailability(host: Host): string {
  if (!isManagedHost(host)) return "旧式主机配置";
  if (host.auth.kind === "agent") return "连接时检查本机 SSH Agent";
  return purposes[host.auth.kind].map((purpose) => `${credentialLabels[purpose]}：${credentialState(host, purpose)}`).join(" · ");
}

export function credentialState(host: ManagedHost | null, purpose: Purpose): string {
  return credentialStates[host?.authState[purpose] ?? "unconfigured"];
}
