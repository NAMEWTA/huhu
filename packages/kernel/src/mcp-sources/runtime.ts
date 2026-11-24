import { randomUUID } from "node:crypto";
import { isHuhuError, type McpExternalRoute, type McpSessionPrincipal, type McpSource, type McpSourceCatalog } from "@huhu/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema, ErrorCode, McpError, ToolListChangedNotificationSchema, type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { canonicalJson } from "../idempotency.js";
import type { ExternalMcpTools } from "../mcp.js";
import { createMcpRouting, mcpRouteError } from "../mcp-routing.js";
import { discoverTools, projectTool, publicToolName } from "./catalog.js";
import { McpSourceStore } from "./store.js";
import { remoteAuthFailure, sourceTransport } from "./transport.js";

const initializeMs = 6_000;
const discoverMs = 8_000;
const callMs = 30_000;
const argumentsSchema = z.record(z.string(), z.unknown());

type Catalog = { fingerprint: string; catalogRevision: number; tools: Tool[]; state: McpSourceCatalog["state"]; checkedAt: string; diagnostic: string | null };
type Connection = { fingerprint: string; lifetime: AbortSignal; close(): Promise<void>; ready: Promise<Client>; refresh?: Promise<Catalog>; refreshAgain?: true };

export interface McpSourceRuntimeOptions {
  vaultInstance: string;
  publishSignal(): AbortSignal | undefined;
  endpoint?(): string | null;
  isBuiltinName(name: string): boolean;
  audit?(row: { at: string; entry: string; capability: string; code: string; ms: number }): void;
}

export class McpSourceRuntime implements ExternalMcpTools {
  private readonly lifetime = new AbortController();
  private readonly connections = new Map<string, Connection>();
  private readonly checks = new Map<string, AbortController>();
  private readonly closing = new Set<Promise<void>>();
  private readonly catalogs = new Map<string, Catalog>();
  private readonly probes = new Map<string, object>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  constructor(readonly store: McpSourceStore, private readonly options: McpSourceRuntimeOptions) {}

  get catalogRevision() { return this.revision; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed() {
    this.revision++;
    for (const listener of this.listeners) {
      try { listener(); } catch { /* a subscriber cannot affect the catalog */ }
    }
  }

  private requireApproved(source: McpSource) {
    if (source.configuration.transport === "stdio" && !this.store.approved(source)) {
      throw mcpRouteError("approval-required", { sourceId: source.sourceId });
    }
  }

  private connect(source: McpSource, lifetime: AbortSignal, changed?: () => void): Connection {
    lifetime.throwIfAborted();
    this.requireApproved(source);
    const transport = sourceTransport(source, () => this.options.endpoint?.());
    const client = new Client({ name: "huhu", version: "0.0.1" });
    let closed: Promise<void> | undefined;
    const abort = () => { void close(); };
    const close = () => {
      lifetime.removeEventListener("abort", abort);
      if (!closed) {
        closed = client.close().catch(() => undefined);
        this.closing.add(closed);
        void closed.finally(() => this.closing.delete(closed!));
      }
      return closed;
    };
    lifetime.addEventListener("abort", abort, { once: true });
    if (changed) client.setNotificationHandler(ToolListChangedNotificationSchema, changed);
    const ready = (async () => {
      const handshake = AbortSignal.any([lifetime, AbortSignal.timeout(initializeMs)]);
      let rejectWait: () => void = () => {};
      try {
        const deadline = new Promise<never>((_resolve, reject) => {
          rejectWait = () => reject(handshake.reason);
          handshake.addEventListener("abort", rejectWait, { once: true });
        });
        await Promise.race([client.connect(transport, { signal: handshake, timeout: initializeMs }), deadline]);
        lifetime.throwIfAborted();
        return client;
      } catch (error) {
        await close();
        throw error;
      } finally {
        handshake.removeEventListener("abort", rejectWait);
      }
    })();
    return { fingerprint: this.store.fingerprint(source), lifetime, close, ready };
  }

  private async fetchCatalog(connection: Connection): Promise<Tool[]> {
    const client = await connection.ready;
    return discoverTools(client, AbortSignal.any([connection.lifetime, AbortSignal.timeout(discoverMs)]));
  }

  private catalog(source: McpSource, tools: Tool[], state: McpSourceCatalog["state"], diagnostic: string | null): Catalog {
    const previous = this.catalogs.get(source.sourceId);
    const fingerprint = this.store.fingerprint(source);
    const changed = previous?.fingerprint !== fingerprint || previous.state !== state || canonicalJson(previous.tools) !== canonicalJson(tools);
    const next: Catalog = {
      fingerprint, tools, state, checkedAt: new Date().toISOString(), diagnostic,
      catalogRevision: changed ? this.revision + 1 : previous?.catalogRevision ?? this.revision,
    };
    this.catalogs.set(source.sourceId, next);
    if (changed) this.changed();
    return next;
  }

  private failed(source: McpSource, error: unknown): Catalog {
    const previous = this.catalogs.get(source.sourceId)?.tools ?? [];
    if (remoteAuthFailure(error)) return this.catalog(source, previous, "auth-required", "上游拒绝了认证");
    if (error instanceof Error && /Unsupported protocol version/i.test(error.message)) {
      return this.catalog(source, previous, "incompatible", "上游 MCP 协议版本不兼容");
    }
    const reason = isHuhuError(error) ? error.details?.reason : undefined;
    switch (reason) {
      case "approval-required": return this.catalog(source, previous, "approval-required", "需要本机执行许可");
      case "authentication-required": return this.catalog(source, previous, "auth-required", "上游需要认证");
      case "protocol-incompatible": return this.catalog(source, previous, "incompatible", "上游 MCP 传输或协议不兼容");
      default: return this.catalog(source, previous, "offline", isHuhuError(error) ? error.message : "无法完成 MCP 连接或目录发现");
    }
  }

  private live(source: McpSource): Connection {
    const service = this.options.publishSignal();
    if (!service || service.aborted || !source.enabled) throw mcpRouteError("source-disabled", { sourceId: source.sourceId });
    const id = source.sourceId;
    const existing = this.connections.get(id);
    if (existing?.fingerprint === this.store.fingerprint(source) && !existing.lifetime.aborted) return existing;
    if (existing) void existing.close();
    const lifetime = AbortSignal.any([this.lifetime.signal, service]);
    const connection = this.connect(source, lifetime, () => {
      if (this.connections.get(id) !== connection) return;
      if (connection.refresh) connection.refreshAgain = true;
      else void this.refreshLive(source, connection).catch(() => undefined);
    });
    this.connections.set(id, connection);
    void connection.ready.then((client) => {
      client.onclose = () => {
        if (this.connections.get(id) !== connection) return;
        this.connections.delete(id);
        if (!lifetime.aborted) this.failed(source, undefined);
      };
    }, () => { if (this.connections.get(id) === connection) this.connections.delete(id); });
    return connection;
  }

  private assertCurrent(source: McpSource, fingerprint: string, signal: AbortSignal): void {
    signal.throwIfAborted();
    const latest = this.store.source(source.sourceId);
    if (latest.enabled !== source.enabled || this.store.fingerprint(latest) !== fingerprint) throw mcpRouteError("stale-route");
    this.requireApproved(latest);
  }

  private refreshLive(source: McpSource, connection: Connection): Promise<Catalog> {
    if (connection.refresh) return connection.refresh;
    const probe = {};
    this.probes.set(source.sourceId, probe);
    const action = (async () => {
      try {
        this.assertCurrent(source, connection.fingerprint, connection.lifetime);
        const tools = await this.fetchCatalog(connection);
        this.assertCurrent(source, connection.fingerprint, connection.lifetime);
        if (this.connections.get(source.sourceId) !== connection || this.probes.get(source.sourceId) !== probe) throw mcpRouteError("stale-route");
        return this.catalog(source, tools, "ready", null);
      } catch (error) {
        if (this.connections.get(source.sourceId) !== connection || connection.lifetime.aborted || this.probes.get(source.sourceId) !== probe) throw error;
        this.connections.delete(source.sourceId);
        await connection.close();
        this.assertCurrent(source, connection.fingerprint, connection.lifetime);
        if (this.probes.get(source.sourceId) !== probe) throw mcpRouteError("stale-route");
        return this.failed(source, error);
      }
    })();
    connection.refresh = action;
    void action.finally(() => {
      delete connection.refresh;
      if (connection.refreshAgain && this.connections.get(source.sourceId) === connection && !connection.lifetime.aborted) {
        delete connection.refreshAgain;
        void this.refreshLive(source, connection).catch(() => undefined);
      }
    }).catch(() => undefined);
    return action;
  }

  async check(source: McpSource, signal: AbortSignal, useLive = false): Promise<Catalog> {
    this.store.files.assertWritable();
    const id = source.sourceId;
    let fingerprint = this.store.fingerprint(source);
    const service = this.options.publishSignal();
    const controller = new AbortController();
    this.checks.get(id)?.abort();
    this.checks.set(id, controller);
    const lifetime = AbortSignal.any([signal, controller.signal, this.lifetime.signal, ...(service ? [service] : []), AbortSignal.timeout(initializeMs + discoverMs)]);
    let connection: Connection | undefined;
    const probe = {};
    try {
      if (useLive && service && source.enabled) return await this.refreshLive(source, this.live(source));
      this.probes.set(id, probe);
      connection = this.connect(source, lifetime);
      fingerprint = connection.fingerprint;
      const tools = await this.fetchCatalog(connection);
      this.assertCurrent(source, fingerprint, lifetime);
      if (this.probes.get(id) !== probe) throw mcpRouteError("stale-route");
      return this.catalog(source, tools, "ready", null);
    } catch (error) {
      lifetime.throwIfAborted();
      if (!useLive && this.probes.get(id) !== probe) throw mcpRouteError("stale-route");
      if (this.store.fingerprint(this.store.source(id)) !== fingerprint) throw mcpRouteError("stale-route");
      return this.failed(source, error);
    } finally {
      if (connection) await connection.close();
      if (this.checks.get(id) === controller) this.checks.delete(id);
    }
  }

  invalidate(sourceId: string, remove = false) {
    this.probes.delete(sourceId);
    const pending = this.checks.get(sourceId);
    this.checks.delete(sourceId);
    pending?.abort();
    const connection = this.connections.get(sourceId);
    this.connections.delete(sourceId);
    if (connection) void connection.close();
    const prior = this.catalogs.get(sourceId);
    if (remove) this.catalogs.delete(sourceId);
    else if (prior) this.catalogs.set(sourceId, { ...prior, state: "stale", catalogRevision: this.revision + 1 });
    this.changed();
  }

  publicationChanged() { this.changed(); }

  async dispose(): Promise<void> {
    this.lifetime.abort();
    const connections = [...this.connections.values()];
    this.connections.clear();
    this.listeners.clear();
    await Promise.all([...connections.map((connection) => connection.close()), ...this.closing]);
  }

  private async ensureCatalogs(principal: McpSessionPrincipal, publicKey?: string) {
    principal.signal.throwIfAborted();
    if (!this.options.publishSignal()) return;
    const data = this.store.read().data;
    await Promise.all(data.sources.filter((source) => source.enabled).map(async (source) => {
      if (publicKey && !data.policy.selected.some((entry) => entry.sourceId === source.sourceId && entry.kind === "tool" &&
        this.publicKey(source, entry.upstreamIdentity, data) === publicKey)) return;
      const catalog = this.catalogs.get(source.sourceId);
      const active = this.connections.get(source.sourceId);
      if (catalog?.fingerprint === this.store.fingerprint(source) && catalog.state === "ready" && active && !active.lifetime.aborted) return;
      if (catalog?.state === "offline" && Date.now() - Date.parse(catalog.checkedAt) < 5_000) return;
      try { await this.refreshLive(source, this.live(source)); }
      catch (error) {
        if (principal.signal.aborted || !this.options.publishSignal()) return;
        if (isHuhuError(error) && error.details?.reason === "stale-route") return;
        const latest = this.store.read().data.sources.find(({ sourceId }) => sourceId === source.sourceId);
        if (latest?.enabled && this.store.fingerprint(latest) === this.store.fingerprint(source)) this.failed(source, error);
      }
    }));
  }

  view(source: McpSource) {
    const catalog = this.catalogs.get(source.sourceId);
    const approved = source.configuration.transport !== "stdio" || this.store.approved(source);
    const valid = catalog?.fingerprint === this.store.fingerprint(source) ? catalog : undefined;
    const state: McpSourceCatalog["state"] = !source.enabled ? "disabled" : !approved ? "approval-required" : valid?.state ?? "stale";
    return { source, state, approved, checkedAt: valid?.checkedAt ?? null, diagnostic: valid?.diagnostic ?? null };
  }

  catalogView(sourceId?: string) {
    const data = this.store.read().data;
    return {
      catalogRevision: this.revision, policyRevision: data.policy.revision,
      entries: data.sources.filter((source) => !sourceId || source.sourceId === sourceId).flatMap((source) => {
        const catalog = this.catalogs.get(source.sourceId);
        if (!catalog || catalog.fingerprint !== this.store.fingerprint(source) || catalog.state !== "ready") return [];
        return catalog.tools.map((tool) => ({
          sourceId: source.sourceId, upstreamIdentity: tool.name, publicKey: this.publicKey(source, tool.name, data),
          selected: data.policy.selected.some((item) => item.sourceId === source.sourceId && item.kind === "tool" && item.upstreamIdentity === tool.name),
          description: tool.description ?? "",
        }));
      }),
    };
  }

  private publicKey(source: McpSource, name: string, data: ReturnType<McpSourceStore["read"]>["data"]): string {
    return data.publicKeys[JSON.stringify([source.sourceId, name])] ?? publicToolName(source.namespace, name, this.options.isBuiltinName);
  }

  ownsName(name: string): boolean {
    try { return Object.values(this.store.read().data.publicKeys).includes(name); }
    catch { return false; }
  }

  private routing(principal: McpSessionPrincipal) {
    return createMcpRouting({
      readSnapshot: () => {
        const data = this.store.read().data;
        const routes: McpExternalRoute[] = [];
        const sources = new Map<string, McpSourceCatalog>();
        for (const source of data.sources) {
          const catalog = this.catalogs.get(source.sourceId);
          const view = this.view(source);
          const catalogRevision = catalog?.catalogRevision ?? 0;
          sources.set(source.sourceId, {
            sourceId: source.sourceId, configRevision: source.revision, authenticationRevision: 0, catalogRevision,
            state: view.state, complete: !!catalog && view.state === "ready", entries: [],
          });
          for (const tool of catalog?.tools ?? []) {
            const publicKey = this.publicKey(source, tool.name, data);
            if (!this.options.isBuiltinName(publicKey)) routes.push({
              origin: "external", kind: "tool", sourceId: source.sourceId, upstreamIdentity: tool.name, publicKey,
              configRevision: source.revision, authenticationRevision: 0, catalogRevision,
            });
          }
        }
        return { available: !!this.options.publishSignal() && !this.lifetime.signal.aborted, routes, sources, policy: data.policy,
          catalogRevision: this.revision, vaultInstance: this.options.vaultInstance, serviceGeneration: principal.identity.serviceGeneration };
      },
      authorize: (_route, owner) => owner.identity.entry === "mcp-http" && owner.identity.caller === "http",
      invokeBuiltin: async () => { throw mcpRouteError("unknown-entry"); },
      prepareExternal: async (route, signal) => {
        const source = this.store.source(route.sourceId);
        const connection = this.live(source);
        const client = await connection.ready;
        return async (input) => {
          if (signal.aborted) throw mcpRouteError("cancelled-before-send");
          const args = argumentsSchema.safeParse(input);
          if (!args.success) throw mcpRouteError("invalid-arguments");
          const current = this.connections.get(source.sourceId);
          if (current !== connection || connection.lifetime.aborted) throw mcpRouteError("stale-route");
          try {
            return await client.request({ method: "tools/call", params: { name: route.upstreamIdentity, arguments: args.data } }, CallToolResultSchema, {
              signal: AbortSignal.any([signal, connection.lifetime]), timeout: callMs,
            });
          } catch (error) {
            if (error instanceof McpError && error.code === ErrorCode.InvalidParams) throw mcpRouteError("invalid-arguments");
            throw mcpRouteError("upstream-result-unknown", { sourceId: source.sourceId, correlationId: randomUUID() });
          }
        };
      },
    });
  }

  async list(principal: McpSessionPrincipal): Promise<Tool[]> {
    await this.ensureCatalogs(principal);
    return this.routing(principal).list(principal, "tool").flatMap((route) => {
      if (route.origin !== "external") return [];
      const tool = this.catalogs.get(route.sourceId)?.tools.find(({ name }) => name === route.upstreamIdentity);
      return tool ? [projectTool(tool, route.publicKey)] : [];
    });
  }

  async call(principal: McpSessionPrincipal, publicKey: string, input: unknown): Promise<CallToolResult> {
    const started = Date.now();
    let code = "INTERNAL";
    try {
      if (principal.recovered) throw mcpRouteError("recovered-session");
      if (!this.routing(principal).list(principal, "tool").some((route) => route.publicKey === publicKey)) await this.ensureCatalogs(principal, publicKey);
      const reply = await this.routing(principal).call(principal, { kind: "tool", publicKey, input });
      if (reply.origin !== "external") throw mcpRouteError("unknown-entry");
      const result = CallToolResultSchema.parse(reply.result);
      code = result.isError ? "UPSTREAM_TOOL_ERROR" : "OK";
      return result;
    } catch (error) {
      if (isHuhuError(error)) code = error.code;
      throw error;
    } finally {
      try { this.options.audit?.({ at: new Date().toISOString(), entry: "mcp-http", capability: publicKey.slice(0, 128), code, ms: Date.now() - started }); }
      catch { /* audit I/O cannot change the call outcome */ }
    }
  }
}
