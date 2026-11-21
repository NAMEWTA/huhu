import { z } from "zod";

export type AiMessage = { role: "system" | "user"; content: string };
export type AiResult = { ok: true; text: string } | { ok: false; reason: "cancelled" | "timeout" | "auth" | "redirect" | "response" | "network" };

/** Return the one URL the workspace will display and the Engine will call. */
export function aiEndpoint(input: string): string | undefined {
  if (!/^https?:\/\/[^/]/i.test(input) || /[\s\\?#]/u.test(input) || /^https?:\/\/[^/]*@/i.test(input)) return;
  const url = URL.parse(input);
  if (!url || url.username || url.password) return;
  if (url.protocol === "http:") {
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    if (url.hostname !== "[::1]" && !url.hostname.startsWith("127.")) return;
    // The WHATWG parser canonicalizes IPv4 literals. A DNS name starting with 127 is not a literal.
    if (url.hostname !== "[::1]" && !/^127(?:\.\d{1,3}){3}$/.test(url.hostname)) return;
  }
  const base = url.pathname.replace(/\/+$/, "");
  url.pathname = base.endsWith("/chat/completions") ? base : `${base || "/v1"}/chat/completions`;
  return url.href;
}

const responseSchema = z.object({ choices: z.tuple([z.object({ message: z.object({ content: z.string().trim().min(1).max(32_000) }) })]).rest(z.unknown()) });

export async function mailCompletion(endpoint: string, model: string, key: string | undefined, messages: AiMessage[], signal: AbortSignal): Promise<AiResult> {
  const timeout = AbortSignal.timeout(10_000);
  const requestSignal = AbortSignal.any([signal, timeout]);
  try {
    requestSignal.throwIfAborted();
    // Node's fetch is direct by default. A process-wide environment proxy changes the destination.
    if (process.env.NODE_USE_ENV_PROXY === "1" || /(?:^|\s)--use-env-proxy(?:\s|$)/.test(process.env.NODE_OPTIONS ?? "") || process.execArgv.includes("--use-env-proxy")) {
      return { ok: false, reason: "network" };
    }
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json", ...(endpoint.startsWith("https:") && key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: requestSignal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status >= 300 && response.status < 400) return { ok: false, reason: "redirect" };
      return { ok: false, reason: response.status === 401 || response.status === 403 ? "auth" : "response" };
    }
    if (!response.body) return { ok: false, reason: "response" };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 256 * 1024) {
        await reader.cancel();
        return { ok: false, reason: "response" };
      }
      chunks.push(value);
    }
    requestSignal.throwIfAborted();
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const parsed = responseSchema.safeParse(data);
    if (!parsed.success) return { ok: false, reason: "response" };
    const text = parsed.data.choices[0].message.content;
    return { ok: true, text: key ? text.replaceAll(key, "[已隐藏]") : text };
  } catch (error) {
    if (signal.aborted) return { ok: false, reason: "cancelled" };
    if (timeout.aborted) return { ok: false, reason: "timeout" };
    return { ok: false, reason: error instanceof SyntaxError ? "response" : "network" };
  }
}
