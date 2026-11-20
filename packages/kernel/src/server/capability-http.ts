import type { IncomingMessage } from "node:http";
import { CapabilityOperationLookupSchema, CapabilityRequestSchema, errors, toJsonSchema, type Caller } from "@huhu/contracts";
import { type Context, type Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { Dispatcher } from "../dispatcher.js";
import { MAX_BODY_BYTES, MAX_CONCURRENT_PER_TOKEN } from "./ingress.js";

interface Principal {
  caller: Caller;
  subject?: string;
  signal?: AbortSignal;
}

export interface CapabilityHttpEnv {
  Bindings: { incoming: IncomingMessage };
  Variables: { principal: Principal };
}

export type AuthorizeCapabilityHttp = (context: Context<CapabilityHttpEnv>) => Principal | Response;

export function discoverCapabilities(dispatcher: Dispatcher, caller: Caller) {
  return dispatcher
    .discover(caller)
    .map((def) => ({ name: def.name, plugin: def.plugin, scope: def.scope, input: toJsonSchema(def.input), output: toJsonSchema(def.output, "output"), ...(def.idempotency === "durable" && { durableIntent: true as const }) }));
}

export const unknownTool = (name: string) => ({ ok: false as const, error: errors.capabilityNotFound(name).toJSON() });

/** 两个监听器共用请求契约和 Dispatcher，认证由各自的宿主提供。 */
export function registerCapabilityHttp(app: Hono<CapabilityHttpEnv>, dispatcher: Dispatcher, authorize: AuthorizeCapabilityHttp, inflight = new Map<Caller, number>(), resolveTool?: (name: string) => string | undefined): void {
  const authenticate = createMiddleware<CapabilityHttpEnv>(async (c, next) => {
    const admitted = authorize(c);
    if (admitted instanceof Response) return admitted;
    c.set("principal", admitted);
    await next();
  });
  app.use("/api/*", authenticate);

  app.post("/api/v1/call", async (c) => {
    const { caller, subject, signal } = c.get("principal");
    const mcpTool = c.req.query("nameFormat") === "mcp";
    if (mcpTool && (caller !== "mcp" || !resolveTool)) return c.json({ error: "该令牌身份不能提交 MCP 工具名" }, 403);
    const declared = Number(c.req.header("content-length") ?? 0);
    if (Number.isNaN(declared) || declared > MAX_BODY_BYTES) return c.json({ error: "请求体过大" }, 413);

    // 无 Content-Length 的请求也按实际字节限制读取。
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = c.req.raw.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) {
          await reader.cancel();
          return c.json({ error: "请求体过大" }, 413);
        }
        chunks.push(value);
      }
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return c.json({ error: "请求不是合法 JSON" }, 400);
    }
    const req = CapabilityRequestSchema.safeParse(body);
    if (!req.success) return c.json({ error: "请求格式错误", issues: req.error.issues }, 400);
    if (signal?.aborted) return c.json({ error: "会话不可用" }, 401);
    const n = inflight.get(caller) ?? 0;
    if (n >= MAX_CONCURRENT_PER_TOKEN) return c.json({ error: "并发调用过多" }, 429);
    inflight.set(caller, n + 1);
    try {
      const capability = mcpTool ? resolveTool?.(req.data.capability) : req.data.capability;
      if (!capability) return c.json(unknownTool(req.data.capability));
      const requestSignal = signal ? AbortSignal.any([c.req.raw.signal, signal]) : c.req.raw.signal;
      return c.json(await dispatcher.call(caller, { ...req.data, capability }, requestSignal, subject));
    } finally {
      const remaining = (inflight.get(caller) ?? 1) - 1;
      if (remaining > 0) inflight.set(caller, remaining);
      else inflight.delete(caller);
    }
  });

  app.get("/api/v1/capabilities", (c) => c.json(discoverCapabilities(dispatcher, c.get("principal").caller)));
  app.get("/api/v1/operations", (c) => {
    const { caller, subject = caller } = c.get("principal");
    const lookup = CapabilityOperationLookupSchema.safeParse(c.req.query());
    if (!lookup.success) return c.json({ ok: false, error: errors.invalidInput("操作查询参数不符合要求", lookup.error.issues).toJSON() });
    return c.json(dispatcher.readOperation(caller, subject, lookup.data));
  });
}
