import { errors, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor } from "@huhu/kernel";
import { z } from "zod";
import { SshHostProfile } from "../auth-profile.js";
import { importFormats, importIssueCodes, MAX_BYTES } from "./input.js";
import { previewHostImport } from "./preview.js";
import type { HostConfigurations } from "../host-configurations.js";

const format = z.enum(importFormats);
const location = z.strictObject({ kind: z.enum(["line", "record"]), index: z.int().positive() });
const issue = z.strictObject({ code: z.enum(importIssueCodes), field: z.string().optional(), location: location.optional() });
const field = z.enum(["endpoint", "name"]);
const conflict = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("existing"), field, hostId: z.string() }), z.strictObject({ kind: z.literal("batch"), field, index: z.int().positive() })]);
const preview = z.strictObject({
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

export const hostImportPreviewDescriptor = defineCapabilityDescriptor({
  name: "ssh.hosts.import.preview",
  plugin: "ssh",
  title: "预览 SSH 主机导入",
  description: "解析所选文件，列出主机、冲突和跳过原因。",
  scope: "read",
  risk: "normal",
  exposable: false,
  defaultExposed: false,
  input: z.strictObject({ format, filename: z.string().min(1).max(512), contentBase64: z.base64().max(Math.ceil(MAX_BYTES / 3) * 4), encoding: z.literal("gb18030").optional() }),
  output: preview,
});

export function hostImportPreview(hosts: Pick<HostConfigurations, "list">) {
  return bindCapability(hostImportPreviewDescriptor, async ({ caller, signal }, { contentBase64, encoding, ...input }) => {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(hostImportPreviewDescriptor.name);
    const existing = await hosts.list();
    signal.throwIfAborted();
    return previewHostImport({ ...input, content: Buffer.from(contentBase64, "base64"), ...(encoding && { encoding }) }, existing);
  });
}
