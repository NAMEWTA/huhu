import { setTimeout as delay } from "node:timers/promises";
import { DEFAULT_TIMEOUT_MS, guardedFetch } from "../vendor/open-knowledge/server-bridge/link-preview/guarded-fetch";
import { deriveDomain, extractHtmlMetadata } from "../vendor/open-knowledge/server-bridge/link-preview/html-metadata";

export async function fetchExternalLinkPreview(input: unknown) {
  if (typeof input !== "string" || input.length > 4096) return { ok: false, reason: "invalid-url" };
  const timer = new AbortController();
  try {
    // The guarded request also has its own deadline, which covers every HTTP hop
    // and body read. Race DNS resolution as well because lookup cannot be cancelled.
    const result = await Promise.race([guardedFetch(input), delay(DEFAULT_TIMEOUT_MS, null, { signal: timer.signal, ref: false })]);
    if (result === null) return { ok: false, reason: "timeout" };
    if (!result.ok) return result;
    const { title, description, siteName } = extractHtmlMetadata(new TextDecoder().decode(result.body));
    return { ok: true, metadata: { domain: deriveDomain(input), title, description, siteName } };
  } finally {
    timer.abort();
  }
}
