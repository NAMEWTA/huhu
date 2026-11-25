import { randomUUID } from "node:crypto";
import { HuhuError, errors, type McpSource } from "@huhu/contracts";
import { refreshAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import { OAuthClientInformationFullSchema, OAuthMetadataSchema, OAuthTokensSchema, OpenIdProviderMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { z } from "zod";
import { ModuleCredentials, type CredentialOwner } from "../credentials/module-credentials.js";
import { CredentialError } from "../credentials/protection.js";
import { mcpRouteError } from "../mcp-routing.js";
import { canonicalJson } from "../idempotency.js";
import { oauthFetch } from "./oauth-network.js";
import type { McpSourceStore } from "./store.js";

const definitionSchema = z.strictObject({ sourceId: z.string(), target: z.string(), account: z.string(), kind: z.enum(["remote", "stdio", "oauth"]) });
type Definition = z.infer<typeof definitionSchema>;
export type McpCredentialHost = Omit<CredentialOwner<Definition>, "pluginId" | "definition" | "targets">;

const common = z.record(z.string(), z.string());
const materialSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("remote"), headers: common, query: z.string() }),
  z.strictObject({ kind: z.literal("stdio"), environment: common }),
  z.strictObject({
    kind: z.literal("oauth"), issuer: z.string(), client: OAuthClientInformationFullSchema,
    metadata: z.union([OAuthMetadataSchema, OpenIdProviderMetadataSchema]).optional(),
    resource: z.string(), tokens: OAuthTokensSchema, expiresAt: z.number().nullable(),
  }),
]);
export type McpCredentialMaterial = z.infer<typeof materialSchema>;
export type OAuthMaterial = Extract<McpCredentialMaterial, { kind: "oauth" }>;
export type SourceCredentialStage = { reference: string; revision: string; configuration: McpSource["configuration"] };

export function credentialReference(source: McpSource): string | undefined {
  const config = source.configuration;
  if (config.transport === "stdio") return config.credentialEnvironment?.reference;
  const auth = config.authentication;
  return auth.kind === "credential" || auth.kind === "oauth" ? auth.reference : undefined;
}

export function clearCredential(config: McpSource["configuration"]): McpSource["configuration"] {
  if (config.transport === "stdio") {
    return config.credentialEnvironment ? { ...config, credentialEnvironment: { names: config.credentialEnvironment.names } } : config;
  }
  const auth = config.authentication;
  if (auth.kind === "credential") return { ...config, authentication: { kind: "credential-needed", header: auth.header } };
  if (config.transport === "streamable-http" && auth.kind === "oauth") return { ...config, authentication: { kind: "oauth" } };
  return config;
}

const targetOf = (source: McpSource) => {
  const config = source.configuration;
  return config.transport === "stdio"
    ? JSON.stringify([config.transport, config.command, config.cwd ?? null, config.args])
    : JSON.stringify([config.transport, config.url]);
};

function bound(source: McpSource, material: McpCredentialMaterial, reference: string): McpSource["configuration"] {
  const config = source.configuration;
  if (config.transport === "stdio" && material.kind === "stdio") {
    return { ...config, credentialEnvironment: { reference, names: Object.keys(material.environment).sort() } };
  }
  if (config.transport === "streamable-http" && material.kind === "oauth") {
    return { ...config, authentication: { kind: "oauth", reference } };
  }
  if (config.transport !== "stdio" && material.kind === "remote") {
    const auth = config.authentication;
    const header = Object.keys(material.headers)[0] ?? (auth.kind === "credential-needed" || auth.kind === "credential" ? auth.header : "Authorization");
    return { ...config, authentication: { kind: "credential", reference, header } };
  }
  throw errors.invalidInput("当前传输不支持此认证类型");
}

export function credentialFailure(error: unknown) {
  if (error instanceof HuhuError) return error;
  if (error instanceof CredentialError && error.code === "conflict") return errors.versionConflict("credential");
  if (error instanceof CredentialError && error.code === "cancelled") return errors.engineClosing();
  return new HuhuError("PROVIDER_UNAUTHENTICATED", "无法使用本机 MCP 凭据。请检查凭据宿主或重新绑定。", { retryable: false });
}

export class McpCredentials {
  private readonly owner: ModuleCredentials<Definition> | undefined;
  private readonly refreshes = new Map<string, Promise<OAuthMaterial>>();
  private readonly lifetime = new AbortController();

  constructor(private readonly store: McpSourceStore, host?: McpCredentialHost) {
    if (host) this.owner = new ModuleCredentials({
      ...host, pluginId: "mcp", definition: definitionSchema,
      targets: (definition) => ({ authentication: JSON.stringify([definition.sourceId, definition.target, definition.account, definition.kind]) }),
    });
  }

  get available() { return !!this.owner && !this.store.files.readOnly; }

  dispose() { this.lifetime.abort(); }

  current(source: McpSource, requireRevision = true) {
    try {
      const latest = this.store.source(source.sourceId);
      return (!requireRevision || latest.revision === source.revision) && latest.enabled === source.enabled &&
        canonicalJson(latest.configuration) === canonicalJson(source.configuration);
    } catch { return false; }
  }

  async stage(source: McpSource, account: string, material: McpCredentialMaterial, signal?: AbortSignal, isCurrent?: () => boolean): Promise<SourceCredentialStage> {
    this.store.files.assertWritable();
    const owner = this.owner;
    if (!owner) throw credentialFailure(undefined);
    const reference = randomUUID();
    const configuration = bound(source, material, reference);
    const lifetime = AbortSignal.any([this.lifetime.signal, ...(signal ? [signal] : [])]);
    try {
      const saved = await owner.save({
        entityId: reference, expectedRevision: null,
        definition: { sourceId: source.sourceId, target: targetOf(source), account, kind: material.kind },
        actions: [{ purpose: "authentication", action: "replace", value: JSON.stringify(materialSchema.parse(material)) }],
        signal: lifetime, ...(isCurrent && { isCurrent }),
      });
      return { reference, revision: saved.revision, configuration };
    } catch (error) { throw credentialFailure(error); }
  }

  async discard(reference: string, revision?: string): Promise<void> {
    try {
      const owner = this.owner;
      if (!owner) return;
      const known = revision ?? (await owner.list()).find((entry) => entry.entityId === reference)?.revision;
      if (known) await owner.delete(reference, known);
    } catch {
      // Unreferenced material is unreachable. Reconcile on the next module activation.
    }
  }

  async reconcile() {
    const owner = this.owner;
    if (!owner || this.store.files.readOnly) return;
    const references = new Set(this.store.read().data.sources.map(credentialReference));
    for (const entry of await owner.list()) {
      if (!references.has(entry.entityId)) await this.discard(entry.entityId, entry.revision);
    }
    await owner.recover();
  }

  async status(source: McpSource): Promise<{ state: string; account: string | null }> {
    const reference = credentialReference(source);
    if (!reference) return { state: this.available ? "unconfigured" : "temporarily-unavailable", account: null };
    if (!this.owner) return { state: "temporarily-unavailable", account: null };
    try {
      const row = (await this.owner.list()).find((entry) => entry.entityId === reference && entry.definition.sourceId === source.sourceId && entry.definition.target === targetOf(source));
      return { state: row?.authState["authentication"] ?? "needs-reconfiguration", account: row?.definition.account ?? null };
    } catch { return { state: "temporarily-unavailable", account: null }; }
  }

  async values(source: McpSource): Promise<McpCredentialMaterial | undefined> {
    const config = source.configuration;
    const reference = credentialReference(source);
    if (!reference) {
      if ((config.transport === "stdio" && config.credentialEnvironment?.names.length) ||
          (config.transport !== "stdio" && ["credential-needed", "oauth"].includes(config.authentication.kind))) {
        throw mcpRouteError("authentication-required", { sourceId: source.sourceId });
      }
      return undefined;
    }
    try {
      const read = await this.owner?.use(reference, ["authentication"], async (definition, values, revision) => {
        if (definition.sourceId !== source.sourceId || definition.target !== targetOf(source)) return undefined;
        const material = materialSchema.parse(JSON.parse(values.get("authentication")!));
        return material.kind === definition.kind ? { definition, material, revision } : undefined;
      });
      if (!read || !this.current(source, false)) throw mcpRouteError("authentication-required");
      if (read.material.kind !== "oauth" || read.material.expiresAt === null || read.material.expiresAt > Date.now() + 5_000) return read.material;
      const existing = this.refreshes.get(reference);
      if (existing) return await existing;
      const material = read.material;
      const refresh = this.refresh(source, reference, read.definition, read.revision, material);
      this.refreshes.set(reference, refresh);
      try { return await refresh; }
      finally { if (this.refreshes.get(reference) === refresh) this.refreshes.delete(reference); }
    } catch {
      throw mcpRouteError("authentication-required", { sourceId: source.sourceId });
    }
  }

  private async refresh(source: McpSource, reference: string, definition: Definition, revision: string, material: OAuthMaterial): Promise<OAuthMaterial> {
    const refreshToken = material.tokens.refresh_token;
    if (!refreshToken) throw mcpRouteError("authentication-required");
    const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(12_000)]);
    const tokens = await refreshAuthorization(material.issuer, {
      clientInformation: material.client, ...(material.metadata && { metadata: material.metadata }), refreshToken, resource: material.resource,
      fetchFn: oauthFetch(new URL(material.resource), signal),
    });
    const updated = { ...material, tokens, expiresAt: expiry(tokens.expires_in) };
    await this.owner!.save({
      entityId: reference, expectedRevision: revision, definition, signal, isCurrent: () => this.current(source, false),
      actions: [{ purpose: "authentication", action: "replace", value: JSON.stringify(updated) }],
    });
    return updated;
  }
}

export const expiry = (expiresIn: number | undefined) => expiresIn === undefined ? null : Date.now() + expiresIn * 1000;
