import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, type CallToolResult, type ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";

export async function localUpstream(
  transport: "streamable-http" | "sse",
  options: {
    authorization?: string;
    authorize?: (header: string | undefined, url: string | undefined) => boolean;
    advertise?: "tools" | "resources" | "prompts" | "none";
    requires?: "sampling" | "roots" | "elicitation";
  } = {},
) {
  const calls: { name: string; input: unknown }[] = [];
  const admissions: { authorization: string | undefined; url: string | undefined }[] = [];
  const requests: string[] = [];
  const rejections: { authorization: string | undefined; method: string | undefined }[] = [];
  const sse = new Map<string, SSEServerTransport>();
  const clients = new Set<Server>();
  let listRequests = 0;
  const advertised = options.advertise ?? "tools";
  const capabilities: ServerCapabilities = advertised === "none" ? {} : { [advertised]: {} };
  function endpoint() {
    const server = new Server(
      { name: transport, version: "1" },
      {
        capabilities,
        ...(options.requires && { enforceStrictCapabilities: true }),
      },
    );
    clients.add(server);
    server.onclose = () => {
      clients.delete(server);
    };
    if (advertised === "resources") {
      server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ name: "Readme", uri: "fixture://docs/readme" }] }));
      server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }));
    } else if (advertised === "prompts") {
      server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [{ name: "review" }] }));
    } else if (advertised === "tools") {
      server.setRequestHandler(ListToolsRequestSchema, async () => {
        listRequests++;
        if (options.requires === "sampling") {
          await server.createMessage({ messages: [{ role: "user", content: { type: "text", text: "fixture" } }], maxTokens: 1 });
        }
        if (options.requires === "roots") await server.listRoots();
        if (options.requires === "elicitation") await server.elicitInput({ message: "fixture", requestedSchema: { type: "object", properties: {} } });
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
  async function connect(server: Server, transport: Transport) {
    await server.connect(transport);
    const receive = transport.onmessage;
    transport.onmessage = (message, extra) => {
      if ("method" in message) requests.push(message.method);
      receive?.(message, extra);
    };
  }
  const http = createServer(async (request, response) => {
    try {
      if ((options.authorization !== undefined && request.headers.authorization !== options.authorization) || (options.authorize && !options.authorize(request.headers.authorization, request.url))) {
        let body = "";
        for await (const chunk of request) body += String(chunk);
        const method = body ? (JSON.parse(body) as { method?: string }).method : undefined;
        rejections.push({ authorization: request.headers.authorization, method });
        response.writeHead(401, { "www-authenticate": 'Bearer realm="fixture"' }).end("local authorization required");
        return;
      }
      admissions.push({ authorization: request.headers.authorization, url: request.url });
      if (transport === "streamable-http") {
        const server = endpoint();
        const streamable = new StreamableHTTPServerTransport({ enableJsonResponse: true });
        await connect(server, streamable);
        try {
          await streamable.handleRequest(request, response);
        } finally {
          await server.close();
        }
      } else if (request.url === "/sse") {
        const server = endpoint();
        const stream = new SSEServerTransport("/messages", response);
        sse.set(stream.sessionId, stream);
        response.on("close", () => {
          sse.delete(stream.sessionId);
          void server.close();
        });
        await connect(server, stream);
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
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", () => {
      http.off("error", reject);
      resolve();
    });
  });
  return {
    url: `http://127.0.0.1:${(http.address() as AddressInfo).port}/${transport === "sse" ? "sse" : "mcp"}`,
    calls,
    admissions,
    requests,
    rejections,
    get listRequests() {
      return listRequests;
    },
    async close() {
      await Promise.all([...clients].map((server) => server.close()));
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
