import { z } from "zod";

export const SshToolWindowTarget = z.strictObject({
  vaultId: z.string().min(1).max(256),
  hostId: z.string().min(1).max(256),
  shellId: z.string().min(1).max(256),
  name: z.string().min(1).max(256),
});
export type SshToolWindowTarget = z.infer<typeof SshToolWindowTarget>;

export function sshToolWindowUrl(base: string, target: SshToolWindowTarget) {
  const url = new URL(base);
  url.hash = new URLSearchParams({ sshTools: "1", ...target }).toString();
  return url.href;
}

export function readSshToolWindow(hash: string) {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  if (fragment.get("sshTools") !== "1") return undefined;
  const { vaultId, hostId, shellId, name } = Object.fromEntries(fragment);
  return SshToolWindowTarget.safeParse({ vaultId, hostId, shellId, name }).data;
}

export interface SshToolWindowHost {
  openSshToolWindow(target: SshToolWindowTarget): Promise<void>;
}
