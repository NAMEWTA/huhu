import path from "node:path";
import { CapabilityIntentKeySchema, errors, HuhuError } from "@huhu/contracts";
import type { CapabilityContext } from "@huhu/kernel";
import type { Client } from "ssh2";
import { z } from "zod";
import { ArchiveRequest, ArchiveResult, ArchiveSupport } from "../shared/archives.js";
import { RemoteFilePath } from "../shared/files.js";
import { TransferEndpoint } from "../shared/transfers.js";
import { TargetRevision, type PublicFileSessions } from "./public-files.js";
import { remoteArchiveScript } from "./remote-archive-script.js";
import { captureSshCommand, RemoteCommandError } from "./ssh-exec.js";
import { safeTreeName } from "./transfer-tree.js";
import { ZIP_MAX_BYTES } from "./windows-zip.js";

const ArchiveFormat = z.enum(["tar", "tar.gz", "zip"]);
const Formats = z.array(ArchiveFormat).max(3);
export const RemoteArchiveSupport = ArchiveSupport.extend({ formats: Formats });
export const RemoteArchiveRequest = ArchiveRequest.omit({ localFileSessionId: true }).extend({
  directory: TransferEndpoint.options[1].extend({ path: RemoteFilePath.max(4096) }),
  sourceRevision: TargetRevision,
  overwrite: z.boolean().default(false),
  targetRevision: TargetRevision.optional(),
  maxBytes: z.int().min(1).max(ZIP_MAX_BYTES),
  intentKey: CapabilityIntentKeySchema,
});

const quote = (arg: string) => "'" + arg.replaceAll("'", "'\\''") + "'";
const python = (script: string) => `exec python3 -I -c ${quote(script)}`;
export const remoteArchiveProbe = python(
  'import ctypes, json, os, resource, shutil, tarfile, zipfile; tar = bool(shutil.which("tar")); print(json.dumps((["tar"] if tar else []) + (["tar.gz"] if tar and shutil.which("gzip") else []) + (["zip"] if shutil.which("zip") else []) if hasattr(os, "O_NOFOLLOW") and hasattr(ctypes.CDLL(None), "renameat2") else []))',
);
const remoteArchiveCommand = python(remoteArchiveScript);
const validName = (name: string) => safeTreeName(name) && !name.startsWith(".huhu-archive-") && Buffer.byteLength(name) <= 255 && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(name);

function kindOf(name: string): z.infer<typeof ArchiveFormat> {
  const suffix = name.toLowerCase();
  if (suffix.endsWith(".tar.gz") || suffix.endsWith(".tgz")) return "tar.gz";
  if (suffix.endsWith(".tar")) return "tar";
  if (suffix.endsWith(".zip")) return "zip";
  throw errors.invalidInput("只支持 .tar、.tar.gz、.tgz 或 .zip 归档");
}

export class PublicArchives {
  private readonly formats = new WeakMap<Client, Promise<z.infer<typeof Formats>>>();

  constructor(private readonly files: PublicFileSessions) {}

  support(context: CapabilityContext, fileSessionId: string) {
    return this.files.use(context, fileSessionId, async (files) => {
      const { client, signal } = files.remoteClient(fileSessionId, context.signal);
      const formats = await this.probe(client, signal);
      return {
        local: { zip: false, reason: "外部文件会话仅支持远端归档" },
        remote: { zip: formats.includes("zip"), reason: formats.length ? "由所选 SSH 主机处理文件和暂存" : "该 SSH 主机缺少支持的归档工具" },
        nativeSelection: "只使用当前远端文件会话中的目录。",
        otherFormats: formats.join("、"),
        formats,
      };
    });
  }

  run(context: CapabilityContext, { directory, intentKey, ...request }: z.infer<typeof RemoteArchiveRequest>) {
    const { fileSessionId } = directory;
    const { name, operation, output, sourceRevision, overwrite, targetRevision, maxBytes } = request;
    if (!validName(name) || (output !== undefined && (!validName(output) || name === output))) throw errors.invalidInput("归档源和目标必须是同一目录中不同的普通名称");
    if (operation === "list" ? output !== undefined : !output) throw errors.invalidInput("压缩和解压必须指定输出，查看归档只需指定源");
    if (overwrite !== (targetRevision !== undefined) || (overwrite && operation !== "compress")) throw errors.invalidInput("只有压缩可以覆盖普通归档文件，且须确认目标原修订");
    if (!directory.path.startsWith("/") || directory.path.split("/").includes("..") || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(directory.path)) {
      throw errors.invalidInput("请选择无上级路径段的远端绝对目录");
    }
    const root = path.posix.normalize(directory.path).replace(/\/$/, "") || "/";
    const archive = operation === "compress" ? output! : name;
    const kind = kindOf(archive);
    return this.files.mutate(context, "ssh.archives.run", { fileSessionId, intentKey }, { root, ...request }, ArchiveResult, (check) =>
      this.files.use(context, fileSessionId, async (files) => {
        const { client, signal } = files.remoteClient(fileSessionId, context.signal);
        if (!(await this.probe(client, signal)).includes(kind)) throw errors.invalidInput("当前 SSH 主机未提供该归档格式");
        check();
        const args = [operation, root, name, output ?? null, kind, maxBytes, sourceRevision, targetRevision ?? null];
        let reply;
        try {
          reply = await captureSshCommand(client, `${remoteArchiveCommand} ${quote(JSON.stringify(args))}`, AbortSignal.any([signal, AbortSignal.timeout(100_000)]), 512 * 1024, true);
        } catch (error) {
          if (error instanceof RemoteCommandError && error.reason === "denied") throw errors.permissionDenied("SSH 远端归档");
          throw error;
        }
        if (reply.code === 2) throw errors.invalidInput("归档格式、成员路径、文件类型或大小超出支持范围");
        if (reply.code === 3) throw errors.nameConflict(output!);
        if (reply.code === 4) throw new HuhuError("VERSION_CONFLICT", "远端归档源、目标或所在目录已变更");
        if (reply.code === 5) throw errors.permissionDenied("SSH 远端归档");
        if (reply.code !== 0) throw new HuhuError("INTERNAL", "SSH 远端归档结果待核实");
        const result = ArchiveResult.parse(JSON.parse(reply.stdout));
        if (result.archivePath !== path.posix.join(root, archive) || result.extractedPath !== (operation === "extract" ? path.posix.join(root, output!) : undefined) || !/^[a-f0-9]{64}$/.test(result.archiveSha256)) {
          throw new HuhuError("INTERNAL", "SSH 远端归档结果待核实");
        }
        return result;
      }),
    );
  }

  private probe(client: Client, signal: AbortSignal) {
    const cached = this.formats.get(client);
    if (cached) return cached;
    const probing = this.detectFormats(client, signal).catch((error: unknown) => {
      this.formats.delete(client);
      throw error;
    });
    this.formats.set(client, probing);
    return probing;
  }

  private async detectFormats(client: Client, signal: AbortSignal): Promise<z.infer<typeof Formats>> {
    let reply;
    try {
      reply = await captureSshCommand(client, remoteArchiveProbe, AbortSignal.any([signal, AbortSignal.timeout(5_000)]), 4096);
    } catch (error) {
      if (error instanceof RemoteCommandError && error.reason === "denied") return [];
      if (signal.aborted) throw signal.reason;
      if (error instanceof RemoteCommandError && error.reason === "disconnected") throw new HuhuError("SSH_DISCONNECTED", "该主机的原连接已结束");
      throw new HuhuError("SSH_TIMEOUT", "无法确认 SSH 远端归档工具");
    }
    return reply.code === 0 ? Formats.parse(JSON.parse(reply.stdout)) : [];
  }
}
