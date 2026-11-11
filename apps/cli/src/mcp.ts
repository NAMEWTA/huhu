import { createMcpServer as createShared } from "@huhu/kernel";
import { callCapability } from "./commands/call.js";
import type { Connection } from "./connect.js";

interface CapInfo {
  name: string;
  plugin: string;
  scope: string;
  exposed: boolean;
  input: unknown;
}

/** stdio MCP：能力清单与调用都经 Engine 的 HTTP 接口（身份由所用令牌决定）；每次 tools/list 重新读取开放状态。 */
export function createMcpServer(conn: Connection, version: string) {
  return createShared(
    {
      list: async () => {
        const r = await callCapability(conn, "capabilities.list", {});
        if (!r.ok) throw new Error(r.error.message);
        return (r.data as CapInfo[]).filter((c) => c.exposed);
      },
      call: (cap, input) => callCapability(conn, cap, input),
    },
    version,
  );
}
