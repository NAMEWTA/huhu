import { browserDraftStorage, createRequestId, type EngineEndpoint } from "@huhu/workbench";
import type { BrowserNoteDraft, SessionDraft } from "./DocumentSession.js";

export function browserNoteDraft(endpoint: EngineEndpoint, path: string): BrowserNoteDraft | undefined {
  const storage = browserDraftStorage(endpoint, path);
  if (!storage) return undefined;
  function read(): (SessionDraft & { version: string }) | null {
    const raw = storage!.read();
    if (!raw) return null;
    let value: Partial<SessionDraft & { version: string }>;
    try {
      value = JSON.parse(raw) as typeof value;
    } catch {
      return null;
    }
    if (!value || typeof value.version !== "string" || typeof value.text !== "string" || typeof value.baseVersion !== "string" || typeof value.savedAt !== "string") return null;
    return {
      version: value.version,
      text: value.text,
      baseVersion: value.baseVersion,
      savedAt: value.savedAt,
      ...(value.outcome === "unknown" && { outcome: "unknown", ...(value.matchesSubmitted === true && { matchesSubmitted: true }) }),
    };
  }
  return {
    read,
    write(content) {
      const current = read();
      if (current && current.text === content.text && current.baseVersion === content.baseVersion && current.outcome === content.outcome && current.matchesSubmitted === content.matchesSubmitted) {
        return current.version;
      }
      const version = createRequestId();
      storage.write(JSON.stringify({ ...content, version }));
      return version;
    },
    discard(version) {
      if (read()?.version === version) storage.remove();
    },
  };
}
