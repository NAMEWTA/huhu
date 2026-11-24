import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function localUpstream(transport: "streamable-http" | "sse", options: { authorization?: string; resourcesOnly?: boolean } = {}) {
  const calls: { name: string; input: unknown }[] = [];
  const sse = new Map<string, SSEServerTransport>();
  const clients = new Set<Server>();
  let listRequests = 0;
  function endpoint() {
    const server = new Server({ name: transport, version: "1" }, { capabilities: options.resourcesOnly ? { resources: {} } : { tools: {} } });
    clients.add(server);
    server.onclose = () => { clients.delete(server); };
    if (!options.resourcesOnly) {
      server.setRequestHandler(ListToolsRequestSchema, async () => {
        listRequests++;
        return { tools: [{ name: "echo", description: "Local " + transport, inputSchema: { type: "object" }, outputSchema: { type: "object" } }] };
      });
      server.setRequestHandler(CallToolRequestSchema, async ({ params }): Promise<CallToolResult> => {
        calls.push({ name: params.name, input: params.arguments });
        return {
          content: [
            { type: "text", text: transport },
            { type: "image", data: "Zg==", mimeType: "image/png" },
            { type: "audio", data: "Zg==", mimeType: "audio/wav" },
            { type: "resource_link", uri: "fixture://remote/result", name: "Fixture link" },
          ],
          structuredContent: { transport, value: params.arguments?.["value"] },
          ...(params.arguments?.["value"] === "fail" && { isError: true }),
        };
      });
    }
    return server;
  }
  const http = createServer(async (request, response) => {
    try {
      if (options.authorization !== undefined && request.headers.authorization !== options.authorization) {
        response.writeHead(401, { "www-authenticate": 'Bearer realm="fixture"' }).end("local authorization required");
        return;
      }
      if (transport === "streamable-http") {
        const server = endpoint();
        const streamable = new StreamableHTTPServerTransport({ enableJsonResponse: true });
        await server.connect(streamable);
        try { await streamable.handleRequest(request, response); }
        finally { await server.close(); }
      } else if (request.url === "/sse") {
        const server = endpoint();
        const stream = new SSEServerTransport("/messages", response);
        sse.set(stream.sessionId, stream);
        response.on("close", () => { sse.delete(stream.sessionId); void server.close(); });
        await server.connect(stream);
      } else {
        const url = new URL(request.url ?? "", "http://127.0.0.1");
        const stream = sse.get(url.searchParams.get("sessionId") ?? "");
        if (stream) await stream.handlePostMessage(request, response);
        else response.writeHead(404).end();
      }
    } catch {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(http.address() as AddressInfo).port}/${transport === "sse" ? "sse" : "mcp"}`,
    calls,
    get listRequests() { return listRequests; },
    async close() {
      await Promise.all([...clients].map((server) => server.close()));
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
