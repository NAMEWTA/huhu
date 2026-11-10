import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { callCapability } from "./commands/call.js";
import type { Connection } from "./connect.js";

interface CapInfo { name: string; plugin: string; scope: string; exposed: boolean; input: unknown }

const toolName = (cap: string) => cap.replace(/\./g, "_");

/**
 * MCP 服务器：把对外开放的能力映射为工具，调用一律转为对 Engine 的 `call`
 * （授权仍由 Dispatcher 按 `mcp`/`cli` 身份判定，MCP 层不做第二套权限）。
 */
export function createMcpServer(conn: Connection, version: string): Server {
  const server = new Server({ name: "huhu", version }, { capabilities: { tools: {}, resources: {} } });

  const load = async (): Promise<CapInfo[]> => {
    const r = await callCapability(conn, "capabilities.list", {});
    if (!r.ok) throw new Error(r.error.message);
    return (r.data as CapInfo[]).filter((c) => c.exposed);
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await load()).map((c) => ({ name: toolName(c.name), description: `${c.name}（${c.plugin} · ${c.scope}）`, inputSchema: (c.input && typeof c.input === "object" ? c.input : { type: "object" }) as { type: "object" } })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const caps = await load();
    const cap = caps.find((c) => toolName(c.name) === req.params.name);
    if (!cap) return { isError: true, content: [{ type: "text", text: `能力不存在或未对外开放：${req.params.name}` }] };
    const r = await callCapability(conn, cap.name, req.params.arguments ?? {});
    if (!r.ok) return { isError: true, content: [{ type: "text", text: JSON.stringify(r.error) }] };
    return { content: [{ type: "text", text: JSON.stringify(r.data) }] };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: "huhu://vault/summary", name: "Vault 概览", mimeType: "application/json" }] }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    if (req.params.uri !== "huhu://vault/summary") throw new Error(`未知资源：${req.params.uri}`);
    const r = await callCapability(conn, "vault.info", {});
    if (!r.ok) throw new Error(r.error.message);
    return { contents: [{ uri: req.params.uri, mimeType: "application/json", text: JSON.stringify(r.data) }] };
  });
  return server;
}
