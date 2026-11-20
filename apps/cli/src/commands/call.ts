import { randomUUID } from "node:crypto";
import type { CapabilityDiscoveryEntry, CapabilityResult } from "@huhu/contracts";
import { ConnectError, type Connection } from "../connect.js";

async function request(conn: Connection, route: string, init?: RequestInit): Promise<Response> {
  try {
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${conn.token}`);
    return await fetch(`${conn.baseUrl}${route}`, { ...init, headers });
  } catch {
    throw new ConnectError("无法连接 Engine（端点已失效）");
  }
}

async function requestError(res: Response): Promise<CapabilityResult<never>> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: { code: "INTERNAL", message: body?.error ?? `HTTP ${res.status}`, retryable: false } };
}

export async function callCapability(conn: Connection, capability: string, input: unknown, nameFormat?: "mcp"): Promise<CapabilityResult<unknown>> {
  const route = nameFormat === "mcp" ? "/api/v1/call?nameFormat=mcp" : "/api/v1/call";
  const res = await request(conn, route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
  });
  if (!res.ok) return requestError(res);
  return (await res.json()) as CapabilityResult<unknown>;
}

export async function discoverCapabilities(conn: Connection): Promise<CapabilityResult<CapabilityDiscoveryEntry[]>> {
  const res = await request(conn, "/api/v1/capabilities");
  if (!res.ok) return requestError(res);
  return { ok: true, data: (await res.json()) as CapabilityDiscoveryEntry[] };
}

/** 输出约定：--json 输出 CapabilityResult；退出码 0 成功、1 业务错误。 */
export function render(result: CapabilityResult<unknown>, json: boolean): { out: string; code: number } {
  if (json) return { out: JSON.stringify(result), code: result.ok ? 0 : 1 };
  if (result.ok) return { out: typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2), code: 0 };
  return { out: `错误 ${result.error.code}：${result.error.message}`, code: 1 };
}
