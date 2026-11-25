import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function localUpstream(transport: "streamable-http" | "sse", options: {
  authorization?: string;
  authorize?: (header: string | undefined, url: string | undefined) => boolean;
  resourcesOnly?: boolean;
  requiresSampling?: boolean;
} = {}) {
  const calls: { name: string; input: unknown }[] = [];
  const admissions: { authorization: string | undefined; url: string | undefined }[] = [];
  const sse = new Map<string, SSEServerTransport>();
  const clients = new Set<Server>();
  let listRequests = 0;
  function endpoint() {
    const server = new Server({ name: transport, version: "1" }, {
      capabilities: options.resourcesOnly ? { resources: {} } : { tools: {} },
      ...(options.requiresSampling && { enforceStrictCapabilities: true }),
    });
    clients.add(server);
    server.onclose = () => { clients.delete(server); };
    if (options.resourcesOnly) {
      server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
      server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }));
    } else {
      server.setRequestHandler(ListToolsRequestSchema, async () => {
        listRequests++;
        if (options.requiresSampling) {
          await server.createMessage({ messages: [{ role: "user", content: { type: "text", text: "fixture" } }], maxTokens: 1 });
        }
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
      if ((options.authorization !== undefined && request.headers.authorization !== options.authorization) ||
          (options.authorize && !options.authorize(request.headers.authorization, request.url))) {
        response.writeHead(401, { "www-authenticate": 'Bearer realm="fixture"' }).end("local authorization required");
        return;
      }
      admissions.push({ authorization: request.headers.authorization, url: request.url });
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
    admissions,
    get listRequests() { return listRequests; },
    async close() {
      await Promise.all([...clients].map((server) => server.close()));
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
