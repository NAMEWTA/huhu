import { randomUUID } from "node:crypto";
import { isHuhuError, MCP_ENTRY_KINDS, type McpEntryKind, type McpExternalRoute, type McpSessionPrincipal, type McpSource, type McpSourceCatalog } from "@huhu/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema, ErrorCode, GetPromptResultSchema, McpError, PromptListChangedNotificationSchema, ReadResourceResultSchema, ResourceListChangedNotificationSchema, ToolListChangedNotificationSchema, type CallToolResult, type ContentBlock, type GetPromptResult, type ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { canonicalJson } from "../idempotency.js";
import { builtinMcpDirectory, type ExternalMcpTools } from "../mcp.js";
import { createMcpRouting, mcpRouteError, type McpUpstreamResult } from "../mcp-routing.js";
import { discoverCatalog, matchesTemplate, projectTool, projectUri, publicToolName, resourcePrefix, type DirectoryEntry } from "./catalog.js";
import { McpSourceStore } from "./store.js";
import { remoteAuthFailure, sourceTransport } from "./transport.js";
import type { McpCredentialMaterial, McpCredentials } from "./credentials.js";

const initializeMs = 6_000;
const discoverMs = 8_000;
const callMs = 30_000;
const argumentsSchema = z.record(z.string(), z.unknown());

type Catalog = { fingerprint: string; catalogRevision: number; entries: DirectoryEntry[]; state: McpSourceCatalog["state"]; checkedAt: string; diagnostic: string | null };
type Connection = { fingerprint: string; lifetime: AbortSignal; close(): Promise<void>; ready: Promise<Client>; renewAuthentication(): Promise<void>; refresh?: Promise<Catalog>; refreshAgain?: true };

export interface McpSourceRuntimeOptions {
  vaultInstance: string;
  publishSignal(): AbortSignal | undefined;
  endpoint?(): string | null;
  builtinDirectory?(): ReturnType<typeof builtinMcpDirectory>;
  catalogChanged?(): void;
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

  private connect(source: McpSource, lifetime: AbortSignal, changed?: () => void): Connection {
    lifetime.throwIfAborted();
    this.requireApproved(source);
    const client = new Client({ name: "huhu", version: "0.0.1" });
    let material: McpCredentialMaterial | undefined;
    const renewAuthentication = async () => {
      if (material?.kind === "oauth" && material.expiresAt !== null && material.expiresAt <= Date.now() + 5_000) {
        material = await this.credentials?.values(source);
      }
    };
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
    if (changed) {
      client.setNotificationHandler(ToolListChangedNotificationSchema, changed);
      client.setNotificationHandler(ResourceListChangedNotificationSchema, changed);
      client.setNotificationHandler(PromptListChangedNotificationSchema, changed);
    }
    const ready = (async () => {
      const handshake = AbortSignal.any([lifetime, AbortSignal.timeout(initializeMs)]);
      let rejectWait: () => void = () => {};
      try {
        material = await this.credentials?.values(source);
        handshake.throwIfAborted();
        const transport = sourceTransport(source, () => this.options.endpoint?.(), () => material);
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
    return { fingerprint: this.store.fingerprint(source), lifetime, close, ready, renewAuthentication };
  }

  private async fetchCatalog(connection: Connection): Promise<DirectoryEntry[]> {
    const client = await connection.ready;
    await connection.renewAuthentication();
    return discoverCatalog(client, AbortSignal.any([connection.lifetime, AbortSignal.timeout(discoverMs)]));
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
        const entries = await this.fetchCatalog(connection);
        this.assertCurrent(source, connection.fingerprint, connection.lifetime);
        if (this.connections.get(source.sourceId) !== connection || this.probes.get(source.sourceId) !== probe) throw mcpRouteError("stale-route");
        return this.catalog(source, entries, "ready", null);
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
      const entries = await this.fetchCatalog(connection);
      this.assertCurrent(source, fingerprint, lifetime);
      if (this.probes.get(id) !== probe) throw mcpRouteError("stale-route");
      return this.catalog(source, entries, "ready", null);
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

  private async ensureCatalogs(principal: McpSessionPrincipal, matchesSource?: (source: McpSource, data: ReturnType<McpSourceStore["read"]>["data"]) => boolean) {
    principal.signal.throwIfAborted();
    if (!this.options.publishSignal()) return;
    const data = this.store.read().data;
    await Promise.all(data.sources.filter((source) => source.enabled).map(async (source) => {
      if (matchesSource && !matchesSource(source, data)) return;
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
            sourceId: source.sourceId, configRevision: source.revision, authenticationRevision: data.connectionRevisions[source.sourceId] ?? 0, catalogRevision,
            state: view.state, complete: !!catalog && view.state === "ready",
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
        const connection = this.live(source);
        const client = await connection.ready;
        await connection.renewAuthentication();
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
            throw mcpRouteError("upstream-result-unknown", { sourceId: source.sourceId, correlationId: randomUUID() });
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
    let code = "INTERNAL";
    try {
      if (kind === "tool" && principal.recovered) throw mcpRouteError("recovered-session");
      if (kind === "tool" || kind === "prompt") {
        await this.ensureCatalogs(principal, (source, data) => data.policy.selected.some((entry) => entry.sourceId === source.sourceId && entry.kind === kind &&
          this.publicKey(source, kind, entry.upstreamIdentity, data) === publicKey));
      }
      const reply = await this.routing(principal).call(principal, { kind, publicKey, input });
      if (reply.origin !== "external") throw mcpRouteError("unknown-entry");
      code = "isError" in reply.result && reply.result.isError ? "UPSTREAM_TOOL_ERROR" : "OK";
      return reply.result;
    } catch (error) {
      if (isHuhuError(error)) code = error.code;
      throw error;
    } finally {
      // Resource URIs can contain user data in their path and query.
      try { this.options.audit?.({ at: new Date().toISOString(), entry: "mcp-http", capability: kind === "tool" || kind === "prompt" ? publicKey.slice(0, 128) : "mcp.resources.read", code, ms: Date.now() - started }); }
      catch { /* audit I/O cannot change the call outcome */ }
    }
  }
}

const promptArguments = z.record(z.string(), z.string());
export const routeOwner = (sourceId: string, kind: McpEntryKind, name: string) =>
  JSON.stringify(kind === "tool" ? [sourceId, name] : [sourceId, kind, name]);

function projectContent(namespace: string, item: ContentBlock): ContentBlock {
  if (item.type === "resource_link") return { ...item, uri: projectUri(namespace, item.uri) };
  if (item.type === "resource") return { ...item, resource: { ...item.resource, uri: projectUri(namespace, item.resource.uri) } };
  return item;
}
