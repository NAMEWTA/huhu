import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";

const loopback = (url: URL) => ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);

export function oauthUrl(value: string | URL, source: URL): URL {
  const url = new URL(value);
  if (url.username || url.password || !(url.protocol === "https:" || (url.protocol === "http:" && loopback(url) && loopback(source)))) {
    throw Error("不可信的 OAuth 目标");
  }
  return url;
}

export function oauthFetch(source: URL, signal: AbortSignal): FetchLike {
  return (input, init) => {
    const url = oauthUrl(input, source);
    const lifetime = init?.signal ? AbortSignal.any([signal, init.signal]) : signal;
    return fetch(url, { ...init, signal: lifetime, redirect: "error" });
  };
}
