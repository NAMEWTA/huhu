import { createHash, randomUUID } from "node:crypto";
import { isHuhuError, MCP_ENTRY_KINDS, type McpEntryKind, type McpExternalRoute, type McpSessionPrincipal, type McpSource, type McpSourceCatalog } from "@huhu/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema, ErrorCode, GetPromptResultSchema, McpError, PromptListChangedNotificationSchema, ReadResourceResultSchema, ResourceListChangedNotificationSchema, ToolListChangedNotificationSchema, type CallToolResult, type ContentBlock, type GetPromptResult, type ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { canonicalJson } from "../idempotency.js";
import type { AuditRecord } from "../gateway-audit.js";
import { builtinMcpDirectory, type ExternalMcpTools } from "../mcp.js";
import { createMcpRouting, mcpRouteError, type McpUpstreamResult } from "../mcp-routing.js";
import { discoverCatalog, matchesTemplate, projectTool, projectUri, publicToolName, resourcePrefix, type DirectoryEntry } from "./catalog.js";
import { McpSourceStore } from "./store.js";
import { remoteAuthFailure, sourceTransport } from "./transport.js";
import type { McpCredentialMaterial, McpCredentials } from "./credentials.js";

const initializeMs = 6_000;
const discoverMs = 8_000;
const callMs = 30_000;
const listWaitMs = 750;
const reconnectDelays = [250, 1_000, 3_000];
const argumentsSchema = z.record(z.string(), z.unknown());

type Catalog = { fingerprint: string; catalogRevision: number; entries: DirectoryEntry[]; state: McpSourceCatalog["state"]; checkedAt: string; diagnostic: string | null };
type Connection = { fingerprint: string; lifetime: AbortSignal; discovered: boolean; close(): Promise<void>; ready: Promise<Client>; renewAuthentication(): Promise<void>; detach?: () => void; refresh?: Promise<Catalog>; refreshAgain?: true };
type Retry = { fingerprint: string; service: AbortSignal; attempts: number; cancel(): void };

async function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => undefined);
    throw signal.reason;
  }
  let abort!: () => void;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    })]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export interface McpSourceRuntimeOptions {
  vaultInstance: string;
  publishSignal(): AbortSignal | undefined;
  endpoint?(): string | null;
  builtinDirectory?(): ReturnType<typeof builtinMcpDirectory>;
  catalogChanged?(): void;
  isBuiltinName(name: string): boolean;
  audit?(row: AuditRecord): void;
}

export class McpSourceRuntime implements ExternalMcpTools {
  private readonly lifetime = new AbortController();
  private readonly connections = new Map<string, Connection>();
  private readonly retiring = new Map<string, Promise<void>>();
  private readonly retries = new Map<string, Retry>();
  private readonly checks = new Map<string, AbortController>();
  private readonly closing = new Set<Promise<void>>();
  private readonly catalogs = new Map<string, Catalog>();
  private readonly probes = new Map<string, object>();
  private readonly listeners = new Set<(kinds: readonly McpEntryKind[]) => void>();
  private revision = 0;

  constructor(readonly store: McpSourceStore, private readonly options: McpSourceRuntimeOptions, private readonly credentials?: McpCredentials) {}

  get catalogRevision() { return this.revision; }

  subscribe(listener: (kinds: readonly McpEntryKind[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(kinds: readonly McpEntryKind[] = MCP_ENTRY_KINDS) {
    this.revision++;
    this.options.catalogChanged?.();
    for (const listener of this.listeners) {
      try { listener(kinds); } catch { /* a subscriber cannot affect the catalog */ }
    }
  }

  private requireApproved(source: McpSource) {
    if (source.configuration.transport === "stdio" && !this.store.approved(source)) {
      throw mcpRouteError("approval-required", { sourceId: source.sourceId });
    }
  }

  private connect(source: McpSource, scope: AbortSignal, changed?: () => void): Connection {
    scope.throwIfAborted();
    this.requireApproved(source);
    const owner = new AbortController();
    const lifetime = AbortSignal.any([scope, owner.signal]);
    const client = new Client({ name: "huhu", version: "0.0.1" });
    let material: McpCredentialMaterial | undefined;
    const renewAuthentication = async () => {
      if (material?.kind === "oauth" && material.expiresAt !== null && material.expiresAt <= Date.now() + 5_000) {
        material = await this.credentials?.values(source, lifetime);
      }
    };
    let closed: Promise<void> | undefined;
    const abort = () => { void close(); };
    const close = () => {
      scope.removeEventListener("abort", abort);
      if (!closed) {
        owner.abort();
        closed = Promise.resolve().then(() => client.close()).catch(() => undefined);
        this.closing.add(closed);
        void closed.finally(() => this.closing.delete(closed!));
      }
      return closed;
    };
    scope.addEventListener("abort", abort, { once: true });
    if (changed) {
      client.setNotificationHandler(ToolListChangedNotificationSchema, changed);
      client.setNotificationHandler(ResourceListChangedNotificationSchema, changed);
      client.setNotificationHandler(PromptListChangedNotificationSchema, changed);
    }
    const ready = (async () => {
      const handshake = AbortSignal.any([lifetime, AbortSignal.timeout(initializeMs)]);
      try {
        const retiring = this.retiring.get(source.sourceId);
        if (retiring) await untilAborted(retiring, handshake);
        material = await untilAborted(Promise.resolve(this.credentials?.values(source, handshake)), handshake);
        handshake.throwIfAborted();
        const transport = sourceTransport(source, () => this.options.endpoint?.(), () => material);
        await untilAborted(client.connect(transport, { signal: handshake, timeout: initializeMs }), handshake);
        lifetime.throwIfAborted();
        return client;
      } catch (error) {
        await close();
        throw error;
      }
    })();
    return { fingerprint: this.store.fingerprint(source), lifetime, discovered: false, close, ready, renewAuthentication };
  }

  private async fetchCatalog(connection: Connection): Promise<DirectoryEntry[]> {
    const client = await connection.ready;
    const signal = AbortSignal.any([connection.lifetime, AbortSignal.timeout(discoverMs)]);
    await untilAborted(connection.renewAuthentication(), signal);
    return discoverCatalog(client, signal);
  }

  private catalog(source: McpSource, entries: DirectoryEntry[], state: McpSourceCatalog["state"], diagnostic: string | null): Catalog {
    const previous = this.catalogs.get(source.sourceId);
    const fingerprint = this.store.fingerprint(source);
    const changed = MCP_ENTRY_KINDS.filter((kind) =>
      (previous?.fingerprint !== fingerprint || previous.state !== state || canonicalJson(previous.entries.filter((entry) => entry.kind === kind)) !== canonicalJson(entries.filter((entry) => entry.kind === kind))) &&
      (entries.some((entry) => entry.kind === kind) || previous?.entries.some((entry) => entry.kind === kind)));
    const stateChanged = previous?.fingerprint !== fingerprint || previous.state !== state || changed.length > 0;
    const next: Catalog = {
      fingerprint, entries, state, checkedAt: new Date().toISOString(), diagnostic,
      catalogRevision: stateChanged ? this.revision + 1 : previous?.catalogRevision ?? this.revision,
    };
    this.catalogs.set(source.sourceId, next);
    if (stateChanged) this.changed(changed);
    return next;
  }

  private failed(source: McpSource, error: unknown): Catalog {
    const previous = this.catalogs.get(source.sourceId)?.entries ?? [];
    if (remoteAuthFailure(error)) return this.catalog(source, previous, "auth-required", "上游拒绝了认证");
    if (error instanceof Error && /\b(?:unsupported protocol version|server's protocol version is not supported)\b/i.test(error.message)) {
      return this.catalog(source, previous, "incompatible", "上游 MCP 协议版本不兼容");
    }
    if (error instanceof McpError) {
      const capability = /^MCP error -?\d+: Client does not support (sampling|(?:URL |form )?elicitation|listing roots)\b/i.exec(error.message)?.[1]?.toLowerCase();
      if (capability) return this.catalog(source, previous, "incompatible", `上游需要 Huhu 未提供的 MCP 客户端能力（${capability}）`);
    }
    const reason = isHuhuError(error) ? error.details?.reason : undefined;
    switch (reason) {
      case "approval-required": return this.catalog(source, previous, "approval-required", "需要本机执行许可");
      case "authentication-required": return this.catalog(source, previous, "auth-required", "上游需要认证");
      case "protocol-incompatible": return this.catalog(source, previous, "incompatible", "上游 MCP 传输或协议不兼容");
      default: return this.catalog(source, previous, "offline", isHuhuError(error) ? error.message : "无法完成 MCP 连接或目录发现");
    }
  }

  private stop(sourceId: string, connection: Connection): Promise<void> {
    if (this.connections.get(sourceId) === connection) this.connections.delete(sourceId);
    connection.detach?.();
    const closed = connection.close();
    this.retiring.set(sourceId, closed);
    void closed.then(() => {
      if (this.retiring.get(sourceId) === closed) this.retiring.delete(sourceId);
    });
    return closed;
  }

  private clearRetry(id: string) {
    this.retries.get(id)?.cancel();
    this.retries.delete(id);
  }

  private retry(source: McpSource, service: AbortSignal, catalog: Catalog) {
    const id = source.sourceId;
    if (service.aborted || this.lifetime.signal.aborted || catalog.state !== "offline") {
      this.clearRetry(id);
      return;
    }
    const previous = this.retries.get(id);
    const attempts = previous?.service === service && previous.fingerprint === catalog.fingerprint ? previous.attempts : 0;
    this.clearRetry(id);
    const delay = reconnectDelays[attempts];
    const timer = delay === undefined ? undefined : setTimeout(() => {
      if (service.aborted || this.lifetime.signal.aborted) return;
      try {
        this.assertCurrent(source, catalog.fingerprint, service);
        void this.refreshLive(source, this.live(source)).catch(() => undefined);
      } catch { this.clearRetry(id); }
    }, delay);
    timer?.unref();
    const abort = () => this.clearRetry(id);
    this.retries.set(id, {
      fingerprint: catalog.fingerprint, service, attempts: attempts + 1,
      cancel: () => { clearTimeout(timer); service.removeEventListener("abort", abort); },
    });
    service.addEventListener("abort", abort, { once: true });
  }

  private live(source: McpSource): Connection {
    const service = this.options.publishSignal();
    if (!service || service.aborted || !source.enabled) throw mcpRouteError("source-disabled", { sourceId: source.sourceId });
    const id = source.sourceId;
    const existing = this.connections.get(id);
    if (existing?.fingerprint === this.store.fingerprint(source) && !existing.lifetime.aborted) return existing;
    if (existing) void this.stop(id, existing);
    const lifetime = AbortSignal.any([this.lifetime.signal, service]);
    const connection = this.connect(source, lifetime, () => {
      if (this.connections.get(id) !== connection) return;
      if (connection.refresh) connection.refreshAgain = true;
      else void this.refreshLive(source, connection).catch(() => undefined);
    });
    this.connections.set(id, connection);
    const stop = () => {
      this.clearRetry(id);
      if (this.connections.get(id) === connection) {
        void this.stop(id, connection);
        const previous = this.catalogs.get(id);
        if (previous) this.catalog(source, previous.entries, "stale", null);
      }
    };
    lifetime.addEventListener("abort", stop, { once: true });
    connection.detach = () => lifetime.removeEventListener("abort", stop);
    void connection.ready.then((client) => {
      client.onclose = () => {
        if (this.connections.get(id) !== connection || connection.refresh) return;
        void this.stop(id, connection);
        if (!lifetime.aborted) this.retry(source, service, this.failed(source, undefined));
      };
    }, () => undefined);
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
    const service = this.options.publishSignal();
    if (!service) return Promise.reject(mcpRouteError("source-disabled"));
    const probe = {};
    this.probes.set(source.sourceId, probe);
    const action = (async () => {
      try {
        this.assertCurrent(source, connection.fingerprint, connection.lifetime);
        const entries = await this.fetchCatalog(connection);
        this.assertCurrent(source, connection.fingerprint, connection.lifetime);
        if (this.connections.get(source.sourceId) !== connection || this.probes.get(source.sourceId) !== probe) throw mcpRouteError("stale-route");
        connection.discovered = true;
        this.clearRetry(source.sourceId);
        return this.catalog(source, entries, "ready", null);
      } catch (error) {
        if (this.connections.get(source.sourceId) !== connection || service.aborted || this.probes.get(source.sourceId) !== probe) throw error;
        const closing = this.stop(source.sourceId, connection);
        this.assertCurrent(source, connection.fingerprint, service);
        if (this.probes.get(source.sourceId) !== probe) throw mcpRouteError("stale-route");
        const catalog = this.failed(source, error);
        this.retry(source, service, catalog);
        await closing;
        return catalog;
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
      if (useLive && service && source.enabled) {
        this.clearRetry(id);
        return await untilAborted(this.refreshLive(source, this.live(source)), lifetime);
      }
      const previousProbe = this.probes.get(id);
      if (!previousProbe) this.probes.set(id, probe);
      connection = this.connect(source, lifetime);
      fingerprint = connection.fingerprint;
      const entries = await this.fetchCatalog(connection);
      this.assertCurrent(source, fingerprint, lifetime);
      if (this.probes.get(id) !== (previousProbe ?? probe)) throw mcpRouteError("stale-route");
      if (this.connections.has(id) || this.retries.has(id)) return {
        fingerprint, entries, state: "ready", checkedAt: new Date().toISOString(), diagnostic: null, catalogRevision: this.revision,
      };
      return this.catalog(source, entries, "ready", null);
    } catch (error) {
      lifetime.throwIfAborted();
      if (isHuhuError(error) && error.details?.reason === "stale-route") throw error;
      if (this.store.fingerprint(this.store.source(id)) !== fingerprint) throw mcpRouteError("stale-route");
      return this.failed(source, error);
    } finally {
      if (connection) await connection.close();
      if (this.checks.get(id) === controller) this.checks.delete(id);
    }
  }

  invalidate(sourceId: string, remove = false) {
    this.probes.delete(sourceId);
    this.clearRetry(sourceId);
    const pending = this.checks.get(sourceId);
    this.checks.delete(sourceId);
    pending?.abort();
    const connection = this.connections.get(sourceId);
    if (connection) void this.stop(sourceId, connection);
    const prior = this.catalogs.get(sourceId);
    if (remove) this.catalogs.delete(sourceId);
    else if (prior) this.catalogs.set(sourceId, { ...prior, state: "stale", catalogRevision: this.revision + 1 });
    this.changed();
  }

  publicationChanged() { this.changed(); }

  async dispose(): Promise<void> {
    this.lifetime.abort();
    for (const id of this.retries.keys()) this.clearRetry(id);
    const connections = [...this.connections.values()];
    this.connections.clear();
    this.listeners.clear();
    await Promise.all([...connections.map((connection) => connection.close()), ...this.closing, ...this.retiring.values()]);
  }

  private async ensureCatalogs(principal: McpSessionPrincipal, matchesSource?: (source: McpSource, data: ReturnType<McpSourceStore["read"]>["data"]) => boolean) {
    if (principal.signal.aborted) throw mcpRouteError("cancelled-before-send");
    const service = this.options.publishSignal();
    if (!service || service.aborted) return;
    const data = this.store.read().data;
    const refreshes = Promise.all(data.sources.filter((source) => source.enabled).map(async (source) => {
      if (matchesSource && !matchesSource(source, data)) return;
      const catalog = this.catalogs.get(source.sourceId);
      const active = this.connections.get(source.sourceId);
      if (catalog?.fingerprint === this.store.fingerprint(source) && catalog.state === "ready" && active?.discovered && !active.lifetime.aborted) return;
      const retry = this.retries.get(source.sourceId);
      if (!active && retry?.service === service && retry.fingerprint === this.store.fingerprint(source)) return;
      try { await this.refreshLive(source, this.live(source)); }
      catch (error) {
        if (service.aborted || this.options.publishSignal() !== service) return;
        if (isHuhuError(error) && error.details?.reason === "stale-route") return;
        const latest = this.store.read().data.sources.find(({ sourceId }) => sourceId === source.sourceId);
        if (latest?.enabled && this.store.fingerprint(latest) === this.store.fingerprint(source)) {
          this.retry(source, service, this.failed(source, error));
        }
      }
    }));
    const snapshotBudget = matchesSource ? undefined : AbortSignal.timeout(listWaitMs);
    const signal = AbortSignal.any([principal.signal, service, ...(snapshotBudget ? [snapshotBudget] : [])]);
    try { await untilAborted(refreshes, signal); }
    catch (error) {
      if (principal.signal.aborted) throw mcpRouteError("cancelled-before-send");
      if (service.aborted) throw mcpRouteError("service-unavailable");
      if (!snapshotBudget?.aborted) throw error;
    }
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
      entries: [...(!sourceId ? (this.options.builtinDirectory?.() ?? []).map((entry) => ({
        sourceId: "builtin", kind: entry.kind, upstreamIdentity: entry.identity, publicKey: entry.identity, selected: true,
        description: entry.definition.description ?? entry.definition.name,
      })) : []), ...data.sources.filter((source) => !sourceId || source.sourceId === sourceId).flatMap((source) => {
        const catalog = this.catalogs.get(source.sourceId);
        if (!catalog || catalog.fingerprint !== this.store.fingerprint(source) || catalog.state !== "ready") return [];
        return catalog.entries.map((entry) => ({
          sourceId: source.sourceId, kind: entry.kind, upstreamIdentity: entry.identity,
          publicKey: this.publicKey(source, entry.kind, entry.identity, data),
          selected: data.policy.selected.some((row) => row.sourceId === source.sourceId && row.kind === entry.kind && row.upstreamIdentity === entry.identity),
          description: entry.definition.description ?? "",
        }));
      })],
    };
  }

  selectedPublicEntries(source: McpSource) {
    const data = this.store.read().data;
    return {
      policyRevision: data.policy.revision,
      // A saved selection survives restart and failed discovery, when the live catalog is empty.
      entries: data.policy.selected.filter(({ sourceId }) => sourceId === source.sourceId)
        .map(({ kind, upstreamIdentity }) => ({ kind, publicKey: this.publicKey(source, kind, upstreamIdentity, data) })),
    };
  }

  private publicKey(source: McpSource, kind: McpEntryKind, name: string, data: ReturnType<McpSourceStore["read"]>["data"]): string {
    const owned = data.publicKeys[routeOwner(source.sourceId, kind, name)];
    if (owned) return owned;
    if (kind === "resource" || kind === "resource-template") return projectUri(source.namespace, name);
    return publicToolName(source.namespace, name, kind === "tool" ? this.options.isBuiltinName : () => false);
  }

  ownsName(name: string): boolean {
    try { return Object.entries(this.store.read().data.publicKeys).some(([owner, key]) => key === name && (JSON.parse(owner) as unknown[]).length === 2); }
    catch { return false; }
  }

  private routing(principal: McpSessionPrincipal, requestId?: string, recordRoute?: (route: McpExternalRoute, source: McpSource) => void) {
    return createMcpRouting({
      readSnapshot: () => {
        const data = this.store.read().data;
        const routes: McpExternalRoute[] = [];
        const sources = new Map<string, McpSourceCatalog>();
        for (const source of data.sources) {
          const catalog = this.catalogs.get(source.sourceId);
          const view = this.view(source);
          const connection = this.connections.get(source.sourceId);
          const live = connection?.discovered && !connection.lifetime.aborted && connection.fingerprint === catalog?.fingerprint;
          const state = !live && view.state === "ready" ? "stale" : view.state;
          const catalogRevision = catalog?.catalogRevision ?? 0;
          sources.set(source.sourceId, {
            sourceId: source.sourceId, configRevision: source.revision, authenticationRevision: data.connectionRevisions[source.sourceId] ?? 0, catalogRevision,
            state, complete: state === "ready",
            entries: (catalog?.entries ?? []).map((entry) => ({ kind: entry.kind, upstreamIdentity: entry.identity, descriptor: entry.definition })),
          });
          for (const entry of catalog?.entries ?? []) {
            const publicKey = this.publicKey(source, entry.kind, entry.identity, data);
            if (entry.kind !== "tool" || !this.options.isBuiltinName(publicKey)) routes.push({
              origin: "external", kind: entry.kind, sourceId: source.sourceId, upstreamIdentity: entry.identity, publicKey,
              configRevision: source.revision, authenticationRevision: data.connectionRevisions[source.sourceId] ?? 0, catalogRevision,
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
        recordRoute?.(route, source);
        const connection = this.live(source);
        const preparing = AbortSignal.any([signal, connection.lifetime, AbortSignal.timeout(initializeMs)]);
        let client: Client;
        try {
          client = await untilAborted(connection.ready, preparing);
          await untilAborted(connection.renewAuthentication(), preparing);
        }
        catch (error) {
          if (signal.aborted) throw mcpRouteError("cancelled-before-send");
          if (connection.lifetime.aborted) throw mcpRouteError("stale-route");
          throw error;
        }
        return async (input) => {
          if (signal.aborted) throw mcpRouteError("cancelled-before-send");
          const current = this.connections.get(source.sourceId);
          if (current !== connection || connection.lifetime.aborted) throw mcpRouteError("stale-route");
          const request = { signal: AbortSignal.any([signal, connection.lifetime]), timeout: callMs };
          try {
            if (route.kind === "tool") {
              const args = argumentsSchema.safeParse(input);
              if (!args.success) throw mcpRouteError("invalid-arguments");
              const response = await client.request({ method: "tools/call", params: { name: route.upstreamIdentity, arguments: args.data } }, CallToolResultSchema, request);
              return { ...response, content: response.content.map((item) => projectContent(source.namespace, item)) };
            }
            if (route.kind === "prompt") {
              const args = promptArguments.safeParse(input);
              if (!args.success) throw mcpRouteError("invalid-arguments");
              const response = await client.request({ method: "prompts/get", params: { name: route.upstreamIdentity, arguments: args.data } }, GetPromptResultSchema, request);
              return { ...response, messages: response.messages.map((message) => ({ ...message, content: projectContent(source.namespace, message.content) })) };
            }
            if (typeof input !== "string" || !(route.kind === "resource" ? route.upstreamIdentity === input : matchesTemplate(route.upstreamIdentity, input))) {
              throw mcpRouteError("invalid-arguments");
            }
            const response = await client.request({ method: "resources/read", params: { uri: input } }, ReadResourceResultSchema, request);
            return { ...response, contents: response.contents.map((item) => ({ ...item, uri: projectUri(source.namespace, item.uri) })) };
          } catch (error) {
            if (isHuhuError(error)) throw error;
            if (error instanceof McpError && error.code === ErrorCode.InvalidParams) throw mcpRouteError("invalid-arguments");
            throw mcpRouteError("upstream-result-unknown", { sourceId: source.sourceId, correlationId: requestId ?? randomUUID() });
          }
        };
      },
    });
  }

  async list(principal: McpSessionPrincipal, kind: McpEntryKind) {
    await this.ensureCatalogs(principal);
    return this.routing(principal).list(principal, kind).flatMap((route) => {
      if (route.origin !== "external") return [];
      const entry = this.catalogs.get(route.sourceId)?.entries.find((entry) => entry.kind === kind && entry.identity === route.upstreamIdentity);
      if (!entry) return [];
      const publicKey = route.publicKey;
      return [entry.kind === "tool" ? { ...entry, definition: projectTool(entry.definition, publicKey) }
        : entry.kind === "prompt" ? { ...entry, definition: { ...entry.definition, name: publicKey } }
        : entry.kind === "resource" ? { ...entry, definition: { ...entry.definition, uri: publicKey } }
        : { ...entry, definition: { ...entry.definition, uriTemplate: publicKey } }];
    });
  }

  call(principal: McpSessionPrincipal, publicKey: string, input: unknown): Promise<CallToolResult> {
    return this.invoke(principal, "tool", publicKey, input).then((result) => CallToolResultSchema.parse(result));
  }

  get(principal: McpSessionPrincipal, publicKey: string, input: Record<string, string>): Promise<GetPromptResult> {
    return this.invoke(principal, "prompt", publicKey, input).then((result) => GetPromptResultSchema.parse(result));
  }

  async read(principal: McpSessionPrincipal, publicUri: string): Promise<ReadResourceResult> {
    const ownsUri = (source: McpSource) => publicUri.startsWith(resourcePrefix(source.namespace));
    await this.ensureCatalogs(principal, ownsUri);
    const data = this.store.read().data;
    const source = data.sources.find(ownsUri);
    if (!source) throw mcpRouteError("unknown-entry");
    const uri = publicUri.slice(resourcePrefix(source.namespace).length);
    const entries = this.catalogs.get(source.sourceId)?.entries ?? [];
    const exact = entries.find((entry) => entry.kind === "resource" && entry.identity === uri);
    const templates = exact ? [] : entries.filter((entry) => entry.kind === "resource-template" && matchesTemplate(entry.identity, uri));
    if (templates.length > 1) throw mcpRouteError("ambiguous-entry");
    const entry = exact ?? templates[0];
    if (!entry) throw mcpRouteError("unknown-entry");
    const reply = await this.invoke(principal, entry.kind, this.publicKey(source, entry.kind, entry.identity, data), uri);
    return ReadResourceResultSchema.parse(reply);
  }

  private async invoke(principal: McpSessionPrincipal, kind: McpEntryKind, publicKey: string, input: unknown): Promise<McpUpstreamResult> {
    const started = Date.now();
    const requestId = randomUUID();
    const named = kind === "tool" || kind === "prompt";
    const { credentialId, clientSessionId } = principal.identity;
    const identity = { operation: kind, requestId, subject: fingerprint(credentialId), session: fingerprint(clientSessionId) };
    let mcp: NonNullable<AuditRecord["mcp"]> = identity;
    let code = "INTERNAL";
    try {
      if (kind === "tool" && principal.recovered) throw mcpRouteError("recovered-session");
      if (kind === "tool" || kind === "prompt") {
        await this.ensureCatalogs(principal, (source, data) => data.policy.selected.some((entry) => entry.sourceId === source.sourceId && entry.kind === kind &&
          this.publicKey(source, kind, entry.upstreamIdentity, data) === publicKey));
      }
      const reply = await this.routing(principal, requestId, (route, source) => {
        mcp = {
          ...identity, sourceId: source.sourceId, sourceName: source.displayName,
          upstreamEntry: named ? route.upstreamIdentity.slice(0, 128) : fingerprint(route.upstreamIdentity),
          publicEntry: named ? route.publicKey.slice(0, 128) : fingerprint(route.publicKey),
          catalogRevision: route.catalogRevision, configRevision: route.configRevision,
        };
      }).call(principal, { kind, publicKey, input });
      if (reply.origin !== "external") throw mcpRouteError("unknown-entry");
      code = "isError" in reply.result && reply.result.isError ? "UPSTREAM_TOOL_ERROR" : "OK";
      return reply.result;
    } catch (error) {
      if (isHuhuError(error)) code = error.code;
      mcp.result = isHuhuError(error) && typeof error.details?.reason === "string" ? error.details.reason : code;
      throw error;
    } finally {
      // Resource URIs can contain user data in their path and query.
      mcp.result ??= code;
      try { this.options.audit?.({ at: new Date().toISOString(), entry: "mcp-http", capability: named && mcp.sourceId ? publicKey.slice(0, 128) : "mcp.external." + kind, code, ms: Date.now() - started, mcp }); }
      catch { /* audit I/O cannot change the call outcome */ }
    }
  }
}

const promptArguments = z.record(z.string(), z.string());
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);
export const routeOwner = (sourceId: string, kind: McpEntryKind, name: string) =>
  JSON.stringify(kind === "tool" ? [sourceId, name] : [sourceId, kind, name]);

function projectContent(namespace: string, item: ContentBlock): ContentBlock {
  if (item.type === "resource_link") return { ...item, uri: projectUri(namespace, item.uri) };
  if (item.type === "resource") return { ...item, resource: { ...item.resource, uri: projectUri(namespace, item.resource.uri) } };
  return item;
}
