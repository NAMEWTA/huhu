import { randomUUID } from "node:crypto";
import type { CapabilityResult } from "@huhu/contracts";
import { ConnectError, type Connection } from "../connect.js";

export async function callCapability(conn: Connection, capability: string, input: unknown): Promise<CapabilityResult<unknown>> {
  let res: Response;
  try {
    res = await fetch(`${conn.baseUrl}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${conn.token}`, "content-type": "application/json" },
      body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
    });
  } catch {
    throw new ConnectError("无法连接 Engine（端点已失效）");
  }
  if (!res.ok && res.status !== 200) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: { code: "INTERNAL", message: body.error ?? `HTTP ${res.status}`, retryable: false } };
  }
  return (await res.json()) as CapabilityResult<unknown>;
}

/** 输出约定：--json 输出 CapabilityResult；退出码 0 成功、1 业务错误。 */
export function render(result: CapabilityResult<unknown>, json: boolean): { out: string; code: number } {
  if (json) return { out: JSON.stringify(result), code: result.ok ? 0 : 1 };
  if (result.ok) return { out: typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2), code: 0 };
  return { out: `错误 ${result.error.code}：${result.error.message}`, code: 1 };
}
