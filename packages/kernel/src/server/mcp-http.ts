import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { errors, mcpSessionSubject, type Caller, type McpSessionIdentity, type McpSessionPrincipal } from "@huhu/contracts";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CancelledNotificationSchema, isInitializeRequest, isJSONRPCRequest, type RequestId } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "../mcp.js";
import { discoverCapabilities, unknownTool } from "./capability-http.js";
import type { EngineServerDeps } from "./http-app.js";
import { MAX_BODY_BYTES, MAX_CONCURRENT_PER_TOKEN } from "./ingress.js";
import type { TokenTable } from "./tokens.js";

type Entry = McpSessionIdentity["entry"];
type Credential = NonNullable<ReturnType<TokenTable["principal"]>>;
type Session = McpSessionPrincipal & {
  credential: Credential;
  transport: WebStandardStreamableHTTPServerTransport;
  requests: Map<RequestId, AbortController>;
  expires(): boolean;
  touch(): void;
  close(): void;
};

const idleMs = 30 * 60_000;
const maxAgeMs = 8 * 60 * 60_000;
const maxSessionsPerCredential = 16;
const maxSessions = 128;
const maxConcurrentPerSession = 8;
const requestSignal = new AsyncLocalStorage<AbortSignal | undefined>();
const hash = (handle: string) => createHash("sha256").update(handle).digest("hex");
const closed = () => ({ ok: false as const, error: errors.permissionDenied("MCP 会话已关闭").toJSON() });

function withSessionLifetime(response: Promise<Response>, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const abort = () => resolve(Response.json(closed(), { status: 401 }));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    void response.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** One registry belongs to one listener and is discarded with its Vault and service generation. */
export class McpSessions {
  private readonly generation = randomUUID();
  private readonly byHandle = new Map<string, Session>();
  private readonly bySubject = new Map<string, Session>();
  private readonly inflight = new Map<AbortSignal, number>();
  private readonly shutdown = new AbortController();

  constructor(
    private readonly deps: EngineServerDeps,
    private readonly resolveTool: (name: string) => string | undefined,
  ) {}

  enabled(entry: Entry): boolean {
    return entry === "mcp-http" ? this.deps.mcpHttp?.enabled() === true : this.deps.mcpStdioEnabled?.() === true;
  }

  private current(session: Session): boolean {
    if (session.expires() || !this.enabled(session.identity.entry)) session.close();
    return !session.signal.aborted;
  }

  hasPrincipal(caller: Caller, subject: string): boolean {
    const session = this.bySubject.get(subject);
    return !!session && session.identity.caller === caller && this.current(session);
  }

  find(entry: Entry, handle: string, credential: Credential): Session | undefined {
    if (!/^[A-Za-z0-9_-]{43}$/.test(handle)) return undefined;
    const session = this.byHandle.get(hash(handle));
    if (!session || session.identity.entry !== entry || session.credential.signal !== credential.signal || !this.current(session)) return undefined;
    session.touch();
    return session;
  }

  close(): void {
    this.shutdown.abort();
  }

  reserve(credential: Credential, session?: McpSessionPrincipal): (() => void) | undefined {
    const parent = credential.signal;
    const child = session?.signal;
    const parentCount = this.inflight.get(parent) ?? 0;
    const childCount = child ? (this.inflight.get(child) ?? 0) : 0;
    if (parentCount >= MAX_CONCURRENT_PER_TOKEN || childCount >= maxConcurrentPerSession) return undefined;
    this.inflight.set(parent, parentCount + 1);
    if (child) this.inflight.set(child, childCount + 1);
    return () => {
      this.release(parent);
      if (child) this.release(child);
    };
  }

  private release(key: AbortSignal): void {
    const remaining = (this.inflight.get(key) ?? 1) - 1;
    if (remaining > 0) this.inflight.set(key, remaining);
    else this.inflight.delete(key);
  }

  private create(entry: Entry, credential: Credential, service: AbortSignal | undefined): Session {
    const { caller, credentialId } = credential;
    if (caller !== "mcp" && caller !== "http") throw new Error("Invalid MCP credential");
    const identity: McpSessionIdentity = {
      caller,
      entry,
      credentialId,
      clientSessionId: randomUUID(),
      vaultInstance: this.deps.vaultInstance ?? this.generation,
      serviceGeneration: this.generation,
    };
    const subject = mcpSessionSubject(identity);
    const lifetime = new AbortController();
    const signal = AbortSignal.any([lifetime.signal, credential.signal, this.shutdown.signal, ...(service ? [service] : [])]);
    const deadline = Date.now() + maxAgeMs;
    let expires = deadline;
    let timer: NodeJS.Timeout | undefined;
    let digest: string | undefined;
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: () => randomBytes(32).toString("base64url"),
      onsessioninitialized: (handle) => {
        digest = hash(handle);
        this.byHandle.set(digest, session);
        session.touch();
      },
    });
    const session: Session = {
      identity,
      credential,
      signal,
      transport,
      requests: new Map(),
      expires: () => Date.now() >= expires,
      touch: () => {
        clearTimeout(timer);
        expires = Math.min(Date.now() + idleMs, deadline);
        timer = setTimeout(session.close, expires - Date.now());
        timer.unref();
      },
      close: () => lifetime.abort(),
    };
    this.bySubject.set(subject, session);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        if (digest) this.byHandle.delete(digest);
        this.bySubject.delete(subject);
        void transport.close();
      },
      { once: true },
    );
    const { dispatcher } = this.deps;
    const call = async (capability: string, input: unknown, intentKey?: string) => {
      if (!this.current(session)) return closed();
      const result = await dispatcher.call(caller, { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID(), ...(intentKey && { intentKey }) }, requestSignal.getStore(), session);
      return this.current(session) ? result : closed();
    };
    const mcp = createMcpServer(
      {
        list: () => (this.current(session) ? discoverCapabilities(dispatcher, caller) : []),
        callTool: async (name, input, intentKey) => {
          const capability = this.resolveTool(name);
          return !this.current(session) ? closed() : capability ? call(capability, input, intentKey) : unknownTool(name);
        },
        call,
        operation: (lookup) => (this.current(session) ? dispatcher.readOperation(caller, session, lookup) : closed()),
      },
      "0.0.1",
    );
    // In JSON response mode the SDK waits for a reply for each request ID.
    // Abort dispatch while allowing that reply to settle the HTTP response.
    mcp.setNotificationHandler(CancelledNotificationSchema, ({ params }) => {
      if (params.requestId !== undefined) session.requests.get(params.requestId)?.abort();
    });
    mcp.onclose = session.close;
    void mcp.connect(transport).catch(session.close);
    const onMessage = transport.onmessage;
    transport.onmessage = (message, extra) => {
      const signal = isJSONRPCRequest(message) ? session.requests.get(message.id)?.signal : undefined;
      requestSignal.run(signal, () => onMessage?.(message, extra));
    };
    return session;
  }

  async handle(entry: Entry, credential: Credential, req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("cache-control", "no-store");
    const send = (status: number, message: string, code = -32000) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
    };
    if (req.method !== "POST" && req.method !== "GET" && req.method !== "DELETE") return send(405, "方法不受支持");
    const raw = req.headers["mcp-session-id"];
    if (Array.isArray(raw)) return send(400, "Mcp-Session-Id 无效");
    let session = raw === undefined ? undefined : this.find(entry, raw, credential);
    if (raw !== undefined && !session) return send(404, "MCP 会话不存在", -32001);
    const release = this.reserve(credential, session);
    if (!release) return send(429, "并发调用过多");
    const requests = new Map<RequestId, AbortController>();
    res.once("close", () => {
      for (const request of requests.values()) request.abort();
      release();
    });
    const service = this.deps.mcpSignal?.();
    let body: unknown;
    if (req.method === "POST") {
      if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) return send(413, "请求体过大");
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of req as AsyncIterable<Buffer>) {
        total += chunk.length;
        if (total > MAX_BODY_BYTES) return send(413, "请求体过大");
        chunks.push(chunk);
      }
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return send(400, "请求不是合法 JSON", -32700);
      }
    }
    if (credential.signal.aborted || service?.aborted || this.shutdown.signal.aborted || !this.enabled(entry)) return send(401, "MCP 会话已关闭");
    const initializing = !session;
    if (initializing) {
      if (!isJSONRPCRequest(body) || !isInitializeRequest(body)) return send(400, "请先初始化 MCP 会话");
      const siblings = [...this.bySubject.values()].filter((item) => item.credential.signal === credential.signal).length;
      if (siblings >= maxSessionsPerCredential || this.bySubject.size >= maxSessions) return send(429, "MCP 会话数量已达上限");
      session = this.create(entry, credential, service);
    }
    if (!session || !this.current(session)) return send(404, "MCP 会话不存在", -32001);
    const admitted = session;
    for (const message of Array.isArray(body) ? body : [body]) {
      if (!isJSONRPCRequest(message)) continue;
      if (requests.has(message.id) || admitted.requests.has(message.id)) return send(400, "MCP 请求 ID 重复");
      requests.set(message.id, new AbortController());
    }
    for (const [id, controller] of requests) admitted.requests.set(id, controller);
    const listener = getRequestListener(
      async (webRequest) => {
        const response = admitted.transport.handleRequest(webRequest, { parsedBody: body });
        // DELETE closes the SDK transport itself and returns the termination response.
        const result = await (req.method === "DELETE" ? response : withSessionLifetime(response, admitted.signal));
        result.headers.set("cache-control", req.method === "GET" ? "no-store, no-transform" : "no-store");
        return result;
      },
      { overrideGlobalObjects: false },
    );
    try {
      await listener(req, res);
    } finally {
      for (const id of requests.keys()) admitted.requests.delete(id);
      if (initializing && (!admitted.transport.sessionId || res.statusCode !== 200)) admitted.close();
    }
  }
}
