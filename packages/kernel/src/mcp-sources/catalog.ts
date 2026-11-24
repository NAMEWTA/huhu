import { createHash } from "node:crypto";
import { errors } from "@huhu/contracts";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export function publicToolName(namespace: string, raw: string, reserved: (name: string) => boolean): string {
  const natural = `${namespace}__${raw}`;
  if (natural.length <= 128 && /^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/.test(raw) && !reserved(natural)) return natural;
  return `${namespace}__-${createHash("sha256").update(raw).digest("hex")}`;
}

const maxPages = 24;
const maxEntries = 2048;
const maxBytes = 2 * 1024 * 1024;
const maxToolBytes = 128 * 1024;

export async function discoverTools(client: Pick<Client, "getServerCapabilities" | "listTools">, signal: AbortSignal): Promise<Tool[]> {
  if (!client.getServerCapabilities()?.tools) return [];
  const tools = new Map<string, Tool>();
  const seen = new Set<string>();
  let bytes = 0;
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    signal.throwIfAborted();
    const response = await client.listTools(cursor === undefined ? {} : { cursor }, { signal });
    for (const tool of response.tools) {
      const size = Buffer.byteLength(JSON.stringify(tool));
      bytes += size;
      if (size > maxToolBytes || bytes > maxBytes || tools.size >= maxEntries || !tool.name || tools.has(tool.name)) {
        throw errors.invalidInput("上游工具目录过大或含重复工具");
      }
      tools.set(tool.name, tool);
    }
    cursor = response.nextCursor;
    if (cursor === undefined) return [...tools.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    if (seen.has(cursor)) throw errors.invalidInput("上游目录返回重复游标");
    seen.add(cursor);
  }
  throw errors.invalidInput("上游工具目录分页超出限制");
}
