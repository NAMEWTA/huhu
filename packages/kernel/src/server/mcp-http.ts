import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { getRequestListener } from "@hono/node-server";
import { errors, mcpSessionSubject, type Caller, type McpSessionIdentity, type McpSessionPrincipal } from "@huhu/contracts";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CancelledNotificationSchema, isInitializeRequest, isJSONRPCRequest, type RequestId } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createMcpServer } from "../mcp.js";
import { discoverCapabilities, unknownTool } from "./capability-http.js";
import type { EngineServerDeps } from "./http-app.js";
import { MAX_BODY_BYTES, MAX_CONCURRENT_PER_TOKEN } from "./ingress.js";
import type { TokenTable } from "./tokens.js";

type Credential = NonNullable<ReturnType<TokenTable["principal"]>>;
type Session = McpSessionPrincipal & {
  credential: Credential;
  transport: WebStandardStreamableHTTPServerTransport;
  requests: Map<RequestId, AbortController>;
  expires(): boolean;
  touch(): void;
  close(): void;
};

export interface McpRecoveryOptions {
  directory: string;
  generation(): string | undefined;
}

const idleMs = 30 * 60_000;
const maxAgeMs = 8 * 60 * 60_000;
const recoveryAgeMs = 24 * 60 * 60_000;
const maxSessionsPerCredential = 16;
const maxSessions = 128;
const maxConcurrentPerSession = 8;
const requestSignal = new AsyncLocalStorage<AbortSignal | undefined>();
const hash = (handle: string) => createHash("sha256").update(handle).digest("hex");
const closed = () => ({ ok: false as const, error: errors.permissionDenied("MCP 会话已关闭").toJSON() });
const recoveryMeta = "huhu.dev/session-recovery";
const recoverySecret = /^[A-Za-z0-9_-]{43}$/;
const RecoveryRecords = z.array(
  z.strictObject({
    vaultInstance: z.string(),
    credentialId: z.string(),
    generation: z.string(),
    clientSessionId: z.uuidv4(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.int().positive(),
  }),
);
type RecoveryRecord = z.infer<typeof RecoveryRecords>[number];
type RecoveryBinding = Pick<RecoveryRecord, "vaultInstance" | "credentialId" | "generation">;

/** The writable Vault's Engine lock gives this file a single writer. Methods never yield between read and rename. */
class McpRecoveryStore {
  private readonly file: string;

  constructor(directory: string) {
    this.file = path.join(directory, "mcp-recovery.json");
  }

  private load(binding: RecoveryBinding): RecoveryRecord[] {
    const stat = lstatSync(this.file, { throwIfNoEntry: false });
    if (!stat) return [];
    if (!stat.isFile()) throw new Error("Invalid MCP recovery store");
    const file = openSync(this.file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = fstatSync(file);
      if (!opened.isFile() || (process.getuid && (opened.uid !== process.getuid() || (opened.mode & 0o077) !== 0))) throw new Error("MCP recovery store is not private");
      const now = Date.now();
      return RecoveryRecords.parse(JSON.parse(readFileSync(file, "utf8"))).filter((entry) => entry.expiresAt > now && entry.vaultInstance === binding.vaultInstance && entry.generation === binding.generation);
    } finally {
      closeSync(file);
    }
  }

  private save(records: RecoveryRecord[]): void {
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(records), { flag: "wx", mode: 0o600, flush: true });
      renameSync(temp, this.file);
      if (process.platform !== "win32") {
        const dir = openSync(path.dirname(this.file), "r");
        try {
          fsyncSync(dir);
        } finally {
          closeSync(dir);
        }
      }
    } finally {
      rmSync(temp, { force: true });
    }
  }

  lookup(binding: RecoveryBinding, proof: string): RecoveryRecord | undefined {
    const digest = hash(proof);
    return this.load(binding).find((entry) => entry.credentialId === binding.credentialId && entry.digest === digest);
  }

  issue(binding: RecoveryBinding, clientSessionId: string, previous?: RecoveryRecord): string {
    const entries = this.load(binding);
    const index = entries.findIndex((entry) => entry.clientSessionId === clientSessionId && entry.credentialId === binding.credentialId);
    if (previous ? entries[index]?.digest !== previous.digest : index >= 0) throw new Error("MCP recovery state changed");
    const proof = randomBytes(32).toString("base64url");
    const record = { ...binding, clientSessionId, digest: hash(proof), expiresAt: previous?.expiresAt ?? Date.now() + recoveryAgeMs };
    if (index >= 0) entries[index] = record;
    else entries.push(record);
    this.save(entries);
    return proof;
  }

  revoke(binding: RecoveryBinding, clientSessionId: string): void {
    const entries = this.load(binding);
    const remaining = entries.filter((entry) => entry.clientSessionId !== clientSessionId || entry.credentialId !== binding.credentialId);
    if (remaining.length < entries.length) this.save(remaining);
  }
}

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
  private readonly recovery?: McpRecoveryStore;

  constructor(
    private readonly deps: EngineServerDeps,
    private readonly resolveTool: (name: string) => string | undefined,
  ) {
    if (deps.mcpRecovery && deps.vaultInstance) this.recovery = new McpRecoveryStore(deps.mcpRecovery.directory);
  }

  enabled(): boolean {
    return this.deps.mcpHttp?.enabled() === true;
  }

  private current(session: Session): boolean {
    if (session.expires() || !this.enabled()) session.close();
    return !session.signal.aborted;
  }

  hasPrincipal(caller: Caller, subject: string): boolean {
    const session = this.bySubject.get(subject);
    return !!session && session.identity.caller === caller && this.current(session);
  }

  private find(handle: string, credential: Credential): Session | undefined {
    if (!/^[A-Za-z0-9_-]{43}$/.test(handle)) return undefined;
    const session = this.byHandle.get(hash(handle));
    if (!session || session.credential.signal !== credential.signal || !this.current(session)) return undefined;
    session.touch();
    return session;
  }

  close(): void {
    this.shutdown.abort();
  }

  private reserve(credential: Credential, session?: McpSessionPrincipal): (() => void) | undefined {
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

  private recoveryBinding(credential: Credential): RecoveryBinding | undefined {
    if (!this.recovery || !this.deps.vaultInstance) return undefined;
    const generation = this.deps.mcpRecovery?.generation();
    return generation ? { generation, vaultInstance: this.deps.vaultInstance, credentialId: credential.credentialId } : undefined;
  }

  private create(credential: Credential, service: AbortSignal | undefined, binding: RecoveryBinding | undefined, previous: RecoveryRecord | undefined): Session {
    const { caller, credentialId } = credential;
    if (caller !== "http") throw new Error("Invalid MCP credential");
    const identity: McpSessionIdentity = {
      caller,
      entry: "mcp-http",
      credentialId,
      clientSessionId: previous?.clientSessionId ?? randomUUID(),
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
      onsessionclosed: () => {
        if (binding) this.recovery?.revoke(binding, identity.clientSessionId);
      },
    });
    const session: Session = {
      identity,
      ...(previous && { recovered: true as const }),
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

  async handle(credential: Credential, req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("cache-control", "no-store");
    const send = (status: number, message: string, code = -32000) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
    };
    if (req.method !== "POST" && req.method !== "GET" && req.method !== "DELETE") return send(405, "方法不受支持");
    const raw = req.headers["mcp-session-id"];
    if (Array.isArray(raw)) return send(400, "Mcp-Session-Id 无效");
    let session = raw === undefined ? undefined : this.find(raw, credential);
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
    if (credential.signal.aborted || service?.aborted || this.shutdown.signal.aborted || !this.enabled()) return send(401, "MCP 会话已关闭");
    const initializing = !session;
    let binding: RecoveryBinding | undefined;
    let previous: RecoveryRecord | undefined;
    if (initializing) {
      if (!isJSONRPCRequest(body) || !isInitializeRequest(body)) return send(400, "请先初始化 MCP 会话");
      const siblings = [...this.bySubject.values()].filter((item) => item.credential.signal === credential.signal).length;
      if (siblings >= maxSessionsPerCredential || this.bySubject.size >= maxSessions) return send(429, "MCP 会话数量已达上限");
      binding = this.recoveryBinding(credential);
      const { [recoveryMeta]: proof, ...rest } = body.params._meta ?? {};
      if (proof !== undefined) {
        if (!binding || typeof proof !== "string" || !recoverySecret.test(proof)) return send(403, "MCP 会话无法恢复");
        previous = this.recovery?.lookup(binding, proof);
        if (!previous) return send(403, "MCP 会话无法恢复");
        const subject = mcpSessionSubject({ ...binding, entry: "mcp-http", caller: "http", clientSessionId: previous.clientSessionId, serviceGeneration: this.generation });
        if (this.bySubject.has(subject)) return send(403, "MCP 会话无法恢复");
        body = { ...body, params: { ...body.params, _meta: rest } };
      }
      session = this.create(credential, service, binding, previous);
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
        if (initializing && binding && result.ok && this.recovery) {
          const reply = (await result.json()) as { result?: { _meta?: Record<string, unknown> } };
          if (!this.current(admitted)) return Response.json(closed(), { status: 401, headers: { "cache-control": "no-store" } });
          if (reply.result) {
            try {
              const proof = this.recovery.issue(binding, admitted.identity.clientSessionId, previous);
              reply.result._meta = { ...reply.result._meta, [recoveryMeta]: proof };
            } catch {
              admitted.close();
              return Response.json({ error: "MCP 会话恢复状态无法保存" }, { status: 503, headers: { "cache-control": "no-store" } });
            }
          }
          result.headers.delete("content-length");
          return Response.json(reply, { status: result.status, headers: result.headers });
        }
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
