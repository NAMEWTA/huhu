import { createMcpServer as createShared } from "@huhu/kernel";
import { callCapability, discoverCapabilities, readCapabilityOperation } from "./commands/call.js";
import type { Connection } from "./connect.js";

/** stdio MCP：能力清单与调用都经 Engine 的 HTTP 接口（身份由所用令牌决定）；每次 tools/list 重新读取开放状态。 */
export function createMcpServer(conn: Connection, version: string, opts: { watchToolsMs?: number } = { watchToolsMs: 2000 }) {
  return createShared(
    {
      list: async () => {
        const r = await discoverCapabilities(conn);
        if (!r.ok) throw new Error(r.error.message);
        return r.data;
      },
      callTool: (name, input, intentKey) => callCapability(conn, name, input, "mcp", intentKey),
      call: (cap, input) => callCapability(conn, cap, input),
      operation: (lookup) => readCapabilityOperation(conn, lookup),
    },
    version,
    opts,
  );
}
