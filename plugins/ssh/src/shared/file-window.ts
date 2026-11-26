import { z } from "zod";
import { FileSessionId } from "./files.js";

export const SshFileWindowTarget = FileSessionId.extend({ vaultId: z.string().min(1).max(256) });
export type SshFileWindowTarget = z.infer<typeof SshFileWindowTarget>;

export function sshFileWindowUrl(base: string, { vaultId, fileSessionId }: SshFileWindowTarget): string {
  const url = new URL(base);
  url.hash = new URLSearchParams({ sshFiles: fileSessionId, vault: vaultId }).toString();
  return url.href;
}

export function readSshFileWindow(hash: string): SshFileWindowTarget | undefined {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const result = SshFileWindowTarget.safeParse({ vaultId: fragment.get("vault"), fileSessionId: fragment.get("sshFiles") });
  return result.data;
}

export interface SshFileWindowHost {
  openSshFileWindow(target: SshFileWindowTarget): Promise<void>;
}
