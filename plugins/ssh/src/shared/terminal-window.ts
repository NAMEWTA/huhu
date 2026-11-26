import { z } from "zod";

const TerminalHandoff = z.strictObject({
  vaultId: z.string().min(1).max(256),
  handoffId: z.uuidv4(),
});

export const SshTerminalWindowTarget = TerminalHandoff.extend({
  shellId: z.string().regex(/^ssh-[A-Za-z0-9._-]{1,60}$/u),
  name: z.string().min(1).max(256),
});
export type SshTerminalWindowTarget = z.infer<typeof SshTerminalWindowTarget>;

export const SshWorkspaceWindowTarget = TerminalHandoff.extend({
  runId: z.uuid(),
  layoutRevision: z.uuid(),
  focusedPaneId: z.uuid(),
  maximized: z.boolean(),
});
export type SshWorkspaceWindowTarget = z.infer<typeof SshWorkspaceWindowTarget>;

export const SshHandoffWindowTarget = z.union([SshTerminalWindowTarget, SshWorkspaceWindowTarget]);
export type SshHandoffWindowTarget = z.infer<typeof SshHandoffWindowTarget>;

export function sshTerminalWindowUrl(base: string, target: SshHandoffWindowTarget) {
  const url = new URL(base);
  url.hash = new URLSearchParams([
    ["sshTerminal", "1"],
    ...Object.entries(target).map(([key, value]) => [key, String(value)]),
  ]).toString();
  return url.href;
}

export function readSshTerminalWindow(hash: string) {
  const fragment = new URLSearchParams(hash.slice(1));
  if (fragment.get("sshTerminal") !== "1") return undefined;
  if (fragment.has("runId")) {
    const { vaultId, handoffId, runId, layoutRevision, focusedPaneId, maximized } = Object.fromEntries(fragment);
    return SshWorkspaceWindowTarget.safeParse({ vaultId, handoffId, runId, layoutRevision, focusedPaneId, maximized: maximized === "true" }).data;
  }
  const { vaultId, shellId, name, handoffId } = Object.fromEntries(fragment);
  return SshTerminalWindowTarget.safeParse({ vaultId, shellId, name, handoffId }).data;
}

export interface SshTerminalWindowHost {
  openSshTerminalWindow(target: SshTerminalWindowTarget): Promise<void>;
  readySshTerminalWindow(handoffId: string): Promise<void>;
  openSshWorkspaceWindow(target: SshWorkspaceWindowTarget): Promise<string | undefined>;
  onSshWorkspaceDetached(callback: (handoffId: string) => void): () => void;
  returnSshWorkspaceWindow(handoffId: string, focusedPaneId: string): Promise<void>;
}
