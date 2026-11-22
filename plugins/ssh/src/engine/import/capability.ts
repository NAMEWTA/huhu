import { createHash, createHmac, randomBytes } from "node:crypto";
import { CapabilityIntentKeySchema, errors, isHuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type CapabilityContext, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { SshHostProfile } from "../auth-profile.js";
import { importFormats, importIssueCodes, MAX_BYTES, MAX_RECORDS, type ImportIssue } from "./input.js";
import { hostEndpoint, hostName, previewHostImport } from "./preview.js";
import type { HostConfigurations, HostRecord, SshCredentialHost } from "../host-configurations.js";
import type { HostDirectory } from "../directory.js";
import { type HostIntents, withIntentSeal } from "../host-intents.js";
import { externalSshOwner, visibleSshRoutes } from "../public-resources.js";

const format = z.enum(importFormats);
const location = z.strictObject({ kind: z.enum(["line", "record"]), index: z.int().positive() });
const issue = z.strictObject({ code: z.enum(importIssueCodes), field: z.string().optional(), location: location.optional() });
const field = z.enum(["endpoint", "name"]);
const conflict = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("existing"), field, hostId: z.string() }), z.strictObject({ kind: z.literal("batch"), field, index: z.int().positive() })]);
const preview = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  format,
  filename: z.string(),
  rows: z.array(
    z.strictObject({
      index: z.int().positive(),
      location,
      state: z.enum(["ready", "conflict", "skipped"]),
      issues: z.array(issue),
      profile: SshHostProfile.optional(),
      group: z.array(z.string()).optional(),
      conflicts: z.array(conflict).optional(),
    }),
  ),
  issues: z.array(issue),
});
const source = z.strictObject({ format, filename: z.string().min(1).max(512), contentBase64: z.base64().max(Math.ceil(MAX_BYTES / 3) * 4), encoding: z.literal("gb18030").optional() });
type Source = z.infer<typeof source>;
const selection = z.strictObject({
  index: z.int().positive(),
  renameTo: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[^\p{Cc}\p{Cf}]+$/u)
    .optional(),
});
const confirm = z.strictObject({ source, token: preview.shape.token, selected: z.array(selection).min(1).max(MAX_RECORDS), intentKey: CapabilityIntentKeySchema.optional() });
type Confirm = z.infer<typeof confirm>;

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type CatalogueHost = Pick<z.infer<typeof SshHostProfile>, "name" | "host" | "port" | "user"> & { id: string; revision?: string };

function catalogueFor(hosts: readonly CatalogueHost[]) {
  return [...hosts].sort((a, b) => a.id.localeCompare(b.id)).map((host) => ({ id: host.id, name: hostName(host.name), endpoint: hostEndpoint(host), revision: host.revision ?? null }));
}

function tokenFor(source: Source, hosts: readonly CatalogueHost[]): string {
  return digest([source.format, source.filename, source.encoding, source.contentBase64, catalogueFor(hosts)]);
}

const sourceKey = ({ format, filename, encoding, contentBase64 }: Source) => digest([format, filename, encoding, contentBase64]);

function parseSource({ contentBase64, encoding, ...input }: Source, existing: readonly CatalogueHost[]) {
  return previewHostImport({ ...input, content: Buffer.from(contentBase64, "base64"), ...(encoding && { encoding }) }, existing);
}

export const hostImportPreviewDescriptor = defineCapabilityDescriptor({
  name: "ssh.hosts.import.preview",
  plugin: "ssh",
  title: "预览 SSH 主机导入",
  description: "解析提交的文件内容，列出主机、冲突和跳过原因。外部预览按当前授权筛选已有冲突。",
  scope: "read",
  risk: "normal",
  exposable: true,
  defaultExposed: false,
  resourceGuarded: "ssh.hosts",
  input: source,
  output: preview,
});

export const hostImportConfirmDescriptor = defineCapabilityDescriptor({
  name: "ssh.hosts.import.confirm",
  plugin: "ssh",
  title: "确认导入所选 SSH 主机",
  description: "复核原预览及冲突状态，创建明确选中的新主机。外部导入需要稳定的意图键，新主机仍须由工作台授予使用权限。",
  scope: "write",
  risk: "normal",
  desktopOnly: true,
  exposable: true,
  defaultExposed: false,
  resourceGuarded: "ssh.hosts",
  idempotency: "handler",
  input: confirm,
  output: z.strictObject({
    imported: z.array(z.strictObject({ index: z.int().positive(), hostId: z.string(), name: z.string() })),
    groups: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("saved") }), z.strictObject({ state: z.literal("pending"), message: z.string() })]),
  }),
});

const publicIssue = ({ code, location }: ImportIssue) => ({ code, ...(location && { location }) });

function plan(input: Confirm, current: HostRecord[], external = false) {
  const choices = new Set(input.selected.map(({ index }) => index));
  if (choices.size !== input.selected.length) throw errors.invalidInput("同一行只可选择一次");
  const original = new Map(parseSource(input.source, []).rows.map((row) => [row.index, row]));
  const planned = input.selected.map(({ index, renameTo }) => {
    const row = original.get(index);
    if (!row?.profile) throw errors.invalidInput(`第 ${index} 行没有可导入的主机`);
    const profile = renameTo ? { ...row.profile, name: renameTo } : row.profile;
    const hostId = `host-owned-${digest([input.token, index, profile.name]).slice(0, 32)}`;
    return { index, hostId, profile, group: row.group ?? [] };
  });
  const ourRows = new Map(planned.map((row) => [row.hostId, row]));
  const baseline = current.filter((host) => {
    const intended = ourRows.get(host.id);
    if (!intended) return true;
    if (external) throw errors.invalidInput("部分选中主机与目录冲突，请重新预览并检查选项");
    if (!("revision" in host) || host.auth.kind !== "agent" || digest(SshHostProfile.parse(host)) !== digest(SshHostProfile.parse(intended.profile))) {
      throw errors.invalidInput("先前导入的主机已修改，请重新预览");
    }
    return false;
  });
  if (!external) {
    const actual = tokenFor(input.source, baseline);
    if (actual !== input.token) throw errors.versionConflict(actual);
  }
  const endpoints = new Set(baseline.map(hostEndpoint));
  const names = new Set(baseline.map(({ name }) => hostName(name)));
  for (const { index, profile } of planned) {
    const target = hostEndpoint(profile);
    const name = hostName(profile.name);
    if (endpoints.has(target) || names.has(name)) {
      throw errors.invalidInput(external ? "部分选中主机与目录冲突，请重新预览并检查选项" : `第 ${index} 行仍有主机冲突，请跳过该行或修改重名`);
    }
    endpoints.add(target);
    names.add(name);
  }
  return planned;
}

export function hostImportCapabilities(
  hosts: HostConfigurations,
  directory: HostDirectory,
  files: HuhuApi["vault"]["files"],
  intents: HostIntents | undefined,
  credentials: SshCredentialHost | undefined,
  changed: (kind: "ssh-host" | "ssh-host-directory", id: string) => void,
) {
  const key = randomBytes(32);
  const externalScope = (context: CapabilityContext, sourceDigest: string) => {
    const owner = externalSshOwner(context);
    const routes = [...visibleSshRoutes(files, context).values()].sort((a, b) => a.hostId.localeCompare(b.hostId));
    const existing = routes.map(({ hostId, name, host, port, user, revision }) => ({ id: hostId, name, host, port, user, revision }));
    const hostIds = [...new Set(routes.flatMap(({ route }) => route.map(({ hostId }) => hostId)))];
    const scope = directory.importScope(new Set(hostIds));
    const token = createHmac("sha256", key)
      .update(JSON.stringify([owner, sourceDigest, catalogueFor(existing), routes.map(({ routeRevision }) => routeRevision), scope.version]))
      .digest("hex");
    return { existing, scope, token, hostIds };
  };
  const previewCapability = bindCapability(hostImportPreviewDescriptor, async (context, input) => {
    if (isWorkbenchCaller(context.caller)) {
      const existing = await hosts.list();
      context.signal.throwIfAborted();
      return { ...parseSource(input, existing), token: tokenFor(input, existing) };
    }
    const { existing, token } = externalScope(context, sourceKey(input));
    context.signal.throwIfAborted();
    const result = parseSource(input, existing);
    return { ...result, token, issues: result.issues.map(publicIssue), rows: result.rows.map((row) => ({ ...row, issues: row.issues.map(publicIssue) })) };
  });
  const publish = async (input: Confirm, signal: AbortSignal, scope?: ReturnType<HostDirectory["importScope"]>, assertCurrent?: () => void) => {
    const rows = await hosts.importProfiles((current) => plan(input, current, !!scope), signal, assertCurrent);
    const imported = rows.map(({ index, hostId, profile }) => ({ index, hostId, name: profile.name }));
    for (const { hostId } of imported) changed("ssh-host", hostId);
    try {
      assertCurrent?.();
      if (await directory.placeImported(rows, signal, scope, assertCurrent)) changed("ssh-host-directory", "directory");
      return { imported, groups: { state: "saved" as const } };
    } catch (error) {
      if (signal.aborted) throw error;
      return { imported, groups: { state: "pending" as const, message: !scope && isHuhuError(error) ? error.message : "主机已保存，分组尚未落盘" } };
    }
  };
  const confirmCapability = bindCapability(hostImportConfirmDescriptor, async (context, input) => {
    if (isWorkbenchCaller(context.caller)) return publish(input, context.signal);
    if (!intents || !input.intentKey) throw errors.invalidInput("外部 SSH 主机导入需要稳定的意图键");
    const source = sourceKey(input.source);
    const getScope = () => externalScope(context, source);
    const sourceDigest = await withIntentSeal(credentials, (seal) => seal(["ssh.hosts.import", source]));
    return intents.run(context, hostImportConfirmDescriptor.name, {
      hosts: [],
      intentKey: input.intentKey,
      input: { sourceDigest, token: input.token, selected: input.selected },
      output: hostImportConfirmDescriptor.output,
      authorize: () => getScope().hostIds,
      run: async (assertCurrent) => {
        const checkPreview = () => {
          assertCurrent();
          // Verify the original source, route selection and directory immediately before each write.
          const { scope, token } = getScope();
          if (token !== input.token) throw errors.invalidInput("SSH 导入预览已失效，请重新预览");
          return scope;
        };
        return publish(input, context.signal, checkPreview(), checkPreview);
      },
    });
  });
  return [previewCapability, confirmCapability] as const;
}
