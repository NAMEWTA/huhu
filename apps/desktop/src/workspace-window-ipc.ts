import type { SshWorkspacePaneAddress } from "@huhu/workbench";

export const workspaceWindowChannel = {
  open: "huhu:workspace-window:open",
  view: "huhu:workspace-window:view",
  attached: "huhu:workspace-window:attached",
  complete: "huhu:workspace-window:complete",
  cancel: "huhu:workspace-window:cancel",
  moved: "huhu:workspace-window:moved",
  changed: "huhu:workspace-window:changed",
} as const;

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu;

export function isWorkspacePaneAddress(value: unknown): value is SshWorkspacePaneAddress {
  if (!value || typeof value !== "object" || Object.keys(value).length !== 5) return false;
  const { vaultId, runId, generation, paneId, sessionId } = value as Partial<SshWorkspacePaneAddress>;
  return (
    typeof vaultId === "string" &&
    /^[a-z0-9-]{1,128}$/iu.test(vaultId) &&
    typeof runId === "string" &&
    uuid.test(runId) &&
    typeof generation === "number" &&
    Number.isSafeInteger(generation) &&
    generation > 0 &&
    typeof paneId === "string" &&
    uuid.test(paneId) &&
    typeof sessionId === "string" &&
    /^ssh-[a-z0-9]{6,64}$/u.test(sessionId)
  );
}

export function isWorkspaceWindowTicket(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{32}$/u.test(value);
}
