import { errors } from "@huhu/contracts";
import { createMcpServer as createShared } from "@huhu/kernel";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { callCapability, discoverCapabilities, readCapabilityOperation } from "./commands/call.js";
import type { Connection } from "./connect.js";

/** Each stdio server binds its Engine requests to one authenticated MCP session. */
export function createMcpServer(conn: Connection, version: string, opts: { watchToolsMs?: number } = { watchToolsMs: 2000 }) {
  const endpoint = `${conn.baseUrl}/api/v1/mcp`;
  const headers = { authorization: `Bearer ${conn.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" };
  type BoundConnection = Connection & { mcpSession: string };
  const denied = () => ({ ok: false as const, error: errors.permissionDenied("MCP 会话不可用").toJSON() });
  let opening: Promise<BoundConnection | undefined> | undefined;
  let closing: Promise<void> | undefined;

  async function initialize(): Promise<BoundConnection | undefined> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "huhu-stdio", version } } }),
    });
    const mcpSession = response.headers.get("mcp-session-id");
    await response.arrayBuffer();
    if (response.status === 404) return undefined;
    if (!response.ok || !mcpSession) throw new Error(`Engine 无法初始化 MCP 会话（HTTP ${response.status}）`);
    return { ...conn, mcpSession };
  }

  async function bound() {
    if (closing) return undefined;
    // A disabled service can be enabled before the first admission. Once bound,
    // the process keeps that identity even if the Engine later rejects it.
    const attempt = (opening ??= initialize());
    let connection: BoundConnection | undefined;
    try {
      connection = await attempt;
      return closing ? undefined : connection;
    } finally {
      if (!connection && opening === attempt) opening = undefined;
    }
  }

  const server = createShared(
    {
      list: async () => {
        const connection = await bound();
        if (!connection) return [];
        const r = await discoverCapabilities(connection);
        if (r.ok) return r.data;
        if (r.error.code === "PERMISSION_DENIED") return [];
        throw new Error(r.error.message);
      },
      callTool: async (name, input, intentKey) => {
        const connection = await bound();
        return connection ? callCapability(connection, name, input, "mcp", intentKey) : denied();
      },
      call: async (cap, input) => {
        const connection = await bound();
        return connection ? callCapability(connection, cap, input) : denied();
      },
      operation: async (lookup) => {
        const connection = await bound();
        return connection ? readCapabilityOperation(connection, lookup) : denied();
      },
    },
    version,
    opts,
  );
  const stopWatching = server.onclose;
  const closeSession = () =>
    (closing ??= (async () => {
      const connection = await opening;
      if (!connection) return;
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { ...headers, "mcp-session-id": connection.mcpSession, "mcp-protocol-version": LATEST_PROTOCOL_VERSION },
        signal: AbortSignal.timeout(1000),
      });
      await response.body?.cancel();
    })().catch(() => undefined));
  server.onclose = () => {
    stopWatching?.();
    void closeSession();
  };
  return Object.assign(server, { closeSession });
}
