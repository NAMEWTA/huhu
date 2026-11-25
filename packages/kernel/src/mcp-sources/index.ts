import { randomUUID } from "node:crypto";
import { errors, MCP_ENTRY_KINDS, MCP_MANAGEMENT_ACCESS, McpCatalogViewSchema, McpImportConfirmationSchema, McpPublishPolicySchema, McpSourceCatalogSchema, McpSourceSchema, PluginManifestSchema } from "@huhu/contracts";
import { z } from "zod";
import { bindCapability, defineCapabilityDescriptor, type CapabilityContext } from "../capabilities/define.js";
import type { PluginEntry } from "../plugin-manager.js";
import { canonicalJson } from "../idempotency.js";
import { McpSourceRuntime, routeOwner, type McpSourceRuntimeOptions } from "./runtime.js";
import { McpSourceStore } from "./store.js";
import { MAX_MCP_SOURCES, McpSourceImport, mcpImportPreview, sourceNamespace } from "./import.js";
import { validateSourceConfiguration } from "./transport.js";

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
const sourceView = z.strictObject({ source: McpSourceSchema, state, approved: z.boolean(), checkedAt: z.string().nullable(), diagnostic: z.string().nullable() });
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
  list: descriptor("mcp.sources.list", "列出 MCP 来源", none, z.strictObject({ revision, sources: z.array(sourceView) })),
  get: descriptor("mcp.sources.get", "查看 MCP 来源", sourceId, sourceView),
  create: descriptor("mcp.sources.create", "添加 MCP 来源（默认停用）", sourceInput, McpSourceSchema),
  update: descriptor("mcp.sources.update", "更新 MCP 来源配置", sourceRevision.extend(sourceInput.omit({ namespace: true }).shape), McpSourceSchema),
  delete: descriptor("mcp.sources.delete", "删除 MCP 来源", sourceRevision, sourceId),
  setEnabled: descriptor("mcp.sources.setEnabled", "启用或停用 MCP 来源", sourceRevision.extend({ enabled: z.boolean() }), McpSourceSchema),
  importPreview: descriptor("mcp.sources.importPreview", "预览导入 MCP 配置", z.strictObject({ text: z.string().min(1).max(128 * 1024) }), mcpImportPreview),
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

export function createMcpSourcePlugin(options: McpSourceRuntimeOptions & { approvalPath?: string; hostId: string }): PluginEntry {
  return {
    manifest,
    apply(ctx, api) {
      const store = new McpSourceStore(api.vault.files, options.approvalPath === undefined ? undefined : {
        path: options.approvalPath, hostId: options.hostId, vaultInstance: options.vaultInstance,
      });
      const runtime = new McpSourceRuntime(store, options);
      ctx.effect(() => () => runtime.dispose());
      api.provide(MCP_SOURCES_SERVICE, runtime);
      const emit = (id: string, op: "created" | "updated" | "deleted" = "updated") => api.events.publish("entity.changed", { kind: "mcp-source", id, op });
      const importer = new McpSourceImport(store, (sources) => {
        for (const source of sources) {
          runtime.invalidate(source.sourceId);
          emit(source.sourceId, source.revision === 1 ? "created" : "updated");
        }
      });
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
      api.defineCapability(bindCapability(descriptors.list, () => {
        const { data } = store.read();
        return { revision: data.revision, sources: data.sources.map((source) => runtime.view(source)) };
      }));
      api.defineCapability(bindCapability(descriptors.get, (_context, input) => runtime.view(store.source(input.sourceId))));
      api.defineCapability(bindCapability(descriptors.diagnostics, (_context, input) => runtime.view(store.source(input.sourceId))));
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
        validateSourceConfiguration(input.configuration);
        const previous = getChecked(input);
        const changed = canonicalJson(previous.configuration) !== canonicalJson(input.configuration);
        const next = { ...previous, displayName: input.displayName, configuration: input.configuration, revision: previous.revision + 1 };
        await store.change(context, (data) => {
          if (data.sources.some((source) => source.sourceId !== input.sourceId && source.displayName === next.displayName)) throw errors.nameConflict(next.displayName);
          if (changed) data.connectionRevisions[input.sourceId] = (data.connectionRevisions[input.sourceId] ?? 0) + 1;
          data.sources = data.sources.map((source) => source.sourceId === input.sourceId ? next : source);
        });
        if (changed) runtime.invalidate(input.sourceId);
        emit(input.sourceId);
        return next;
      }));
      api.defineCapability(bindCapability(descriptors.delete, async (context, input) => {
        getChecked(input);
        await store.change(context, (data) => {
          data.sources = data.sources.filter(({ sourceId }) => sourceId !== input.sourceId);
          const selected = data.policy.selected.filter(({ sourceId }) => sourceId !== input.sourceId);
          if (selected.length !== data.policy.selected.length) data.policy = { ...data.policy, revision: data.policy.revision + 1, selected };
        });
        runtime.invalidate(input.sourceId, true);
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
        emit(input.sourceId);
        return next;
      }));
      api.defineCapability(bindCapability(descriptors.check, (context, input) => probe(context, input, false, false)));
      api.defineCapability(bindCapability(descriptors.importPreview, (context, input) => importer.preview(context, input.text)));
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
    },
  };
}
