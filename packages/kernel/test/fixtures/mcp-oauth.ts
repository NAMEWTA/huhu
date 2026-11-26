import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export async function loopbackOAuth(options: { beforeRefresh?: (subject: string) => Promise<void> } = {}) {
  const clients = new Map<string, string>();
  const proofs = new Map<string, { challenge: string; client: string; subject: string }>();
  const subjects = new Map<string, string>();
  const tokens = new Map<string, string>();
  const refreshSubjects: string[] = [];
  const calls: { subject: string; token: string }[] = [];
  let issued = 0;
  let refreshes = 0;
  let exchanges = 0;
  let origin = "";
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", origin);
    const json = (value: unknown, status = 200) => response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
    async function body() {
      let data = "";
      for await (const chunk of request) data += String(chunk);
      return data;
    }
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) return json({ resource: origin + "/mcp", authorization_servers: [origin] });
    if (url.pathname === "/.well-known/oauth-authorization-server") return json({
      issuer: origin, authorization_endpoint: origin + "/authorize", token_endpoint: origin + "/token", registration_endpoint: origin + "/register",
      response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"],
    });
    if (url.pathname === "/register") {
      const input = JSON.parse(await body()) as { redirect_uris: [string] };
      const id = randomUUID();
      clients.set(id, input.redirect_uris[0]);
      return json({ client_id: id, token_endpoint_auth_method: "none", redirect_uris: input.redirect_uris }, 201);
    }
    if (url.pathname === "/authorize") {
      const client = url.searchParams.get("client_id") ?? "";
      const redirect = clients.get(client);
      if (!redirect || redirect !== url.searchParams.get("redirect_uri") || url.searchParams.get("code_challenge_method") !== "S256") return json({ error: "invalid_request" }, 400);
      const code = randomUUID();
      proofs.set(code, { challenge: url.searchParams.get("code_challenge") ?? "", client, subject: url.searchParams.get("fixture_subject") ?? "fixture" });
      const callback = new URL(redirect);
      callback.searchParams.set("code", code);
      callback.searchParams.set("state", url.searchParams.get("state") ?? "");
      return response.writeHead(302, { location: callback.href }).end();
    }
    if (url.pathname === "/token") {
      const form = new URLSearchParams(await body());
      const client = form.get("client_id") ?? "";
      if (!clients.has(client)) return json({ error: "invalid_client" }, 400);
      if (form.get("grant_type") === "authorization_code") {
        const code = form.get("code") ?? "";
        const proof = proofs.get(code);
        const verifier = form.get("code_verifier") ?? "";
        if (!proof || proof.client !== client || proof.challenge !== createHash("sha256").update(verifier).digest("base64url")) return json({ error: "invalid_grant" }, 400);
        proofs.delete(code);
        subjects.set(client, proof.subject);
        exchanges++;
      } else {
        const subject = subjects.get(client);
        if (subject === undefined || form.get("grant_type") !== "refresh_token" || form.get("refresh_token") !== "synthetic-refresh-" + client) {
          return json({ error: "invalid_grant" }, 400);
        }
        refreshes++;
        refreshSubjects.push(subject);
        await options.beforeRefresh?.(subject);
      }
      const token = "synthetic-access-" + ++issued;
      tokens.set(token, subjects.get(client)!);
      return json({ access_token: token, token_type: "Bearer", refresh_token: "synthetic-refresh-" + client, expires_in: 30 });
    }
    if (url.pathname === "/mcp") {
      const token = request.headers.authorization?.slice("Bearer ".length) ?? "";
      const subject = tokens.get(token);
      if (subject === undefined) {
        return response.writeHead(401, { "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` }).end();
      }
      const mcp = new Server({ name: "oauth-fixture", version: "1" }, { capabilities: { tools: {} } });
      const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
      mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "echo", inputSchema: { type: "object" } }] }));
      mcp.setRequestHandler(CallToolRequestSchema, async () => {
        calls.push({ subject, token });
        return { content: [{ type: "text", text: "authorized" }], structuredContent: { subject } };
      });
      await mcp.connect(transport);
      try { await transport.handleRequest(request, response); }
      finally { await mcp.close(); }
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: origin + "/mcp",
    calls,
    refreshSubjects,
    get refreshes() { return refreshes; },
    get exchanges() { return exchanges; },
    async stop() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
