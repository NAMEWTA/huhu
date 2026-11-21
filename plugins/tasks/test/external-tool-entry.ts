import type { CapabilityResult } from "@huhu/contracts";
import { expect } from "vitest";
import { run } from "../../../apps/cli/src/main.js";
import type { RunningEngine } from "../../../apps/engine/src/boot.js";
import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";

export const externalEntries = ["CLI", "HTTP MCP"] as const;
export type ExternalEntry = (typeof externalEntries)[number];

export async function externalToolEntry(entry: ExternalEntry, engine: RunningEngine, token: string) {
  const cli = async <T>(...args: string[]) => {
    const out: string[] = [];
    await run([...args, "--vault", engine.vault.root, "--json"], {
      out: (line) => out.push(line),
      err: (line) => out.push(line),
    });
    return JSON.parse(out.join("")) as CapabilityResult<T>;
  };
  if (entry === "CLI") {
    return {
      list: async () => {
        const result = await cli<{ name: string }[]>("capabilities", "list");
        if (!result.ok) throw Error(result.error.code);
        return result.data.map(({ name }) => name);
      },
      call: <T = unknown>(name: string, input: unknown) => cli<T>("call", name, "--input-json", JSON.stringify(input)),
    };
  }
  const endpoint = `http://127.0.0.1:${engine.port}/mcp`;
  const session = await openMcpSession(endpoint, token);
  const rpc = async (method: string, params: unknown) => {
    const response = await mcpRequest(endpoint, token, mcpRpc(method, params), session);
    expect(response.status).toBe(200);
    return ((await response.json()) as { result: { tools?: { name: string; inputSchema: unknown }[]; isError?: boolean; content?: { text: string }[]; structuredContent?: { data: unknown; opId?: string } } }).result;
  };
  return {
    list: async () =>
      (await rpc("tools/list", {})).tools!.map(({ name, inputSchema }) => {
        expect(inputSchema).toMatchObject({ type: "object" });
        return name.replaceAll("_", ".");
      }),
    call: async <T = unknown>(name: string, input: unknown): Promise<CapabilityResult<T>> => {
      const response = await rpc("tools/call", { name: name.replaceAll(".", "_"), arguments: input });
      if (response.isError) return { ok: false, error: JSON.parse(response.content![0]!.text) };
      return { ok: true, data: response.structuredContent?.data as T };
    },
  };
}
