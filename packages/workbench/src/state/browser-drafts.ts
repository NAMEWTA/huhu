import type { EngineEndpoint } from "../engine-client/client.js";

type DraftScope = Pick<EngineEndpoint, "vaultId" | "browserSessionId">;
const PREFIX = "huhu:note-draft:";
const ACTIVE = "huhu:active-draft-scope";
const revoked = new Set<string>();

function scopeOf(endpoint: DraftScope): string | undefined {
  if (!endpoint.browserSessionId) return undefined;
  return PREFIX + encodeURIComponent(JSON.stringify([endpoint.vaultId, endpoint.browserSessionId])) + ":";
}

export function browserDraftStorage(endpoint: DraftScope, path: string): { read(): string | null; write(value: string): void; remove(): void } | undefined {
  const scope = scopeOf(endpoint);
  if (!scope) return undefined;
  const key = scope + encodeURIComponent(path);
  return {
    read: () => (revoked.has(scope) ? null : localStorage.getItem(key)),
    write: (value) => {
      if (!revoked.has(scope)) localStorage.setItem(key, value);
    },
    remove: () => localStorage.removeItem(key),
  };
}

function clearScope(scope: string): void {
  if (!scope.startsWith(PREFIX)) return;
  revoked.add(scope);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(scope)) localStorage.removeItem(key);
  }
}

/** Called only after authenticated bootstrap or confirmed session expiry. */
export function switchBrowserDraftScope(current: DraftScope | null, previous?: DraftScope): void {
  const next = current ? scopeOf(current) : undefined;
  const knownPrevious = previous ? scopeOf(previous) : undefined;
  try {
    const prior = knownPrevious ?? sessionStorage.getItem(ACTIVE);
    if (prior && prior !== next) clearScope(prior);
    if (next) sessionStorage.setItem(ACTIVE, next);
    else sessionStorage.removeItem(ACTIVE);
  } catch {
    // Storage availability is checked when a document actually writes a checkpoint.
  }
}
