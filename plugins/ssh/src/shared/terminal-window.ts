import { z } from "zod";

export const SshTerminalWindowTarget = z.strictObject({
  vaultId: z.string().min(1).max(256),
  shellId: z.string().regex(/^ssh-[A-Za-z0-9._-]{1,60}$/u),
  name: z.string().min(1).max(256),
  handoffId: z.uuidv4(),
});
export type SshTerminalWindowTarget = z.infer<typeof SshTerminalWindowTarget>;

export function sshTerminalWindowUrl(base: string, target: SshTerminalWindowTarget) {
  const url = new URL(base);
  url.hash = new URLSearchParams({ sshTerminal: "1", ...target }).toString();
  return url.href;
}

export function readSshTerminalWindow(hash: string) {
  const fragment = new URLSearchParams(hash.slice(1));
  if (fragment.get("sshTerminal") !== "1") return undefined;
  const { vaultId, shellId, name, handoffId } = Object.fromEntries(fragment);
  return SshTerminalWindowTarget.safeParse({ vaultId, shellId, name, handoffId }).data;
}

export interface SshTerminalWindowHost {
  openSshTerminalWindow(target: SshTerminalWindowTarget): Promise<void>;
  readySshTerminalWindow(handoffId: string): Promise<void>;
}
