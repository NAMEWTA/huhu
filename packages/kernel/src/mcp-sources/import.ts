import { randomUUID } from "node:crypto";
import { errors, McpSourceConfigSchema, type McpImportConfirmation, type McpSource } from "@huhu/contracts";
import { z } from "zod";
import type { CapabilityContext } from "../capabilities/define.js";
import { canonicalJson } from "../idempotency.js";
import type { McpSourceStore } from "./store.js";
import { validateCredentialHeaders, validateRemoteHeaders } from "./transport.js";
import { credentialReference, type McpCredentials, type McpCredentialMaterial, type SourceCredentialStage } from "./credentials.js";

export const MAX_MCP_SOURCES = 32;
export const sourceNamespace = z
  .string()
  .max(32)
  .regex(/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/);
const displayName = z.string().trim().min(1).max(128);
const dictionary = z.record(z.string(), z.unknown());
const stringMap = z.record(z.string(), z.string());
const root = z.strictObject({ mcpServers: dictionary });
const rowInput = z
  .object({
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    env: stringMap.optional(),
    credentialEnvironment: z.strictObject({ names: z.array(z.string()).min(1) }).optional(),
    url: z.string().optional(),
    type: z.string().optional(),
    transport: z.string().optional(),
    headers: stringMap.optional(),
    nonSecretHeaders: stringMap.optional(),
    name: displayName.optional(),
    namespace: sourceNamespace.optional(),
    authentication: z
      .discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("none") }),
        z.strictObject({ kind: z.literal("environment"), header: z.string(), name: z.string() }),
        z.strictObject({ kind: z.literal("credential-needed"), header: z.string() }),
        z.strictObject({ kind: z.literal("oauth") }),
      ])
      .optional(),
  })
  .strict();

export const mcpImportPreview = z.strictObject({
  previewId: z.string(),
  sourcesRevision: z.int().nonnegative(),
  entries: z.array(
    z.strictObject({
      entryId: z.string(),
      namespace: sourceNamespace.nullable(),
      displayName: displayName.nullable(),
      state: z.enum(["ready", "conflict", "blocked", "invalid"]),
      diagnostic: z.string().nullable(),
      sourceId: z.string().optional(),
      sourceRevision: z.int().nonnegative().optional(),
      sensitive: z.boolean().optional(),
    }),
  ),
});
type Preview = z.infer<typeof mcpImportPreview>;
type Entry = Preview["entries"][number];
type Draft = Pick<McpSource, "displayName" | "namespace" | "configuration"> & { material?: McpCredentialMaterial };
type Plan = { owner: string; expires: number; version: string | null; preview: Preview; drafts: Map<string, Draft>; timer: NodeJS.Timeout };
const previewLifetime = 5 * 60_000;
class BlockedImport extends Error {}
const needsCredentials = () => new BlockedImport("包含凭据，请在认证管理中绑定或改用显式环境变量引用");
const reference = (value: string) => /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value)?.[1];
const ambiguousArgument = (value: string) => /^--?(?:token|secret|password|api[-_]?key|authorization)(?:=|$)/i.test(value) || /^bearer\s/i.test(value);

function normalized(namespace: string, value: unknown): Draft {
  const raw = dictionary.safeParse(value);
  if (!raw.success) throw Error("来源必须是 JSON 对象");
  const authentication = dictionary.safeParse(raw.data["authentication"]);
  if (authentication.success && authentication.data["kind"] === "credential") throw needsCredentials();
  const parsed = rowInput.safeParse(raw.data);
  if (!parsed.success) throw Error("名称、参数、认证、环境变量或 header 字段类型无效");
  const row = parsed.data;
  if (Boolean(row.command) === Boolean(row.url)) throw Error("配置须提供命令或 URL 之一");
  if (row.type !== undefined && row.transport !== undefined && row.type !== row.transport) throw Error("传输字段冲突");
  const explicit = row.transport ?? row.type;
  const transport = explicit === "http" ? "streamable-http" : (explicit ?? (row.command ? "stdio" : "streamable-http"));
  const name = row.name ?? namespace;
  let configuration: unknown;
  let material: McpCredentialMaterial | undefined;
  if (transport === "stdio") {
    if (!row.command || row.url || row.headers || row.nonSecretHeaders || row.authentication) throw Error("stdio 来源与远程连接字段冲突");
    if (row.args?.some(ambiguousArgument)) throw needsCredentials();
    const environment: Record<string, string> = {};
    const sensitive: Record<string, string> = {};
    for (const [variable, supplied] of Object.entries(row.env ?? {})) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable)) throw Error("环境变量名无效");
      const name = reference(supplied);
      if (name) environment[variable] = name;
      else if (supplied.length) sensitive[variable] = supplied;
      else throw Error("环境变量不能为空");
    }
    const names = [...new Set([...Object.keys(sensitive), ...(row.credentialEnvironment?.names ?? [])])].sort();
    if (Object.keys(sensitive).length && names.some((name) => !(name in sensitive))) throw needsCredentials();
    if (Object.keys(sensitive).length) material = { kind: "stdio", environment: sensitive };
    configuration = { transport, command: row.command, args: row.args ?? [], ...(row.cwd !== undefined && { cwd: row.cwd }), environment, ...(names.length && { credentialEnvironment: { names } }) };
  } else {
    if (transport !== "streamable-http" && transport !== "sse") throw Error("不支持该 MCP 传输");
    if (!row.url || row.command || row.args || row.cwd || row.env || row.credentialEnvironment) throw Error("远程来源与 stdio 字段冲突");
    const endpoint = URL.parse(row.url);
    if (endpoint?.username || endpoint?.password) throw needsCredentials();
    const query = endpoint?.search ?? "";
    if (endpoint) endpoint.search = "";
    let authentication = row.authentication ?? { kind: "none" as const };
    const headers: Record<string, string> = {};
    for (const [header, value] of Object.entries(row.headers ?? {})) {
      const name = reference(value);
      if (name) {
        if (authentication.kind !== "none") throw needsCredentials();
        authentication = { kind: "environment", header, name };
      } else headers[header] = value;
    }
    if (query || Object.keys(headers).length) {
      if (authentication.kind !== "none") throw needsCredentials();
      try {
        validateCredentialHeaders(headers);
      } catch {
        throw Error("认证 header 无效");
      }
      material = { kind: "remote", query, headers };
      authentication = { kind: "credential-needed", header: Object.keys(headers)[0] ?? "Authorization" };
    }
    configuration = { transport, url: endpoint?.href ?? row.url, headers: row.nonSecretHeaders ?? {}, authentication };
  }
  const valid = McpSourceConfigSchema.safeParse(configuration);
  if (!valid.success) throw Error("命令、目标 URL、环境引用或 header 无效");
  try {
    validateRemoteHeaders(valid.data);
  } catch {
    throw Error("header 重复或由协议保留");
  }
  return { configuration: valid.data, namespace, displayName: name, ...(material && { material }) };
}

function ownerOf(context: CapabilityContext) {
  return canonicalJson([context.caller, context.subject ?? null, context.delegatedBy ?? null]);
}

export class McpSourceImport {
  private readonly plans = new Map<string, Plan>();

  constructor(
    private readonly store: McpSourceStore,
    private readonly credentials: McpCredentials,
    private readonly onChanges: (sources: readonly McpSource[]) => void,
  ) {}

  private forget(id: string) {
    const plan = this.plans.get(id);
    if (!plan) return;
    clearTimeout(plan.timer);
    this.plans.delete(id);
  }

  dispose() {
    for (const id of this.plans.keys()) this.forget(id);
  }

  preview(context: CapabilityContext, text: string): Preview {
    const now = Date.now();
    for (const [id, plan] of this.plans) if (plan.expires <= now) this.forget(id);
    if (this.plans.size >= 32) this.forget(this.plans.keys().next().value!);
    let decoded: unknown;
    try {
      decoded = JSON.parse(text);
    } catch {
      throw errors.invalidInput("MCP 导入 JSON 无效");
    }
    const parsed = root.safeParse(decoded);
    if (!parsed.success) throw errors.invalidInput("请提供含 mcpServers 对象的配置");
    const values = Object.entries(parsed.data.mcpServers);
    if (!values.length || values.length > MAX_MCP_SOURCES) throw errors.invalidInput("导入的 MCP 来源数量超出限制");
    const { data, version } = this.store.read();
    const drafts = new Map<string, Draft>();
    const entries: Entry[] = [];
    const seenNamespaces = new Set<string>();
    const seenNames = new Set<string>();
    for (const [rawNamespace, value] of values) {
      const override = dictionary.safeParse(value);
      const ns = sourceNamespace.safeParse(override.data?.["namespace"] ?? rawNamespace);
      const entry: Entry = { entryId: randomUUID(), state: "invalid", namespace: ns.success ? ns.data : null, displayName: null, diagnostic: null };
      entries.push(entry);
      if (!ns.success) {
        entry.diagnostic = "命名空间无效";
        continue;
      }
      try {
        const draft = normalized(ns.data, value);
        entry.displayName = draft.displayName;
        if (draft.material) {
          if (!this.credentials.available) throw needsCredentials();
          entry.sensitive = true;
        }
        if (seenNamespaces.has(draft.namespace) || seenNames.has(draft.displayName)) throw Error("导入列表含重复来源或名称");
        seenNamespaces.add(draft.namespace);
        seenNames.add(draft.displayName);
        const existing = data.sources.find((source) => source.namespace === draft.namespace);
        if (!existing && Object.hasOwn(data.namespaces, draft.namespace)) throw Error("命名空间已被历史来源保留");
        if (data.sources.some((source) => source !== existing && source.displayName === draft.displayName)) throw Error("来源名称已使用");
        if (existing) {
          entry.state = "conflict";
          entry.sourceId = existing.sourceId;
          entry.sourceRevision = existing.revision;
          entry.diagnostic = "命名空间存在，请选择更新或跳过";
        } else entry.state = "ready";
        drafts.set(entry.entryId, draft);
      } catch (error) {
        entry.state = error instanceof BlockedImport ? "blocked" : "invalid";
        entry.diagnostic = error instanceof Error ? error.message : "配置无效";
      }
    }
    const preview = { previewId: randomUUID(), sourcesRevision: data.revision, entries };
    const timer = setTimeout(() => this.forget(preview.previewId), previewLifetime);
    timer.unref();
    this.plans.set(preview.previewId, { owner: ownerOf(context), expires: now + previewLifetime, version, preview, drafts, timer });
    return preview;
  }

  cancel(context: CapabilityContext, id: string) {
    if (this.plans.get(id)?.owner === ownerOf(context)) this.forget(id);
    return {};
  }

  async commit(context: CapabilityContext, selection: McpImportConfirmation) {
    const plan = this.plans.get(selection.previewId);
    if (!plan || plan.owner !== ownerOf(context) || plan.expires <= Date.now()) throw errors.invalidInput("MCP 导入预览已失效，请重新预览");
    const { data, version } = this.store.read();
    if (plan.version !== version || plan.preview.sourcesRevision !== selection.sourcesRevision || data.revision !== selection.sourcesRevision) {
      throw errors.versionConflict(String(data.revision));
    }
    const seen = new Set<string>();
    const choices: { source: McpSource; material?: McpCredentialMaterial }[] = [];
    const entries = new Map(plan.preview.entries.map((entry) => [entry.entryId, entry]));
    for (const choice of selection.selections) {
      const entry = entries.get(choice.entryId);
      if (!entry || seen.has(choice.entryId)) throw errors.invalidInput("导入选择无效或重复");
      seen.add(choice.entryId);
      if (choice.action === "skip") continue;
      const draft = plan.drafts.get(choice.entryId);
      if (!draft) throw errors.invalidInput("所选来源需要修复配置或认证");
      const { material, ...config } = draft;
      if (choice.action === "create" && entry.state === "ready") {
        choices.push({ source: { ...config, sourceId: randomUUID(), enabled: false, revision: 1 }, ...(material && { material }) });
      } else if (choice.action === "update" && entry.state === "conflict" && choice.sourceId === entry.sourceId && choice.sourceRevision === entry.sourceRevision) {
        choices.push({ source: { ...config, sourceId: choice.sourceId, enabled: false, revision: choice.sourceRevision + 1 }, ...(material && { material }) });
      } else throw errors.invalidInput("所选导入操作与预览不一致");
    }
    if (!choices.length) throw errors.invalidInput("请选择要提交的来源");
    const staged: SourceCredentialStage[] = [];
    const stillValid = () => this.plans.get(selection.previewId) === plan && plan.expires > Date.now() && this.store.read().version === version;
    const changes: McpSource[] = [];
    let written: Awaited<ReturnType<McpSourceStore["change"]>>;
    try {
      for (const { source, material } of choices) {
        if (!material) {
          changes.push(source);
          continue;
        }
        const prepared = await this.credentials.stage(source, source.displayName, material, context.signal, stillValid);
        staged.push(prepared);
        changes.push({ ...source, configuration: prepared.configuration });
      }
      if (!stillValid()) throw errors.versionConflict(String(this.store.read().data.revision));
      written = await this.store.change(
        context,
        (next) => {
          const sources = new Map(next.sources.map((source) => [source.sourceId, source]));
          for (const source of changes) {
            const prior = sources.get(source.sourceId);
            if (!prior && Object.hasOwn(next.namespaces, source.namespace)) throw errors.nameConflict(source.namespace);
            if (prior && canonicalJson(prior.configuration) !== canonicalJson(source.configuration)) {
              next.connectionRevisions[source.sourceId] = (next.connectionRevisions[source.sourceId] ?? 0) + 1;
            }
            next.namespaces[source.namespace] = source.sourceId;
            sources.set(source.sourceId, source);
          }
          if (sources.size > MAX_MCP_SOURCES) throw errors.invalidInput("MCP 来源总数已达上限");
          next.sources = [...sources.values()];
        },
        () => {
          if (!stillValid()) throw errors.versionConflict(String(this.store.read().data.revision));
        },
      );
    } catch (error) {
      await Promise.all(staged.map((item) => this.credentials.discard(item.reference, item.revision)));
      throw error;
    }
    this.forget(selection.previewId);
    this.onChanges(changes);
    for (const source of changes) {
      const previous = data.sources.find((item) => item.sourceId === source.sourceId);
      const reference = previous && credentialReference(previous);
      if (reference) await this.credentials.discard(reference);
    }
    return { revision: written.revision, sources: changes };
  }

  export() {
    const sources = this.store.read().data.sources;
    return {
      mcpServers: Object.fromEntries(
        sources.map((source) => {
          const { configuration } = source;
          const entry =
            configuration.transport === "stdio"
              ? {
                  type: configuration.transport,
                  command: configuration.command,
                  args: configuration.args,
                  ...(configuration.cwd !== undefined && { cwd: configuration.cwd }),
                  env: Object.fromEntries(Object.entries(configuration.environment).map(([name, reference]) => [name, "$" + "{" + reference + "}"])),
                  ...(configuration.credentialEnvironment && { credentialEnvironment: { names: configuration.credentialEnvironment.names } }),
                }
              : {
                  type: configuration.transport,
                  url: configuration.url,
                  nonSecretHeaders: configuration.headers,
                  authentication:
                    configuration.authentication.kind === "credential"
                      ? { kind: "credential-needed", header: configuration.authentication.header }
                      : configuration.authentication.kind === "oauth"
                        ? { kind: "oauth" }
                        : configuration.authentication,
                };
          return [source.namespace, { name: source.displayName, ...entry }];
        }),
      ),
    };
  }
}
