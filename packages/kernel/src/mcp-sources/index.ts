import { randomUUID } from "node:crypto";
import { errors, MCP_ENTRY_KINDS, MCP_MANAGEMENT_ACCESS, McpCatalogViewSchema, McpImportConfirmationSchema, McpPublishPolicySchema, McpSourceCatalogSchema, McpSourceSchema, McpSourcesViewSchema, McpSourceViewSchema, PluginManifestSchema } from "@huhu/contracts";
import { z } from "zod";
import { bindCapability, defineCapabilityDescriptor, type CapabilityContext } from "../capabilities/define.js";
import type { PluginEntry } from "../plugin-manager.js";
import { canonicalJson } from "../idempotency.js";
import { McpSourceRuntime, routeOwner, type McpSourceRuntimeOptions } from "./runtime.js";
import { McpSourceStore } from "./store.js";
import { MAX_MCP_SOURCES, McpSourceImport, mcpImportPreview, sourceNamespace } from "./import.js";
import { validateCredentialHeaders, validateSourceConfiguration } from "./transport.js";
import { clearCredential, credentialReference, McpCredentials, type McpCredentialHost, type McpCredentialMaterial } from "./credentials.js";
import { McpOAuth } from "./oauth.js";

export const MCP_SOURCES_SERVICE = "mcpSources";

const none = z.strictObject({});
const id = z.string().min(1);
const revision = z.int().nonnegative();
const sourceId = z.strictObject({ sourceId: id });
const sourceRevision = sourceId.extend({ expectedRevision: revision });
const sourceInput = McpSourceSchema.pick({ displayName: true, namespace: true, configuration: true }).extend({
  displayName: z.string().trim().min(1).max(128), namespace: sourceNamespace,
});
const state = McpSourceCatalogSchema.shape.state;
const sourceView = McpSourceViewSchema;
const account = z.string().trim().min(1).max(128);
const loginId = z.strictObject({ attemptId: z.uuid() });
const loginState = loginId.extend({ state: z.enum(["waiting", "exchanging", "complete", "cancelled", "expired", "failed"]), expiresAt: z.number() });
const health = z.strictObject({ state, checkedAt: z.string(), diagnostic: z.string().nullable(), toolCount: revision });
const policyInput = z.strictObject({
  expectedPolicyRevision: revision, expectedCatalogRevision: revision,
  choices: z.array(z.strictObject({ sourceId: id, kind: z.enum(MCP_ENTRY_KINDS).optional(), upstreamIdentity: id, selected: z.boolean() })).min(1).max(2048),
});
const approvalInput = sourceRevision.extend({ configurationFingerprint: z.string().regex(/^[a-f0-9]{64}$/) });
const approvalPreview = z.strictObject({ source: McpSourceSchema, configurationFingerprint: z.string(), approved: z.boolean() });

function descriptor<I, O>(name: keyof typeof MCP_MANAGEMENT_ACCESS, title: string, input: z.ZodType<I>, output: z.ZodType<O>) {
  const [scope, risk, defaultExposed] = MCP_MANAGEMENT_ACCESS[name];
  return defineCapabilityDescriptor({
    name, plugin: "mcp", title, description: title, scope, risk,
    input, output, exposable: true, defaultExposed, ...(risk === "high" && { individualExposure: true as const }),
  });
}

const descriptors = {
  list: descriptor("mcp.sources.list", "列出 MCP 来源", none, McpSourcesViewSchema),
  get: descriptor("mcp.sources.get", "查看 MCP 来源", sourceId, sourceView),
  create: descriptor("mcp.sources.create", "添加 MCP 来源（默认停用）", sourceInput, McpSourceSchema),
  update: descriptor("mcp.sources.update", "更新 MCP 来源配置", sourceRevision.extend(sourceInput.omit({ namespace: true }).shape), McpSourceSchema),
  delete: descriptor("mcp.sources.delete", "删除 MCP 来源", sourceRevision, sourceId),
  setEnabled: descriptor("mcp.sources.setEnabled", "启用或停用 MCP 来源", sourceRevision.extend({ enabled: z.boolean() }), McpSourceSchema),
  importPreview: descriptor("mcp.sources.importPreview", "预览导入 MCP 配置", z.strictObject({ text: z.string().min(1).max(128 * 1024) }), mcpImportPreview),
  importCancel: descriptor("mcp.sources.importCancel", "取消 MCP 配置导入", z.strictObject({ previewId: id }), none),
  importCommit: descriptor("mcp.sources.importCommit", "提交 MCP 配置导入", McpImportConfirmationSchema.refine((input) => input.selections.length <= MAX_MCP_SOURCES), z.strictObject({ revision, sources: z.array(McpSourceSchema) })),
  export: descriptor("mcp.sources.export", "脱敏导出 MCP 配置", none, z.strictObject({ mcpServers: z.record(z.string(), z.record(z.string(), z.unknown())) })),
  check: descriptor("mcp.sources.check", "临时检查 MCP 来源", sourceRevision, health),
  reconnect: descriptor("mcp.sources.reconnect", "重新连接 MCP 来源", sourceRevision, health),
  refresh: descriptor("mcp.sources.refresh", "刷新 MCP 目录", sourceRevision, health),
  catalog: descriptor("mcp.catalog.list", "读取 MCP 能力目录", sourceId.partial(), McpCatalogViewSchema),
  diagnostics: descriptor("mcp.diagnostics.get", "查看 MCP 来源诊断", sourceId, sourceView),
  previewPolicy: descriptor("mcp.policy.preview", "预览外部 MCP 发布策略", policyInput, McpPublishPolicySchema),
  updatePolicy: descriptor("mcp.policy.update", "更新外部 MCP 发布策略", policyInput, McpPublishPolicySchema),
  previewApproval: descriptor("mcp.executionApproval.preview", "核对 MCP 本机执行许可", sourceRevision, approvalPreview),
  confirmApproval: descriptor("mcp.executionApproval.confirm", "授予 MCP 本机执行许可", approvalInput, approvalPreview),
  revokeApproval: descriptor("mcp.executionApproval.revoke", "撤销 MCP 本机执行许可", approvalInput, approvalPreview),
  bindCredential: descriptor("mcp.credentials.put", "绑定 MCP 本机静态凭据", sourceRevision.extend({
    account, header: z.string().min(1).max(128), value: z.string().min(1).max(65536),
  }), sourceView),
  removeCredential: descriptor("mcp.credentials.remove", "移除 MCP 本机凭据", sourceRevision, sourceView),
  beginOAuth: descriptor("mcp.oauth.begin", "开始 MCP OAuth 登录", sourceRevision.extend({ account }), loginId.extend({ authorizationUrl: z.url(), expiresAt: z.number() })),
  oauthStatus: descriptor("mcp.oauth.status", "查询 MCP OAuth 登录状态", loginId, loginState),
  cancelOAuth: descriptor("mcp.oauth.cancel", "取消 MCP OAuth 登录", loginId, loginState),
  logoutOAuth: descriptor("mcp.oauth.logout", "注销 MCP OAuth 登录", sourceRevision, sourceView),
};

export const mcpSourceDescriptors = Object.values(descriptors);
const manifest = PluginManifestSchema.parse({
  id: "mcp", title: "MCP 管理", description: "配置外部 MCP 来源、管理本机许可与条目发布",
  version: "0.0.2-rc.1", origin: "builtin", dependsOn: [], optionalDeps: [], permissions: [],
  activation: "vault-open", contributes: {
    modules: [], settingsPages: [], homeWidgets: [], commands: [], fileKinds: [],
    capabilities: mcpSourceDescriptors.map(({ name }) => name),
  },
});

export function createMcpSourcePlugin(options: McpSourceRuntimeOptions & { approvalPath?: string; hostId: string; credentialHost?: McpCredentialHost }): PluginEntry {
  return {
    manifest,
    async apply(ctx, api) {
      const store = new McpSourceStore(api.vault.files, options.approvalPath === undefined ? undefined : {
        path: options.approvalPath, hostId: options.hostId, vaultInstance: options.vaultInstance,
      });
      const credentials = new McpCredentials(store, options.credentialHost);
      const runtime = new McpSourceRuntime(store, {
        ...options,
        catalogChanged: () => api.events.publish("entity.changed", { kind: "mcp-source", id: "catalog", op: "updated" }),
      }, credentials);
      const emit = (id: string, op: "created" | "updated" | "deleted" = "updated") => api.events.publish("entity.changed", { kind: "mcp-source", id, op });
      const present = async (source: Parameters<typeof runtime.view>[0]) => ({ ...runtime.view(source), credential: await credentials.status(source) });
      const replaceCredential = async (
        source: Parameters<typeof runtime.view>[0], identity: string, material: McpCredentialMaterial | undefined,
        context: CapabilityContext, isCurrent = () => credentials.current(source),
      ) => {
        const staged = material && await credentials.stage(source, identity, material, context.signal, isCurrent);
        const next = { ...source, configuration: staged?.configuration ?? clearCredential(source.configuration), revision: source.revision + 1 };
        try {
          await store.change(context, (data) => {
            if (!isCurrent()) throw errors.versionConflict(String(store.source(source.sourceId).revision));
            data.connectionRevisions[source.sourceId] = (data.connectionRevisions[source.sourceId] ?? 0) + 1;
            data.sources = data.sources.map((entry) => entry.sourceId === source.sourceId ? next : entry);
          }, () => { if (!isCurrent()) throw errors.versionConflict(String(source.revision)); });
        } catch (error) {
          if (staged) await credentials.discard(staged.reference, staged.revision);
          throw error;
        }
        runtime.invalidate(source.sourceId);
        emit(source.sourceId);
        const previous = credentialReference(source);
        if (previous) await credentials.discard(previous);
        return next;
      };
      const oauth = new McpOAuth(credentials, async (source, identity, material, context, isCurrent) => {
        await replaceCredential(source, identity, material, context, isCurrent);
      });
      const importer = new McpSourceImport(store, credentials, (sources) => {
        for (const source of sources) {
          oauth.cancelSource(source.sourceId);
          runtime.invalidate(source.sourceId);
          emit(source.sourceId, source.revision === 1 ? "created" : "updated");
        }
      });
      ctx.effect(() => async () => {
        oauth.dispose();
        importer.dispose();
        credentials.dispose();
        await runtime.dispose();
      });
      api.provide(MCP_SOURCES_SERVICE, runtime);
      await credentials.reconcile().catch(() => undefined);
      const getChecked = ({ sourceId, expectedRevision }: z.infer<typeof sourceRevision>) => {
        const source = store.source(sourceId);
        if (source.revision !== expectedRevision) throw errors.versionConflict(String(source.revision));
        return source;
      };
      const probe = async (context: CapabilityContext, input: z.infer<typeof sourceRevision>, reconnect: boolean, useLive: boolean) => {
        const source = getChecked(input);
        store.files.assertWritable();
        context.signal.throwIfAborted();
        context.assertCapabilityCurrent?.();
        if (reconnect) runtime.invalidate(source.sourceId);
        const result = await runtime.check(source, context.signal, useLive);
        emit(source.sourceId);
        return { state: result.state, checkedAt: result.checkedAt, diagnostic: result.diagnostic, toolCount: result.state === "ready" ? result.entries.filter((entry) => entry.kind === "tool").length : 0 };
      };
      const preview = (input: z.infer<typeof sourceRevision>) => {
        const source = getChecked(input);
        if (source.configuration.transport !== "stdio") throw errors.invalidInput("仅 stdio 来源需要本机执行许可");
        return { source, configurationFingerprint: store.fingerprint(source), approved: store.approved(source) };
      };
      const approve = async (context: CapabilityContext, input: z.infer<typeof approvalInput>, approved: boolean) => {
        const current = preview(input);
        await store.setApproval(context, current.source, input.configurationFingerprint, approved);
        runtime.invalidate(input.sourceId);
        emit(input.sourceId);
        return { ...current, approved };
      };
      const nextPolicy = (data: ReturnType<McpSourceStore["read"]>["data"], input: z.infer<typeof policyInput>, reserveNames = false) => {
        const catalog = runtime.catalogView();
        if (data.policy.revision !== input.expectedPolicyRevision) throw errors.versionConflict(String(data.policy.revision));
        if (catalog.catalogRevision !== input.expectedCatalogRevision) throw errors.versionConflict(String(catalog.catalogRevision));
        const index = new Map(data.policy.selected.map((entry) => [routeOwner(entry.sourceId, entry.kind, entry.upstreamIdentity), entry]));
        const seen = new Set<string>();
        for (const { sourceId, kind = "tool", upstreamIdentity, selected } of input.choices) {
          if (sourceId === "builtin") throw errors.invalidInput("内置条目请通过能力网关授权");
          const key = routeOwner(sourceId, kind, upstreamIdentity);
          if (seen.has(key)) throw errors.invalidInput("发布选择包含重复工具");
          seen.add(key);
          if (selected) {
            const entry = catalog.entries.find((item) => item.sourceId === sourceId && item.kind === kind && item.upstreamIdentity === upstreamIdentity);
            if (!entry) throw errors.notFound("当前目录中没有该条目");
            if ((kind === "tool" && options.isBuiltinName(entry.publicKey)) || Object.entries(data.publicKeys).some(([owner, name]) => {
              if (owner === key || name !== entry.publicKey) return false;
              const parts = JSON.parse(owner) as string[];
              return (parts.length === 2 ? "tool" : parts[1]) === kind;
            })) {
              throw errors.nameConflict(entry.publicKey);
            }
            if (reserveNames) data.publicKeys[key] = entry.publicKey;
            index.set(key, { sourceId, upstreamIdentity, kind });
          } else index.delete(key);
        }
        return { revision: data.policy.revision + 1, catalogRevision: catalog.catalogRevision, selected: [...index.values()] };
      };
      api.defineCapability(bindCapability(descriptors.list, async () => {
        const { data } = store.read();
        return { revision: data.revision, sources: await Promise.all(data.sources.map(present)), readOnly: store.files.readOnly, credentialHostAvailable: credentials.available };
      }));
      api.defineCapability(bindCapability(descriptors.get, (_context, input) => present(store.source(input.sourceId))));
      api.defineCapability(bindCapability(descriptors.diagnostics, (_context, input) => present(store.source(input.sourceId))));
      api.defineCapability(bindCapability(descriptors.create, async (context, input) => {
        validateSourceConfiguration(input.configuration);
        const source = { ...input, sourceId: randomUUID(), enabled: false, revision: 1 };
        await store.change(context, (data) => {
          if (data.sources.length >= MAX_MCP_SOURCES) throw errors.invalidInput("MCP 来源总数已达上限");
          if (Object.hasOwn(data.namespaces, source.namespace) || data.sources.some(({ displayName }) => displayName === source.displayName)) {
            throw errors.nameConflict(source.namespace);
          }
          data.namespaces[source.namespace] = source.sourceId;
          data.sources.push(source);
        });
        emit(source.sourceId, "created");
        return source;
      }));
      api.defineCapability(bindCapability(descriptors.update, async (context, input) => {
        const previous = getChecked(input);
        const priorRef = credentialReference(previous);
        const retainsCredential = !!priorRef && canonicalJson(previous.configuration) === canonicalJson(input.configuration);
        const configuration = retainsCredential ? previous.configuration : clearCredential(input.configuration);
        if (!retainsCredential) validateSourceConfiguration(configuration);
        const changed = canonicalJson(previous.configuration) !== canonicalJson(configuration);
        const next = { ...previous, displayName: input.displayName, configuration, revision: previous.revision + 1 };
        await store.change(context, (data) => {
          if (data.sources.some((source) => source.sourceId !== input.sourceId && source.displayName === next.displayName)) throw errors.nameConflict(next.displayName);
          if (changed) data.connectionRevisions[input.sourceId] = (data.connectionRevisions[input.sourceId] ?? 0) + 1;
          data.sources = data.sources.map((source) => source.sourceId === input.sourceId ? next : source);
        });
        oauth.cancelSource(input.sourceId);
        if (changed) runtime.invalidate(input.sourceId);
        if (priorRef && !retainsCredential) await credentials.discard(priorRef);
        emit(input.sourceId);
        return next;
      }));
      api.defineCapability(bindCapability(descriptors.delete, async (context, input) => {
        const source = getChecked(input);
        await store.change(context, (data) => {
          data.sources = data.sources.filter(({ sourceId }) => sourceId !== input.sourceId);
          const selected = data.policy.selected.filter(({ sourceId }) => sourceId !== input.sourceId);
          if (selected.length !== data.policy.selected.length) data.policy = { ...data.policy, revision: data.policy.revision + 1, selected };
        });
        runtime.invalidate(input.sourceId, true);
        oauth.cancelSource(input.sourceId);
        const reference = credentialReference(source);
        if (reference) await credentials.discard(reference);
        emit(input.sourceId, "deleted");
        return { sourceId: input.sourceId };
      }));
      api.defineCapability(bindCapability(descriptors.setEnabled, async (context, input) => {
        store.files.assertWritable();
        const previous = getChecked(input);
        if (previous.enabled === input.enabled) return previous;
        const next = { ...previous, enabled: input.enabled, revision: previous.revision + 1 };
        await store.change(context, (data) => { data.sources = data.sources.map((source) => source.sourceId === input.sourceId ? next : source); });
        runtime.invalidate(input.sourceId);
        oauth.cancelSource(input.sourceId);
        emit(input.sourceId);
        return next;
      }));
      api.defineCapability(bindCapability(descriptors.check, (context, input) => probe(context, input, false, false)));
      api.defineCapability(bindCapability(descriptors.importPreview, (context, input) => importer.preview(context, input.text)));
      api.defineCapability(bindCapability(descriptors.importCancel, (context, input) => importer.cancel(context, input.previewId)));
      api.defineCapability(bindCapability(descriptors.importCommit, (context, input) => importer.commit(context, input)));
      api.defineCapability(bindCapability(descriptors.export, () => importer.export()));
      api.defineCapability(bindCapability(descriptors.refresh, (context, input) => probe(context, input, false, true)));
      api.defineCapability(bindCapability(descriptors.reconnect, (context, input) => probe(context, input, true, true)));
      api.defineCapability(bindCapability(descriptors.catalog, (_context, input) => runtime.catalogView(input.sourceId)));
      api.defineCapability(bindCapability(descriptors.previewPolicy, (_context, input) => nextPolicy(store.read().data, input)));
      api.defineCapability(bindCapability(descriptors.updatePolicy, async (context, input) => {
        const written = await store.change(context, (data) => { data.policy = nextPolicy(data, input, true); }, () => {
          if (input.expectedCatalogRevision !== runtime.catalogRevision) throw errors.versionConflict(String(runtime.catalogRevision));
        });
        runtime.publicationChanged();
        emit("policy");
        return written.policy;
      }));
      api.defineCapability(bindCapability(descriptors.previewApproval, (_context, input) => preview(input)));
      api.defineCapability(bindCapability(descriptors.confirmApproval, (context, input) => approve(context, input, true)));
      api.defineCapability(bindCapability(descriptors.revokeApproval, (context, input) => approve(context, input, false)));
      api.defineCapability(bindCapability(descriptors.bindCredential, async (context, input) => {
        const source = getChecked(input);
        if (source.configuration.transport === "stdio" || source.configuration.authentication.kind === "oauth") {
          throw errors.invalidInput("请选择 HTTP 静态认证");
        }
        const headers = { [input.header]: input.value };
        validateCredentialHeaders(headers);
        oauth.cancelSource(input.sourceId);
        return present(await replaceCredential(source, input.account, { kind: "remote", headers, query: "" }, context));
      }));
      const unlink = async (context: CapabilityContext, input: z.infer<typeof sourceRevision>) => {
        const source = getChecked(input);
        oauth.cancelSource(source.sourceId);
        return present(await replaceCredential(source, "", undefined, context));
      };
      api.defineCapability(bindCapability(descriptors.removeCredential, unlink));
      api.defineCapability(bindCapability(descriptors.logoutOAuth, async (context, input) => {
        const source = getChecked(input);
        if (source.configuration.transport !== "streamable-http" || source.configuration.authentication.kind !== "oauth") throw errors.invalidInput("来源未配置 OAuth");
        return unlink(context, input);
      }));
      api.defineCapability(bindCapability(descriptors.beginOAuth, (context, input) => oauth.begin(getChecked(input), input.account, context)));
      api.defineCapability(bindCapability(descriptors.oauthStatus, (context, input) => oauth.status(context, input.attemptId)));
      api.defineCapability(bindCapability(descriptors.cancelOAuth, (context, input) => oauth.cancel(context, input.attemptId)));
    },
  };
}
