export const RENDERER_ORIGIN = "huhu-app://workbench";
export const MAX_BODY_BYTES = 8 * 1024 * 1024;
export const MAX_CONCURRENT_PER_TOKEN = 32;

const FORWARDING_HEADERS = ["x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "forwarded", "x-real-ip", "x-client-ip", "cf-connecting-ip", "true-client-ip"];

export type IngressVerdict = { ok: true } | { ok: false; status: 400 | 403; reason: string };

/** 来源策略：拒绝转发头、非回环 Host、非 Renderer 的 Origin。 */
export function checkIngress(headers: Record<string, string | string[] | undefined>, port: number): IngressVerdict {
  for (const h of FORWARDING_HEADERS) if (headers[h] !== undefined) return { ok: false, status: 403, reason: "不接受代理转发的请求" };
  const host = String(headers["host"] ?? "").toLowerCase();
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  if (!allowedHosts.includes(host)) return { ok: false, status: 403, reason: "Host 不被允许" };
  const origin = headers["origin"];
  if (origin !== undefined && origin !== RENDERER_ORIGIN) return { ok: false, status: 403, reason: "Origin 不被允许" };
  return { ok: true };
}

export function bearerFrom(authorization: string | string[] | undefined): string | undefined {
  const v = Array.isArray(authorization) ? authorization[0] : authorization;
  const m = v ? /^Bearer\s+(\S+)$/i.exec(v) : null;
  return m?.[1];
}
