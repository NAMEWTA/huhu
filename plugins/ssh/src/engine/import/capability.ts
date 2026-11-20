import { createHash } from "node:crypto";
import { errors, isHuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor } from "@huhu/kernel";
import { z } from "zod";
import { SshHostProfile } from "../auth-profile.js";
import { importFormats, importIssueCodes, MAX_BYTES, MAX_RECORDS } from "./input.js";
import { hostEndpoint, hostName, previewHostImport } from "./preview.js";
import type { HostConfigurations, HostRecord } from "../host-configurations.js";
import type { HostDirectory } from "../directory.js";

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
const confirm = z.strictObject({ source, token: preview.shape.token, selected: z.array(selection).min(1).max(MAX_RECORDS) });
type Confirm = z.infer<typeof confirm>;

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function tokenFor(source: Source, hosts: readonly HostRecord[]): string {
  const catalogue = [...hosts].sort((a, b) => a.id.localeCompare(b.id)).map((host) => ({ id: host.id, name: hostName(host.name), endpoint: hostEndpoint(host), revision: "revision" in host ? host.revision : null }));
  return digest([source.format, source.filename, source.encoding, source.contentBase64, catalogue]);
}

function parseSource({ contentBase64, encoding, ...input }: Source, existing: readonly HostRecord[]) {
  return previewHostImport({ ...input, content: Buffer.from(contentBase64, "base64"), ...(encoding && { encoding }) }, existing);
}

export const hostImportPreviewDescriptor = defineCapabilityDescriptor({
  name: "ssh.hosts.import.preview",
  plugin: "ssh",
  title: "预览 SSH 主机导入",
  description: "解析所选文件，列出主机、冲突和跳过原因。",
  scope: "read",
  risk: "normal",
  exposable: false,
  defaultExposed: false,
  input: source,
  output: preview,
});

export const hostImportConfirmDescriptor = defineCapabilityDescriptor({
  name: "ssh.hosts.import.confirm",
  plugin: "ssh",
  title: "确认导入所选 SSH 主机",
  description: "复核原预览及冲突状态，创建明确选中的新主机。",
  scope: "write",
  risk: "normal",
  desktopOnly: true,
  exposable: false,
  defaultExposed: false,
  input: confirm,
  output: z.strictObject({
    imported: z.array(z.strictObject({ index: z.int().positive(), hostId: z.string(), name: z.string() })),
    groups: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("saved") }), z.strictObject({ state: z.literal("pending"), message: z.string() })]),
  }),
});

export function hostImportPreview(hosts: Pick<HostConfigurations, "list">) {
  return bindCapability(hostImportPreviewDescriptor, async ({ caller, signal }, input) => {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(hostImportPreviewDescriptor.name);
    const existing = await hosts.list();
    signal.throwIfAborted();
    return { ...parseSource(input, existing), token: tokenFor(input, existing) };
  });
}

function plan(input: Confirm, current: HostRecord[]) {
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
    if (!("revision" in host) || host.auth.kind !== "agent" || digest(SshHostProfile.parse(host)) !== digest(SshHostProfile.parse(intended.profile))) {
      throw errors.invalidInput("先前导入的主机已修改，请重新预览");
    }
    return false;
  });
  const actual = tokenFor(input.source, baseline);
  if (actual !== input.token) throw errors.versionConflict(actual);
  const endpoints = new Set(baseline.map(hostEndpoint));
  const names = new Set(baseline.map(({ name }) => hostName(name)));
  for (const { index, profile } of planned) {
    const target = hostEndpoint(profile);
    const name = hostName(profile.name);
    if (endpoints.has(target) || names.has(name)) throw errors.invalidInput(`第 ${index} 行仍有主机冲突，请跳过该行或修改重名`);
    endpoints.add(target);
    names.add(name);
  }
  return planned;
}

export function hostImportConfirm(hosts: Pick<HostConfigurations, "importProfiles">, directory: Pick<HostDirectory, "placeImported">, changed: (kind: "ssh-host" | "ssh-host-directory", id: string) => void) {
  return bindCapability(hostImportConfirmDescriptor, async ({ caller, signal }, input) => {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(hostImportConfirmDescriptor.name);
    const rows = await hosts.importProfiles((current) => plan(input, current), signal);
    const imported = rows.map(({ index, hostId, profile }) => ({ index, hostId, name: profile.name }));
    for (const { hostId } of imported) changed("ssh-host", hostId);
    try {
      if (await directory.placeImported(rows, signal)) changed("ssh-host-directory", "directory");
      return { imported, groups: { state: "saved" as const } };
    } catch (error) {
      if (signal.aborted) throw error;
      return { imported, groups: { state: "pending" as const, message: isHuhuError(error) ? error.message : "主机已保存，分组尚未落盘" } };
    }
  });
}
