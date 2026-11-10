import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { type CapabilityResult } from "@huhu/contracts";

export interface McpBackend {
  /** 对当前调用者可见（已对外开放）的能力。 */
  list(): Promise<{ name: string; plugin: string; scope: string; input: unknown }[]> | { name: string; plugin: string; scope: string; input: unknown }[];
  /** 经 Dispatcher 调用（授权在那里判定，MCP 层不做第二套权限）。 */
  call(capability: string, input: unknown): Promise<CapabilityResult<unknown>>;
}

const toolName = (cap: string) => cap.replace(/\./g, "_");

/** 把对外开放的能力映射为 MCP 工具，并提供 `huhu://vault/summary` 资源。stdio 与 HTTP 共用。 */
export function createMcpServer(backend: McpBackend, version: string): Server {
  const server = new Server({ name: "huhu", version }, { capabilities: { tools: {}, resources: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await backend.list()).map((c) => ({ name: toolName(c.name), description: `${c.name}（${c.plugin} · ${c.scope}）`, inputSchema: (c.input && typeof c.input === "object" ? c.input : { type: "object" }) as { type: "object" } })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const cap = (await backend.list()).find((c) => toolName(c.name) === req.params.name);
    if (!cap) return { isError: true, content: [{ type: "text", text: `能力不存在或未对外开放：${req.params.name}` }] };
    const r = await backend.call(cap.name, req.params.arguments ?? {});
    if (!r.ok) return { isError: true, content: [{ type: "text", text: JSON.stringify(r.error) }] };
    return { content: [{ type: "text", text: JSON.stringify(r.data) }] };
  });
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: "huhu://vault/summary", name: "Vault 概览", mimeType: "application/json" }] }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    if (req.params.uri !== "huhu://vault/summary") throw new Error(`未知资源：${req.params.uri}`);
    const r = await backend.call("vault.info", {});
    if (!r.ok) throw new Error(r.error.message);
    return { contents: [{ uri: req.params.uri, mimeType: "application/json", text: JSON.stringify(r.data) }] };
  });
  return server;
}

