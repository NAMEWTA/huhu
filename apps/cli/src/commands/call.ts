import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { CapabilityDiscoveryEntry, CapabilityOperationLookup, CapabilityResult } from "@huhu/contracts";
import { MAX_BODY_BYTES } from "@huhu/kernel";
import { ConnectError, type Connection } from "../connect.js";

export async function readCallFile(path: string): Promise<{ text: string } | { error: string }> {
  let bytes: Buffer;
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile()) return { error: "--input-file 必须指向普通文件" };
      const tooLarge = { error: `--input-file 超过 ${MAX_BODY_BYTES / (1024 * 1024)} MiB 输入上限` };
      if (stat.size > MAX_BODY_BYTES) return tooLarge;
      // end 含上界。即使文件在读取期间变大，也最多读网关上限再加一个字节。
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of file.createReadStream({ start: 0, end: MAX_BODY_BYTES, autoClose: false }) as AsyncIterable<Buffer>) {
        total += chunk.length;
        if (total > MAX_BODY_BYTES) return tooLarge;
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks, total);
    } finally {
      await file.close();
    }
  } catch {
    return { error: "无法读取 --input-file 指定的文件" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { error: "--input-file 必须使用 UTF-8 编码" };
  }
}

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

export async function callCapability(conn: Connection, capability: string, input: unknown, nameFormat?: "mcp", intentKey?: string): Promise<CapabilityResult<unknown>> {
  const route = nameFormat === "mcp" ? "/api/v1/call?nameFormat=mcp" : "/api/v1/call";
  const res = await request(conn, route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID(), ...(intentKey !== undefined && { intentKey }) }),
  });
  if (!res.ok) return requestError(res);
  return (await res.json()) as CapabilityResult<unknown>;
}

export async function readCapabilityOperation(conn: Connection, lookup: CapabilityOperationLookup): Promise<CapabilityResult<unknown>> {
  const query = new URLSearchParams(lookup);
  const res = await request(conn, "/api/v1/operations?" + query);
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
