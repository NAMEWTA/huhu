import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { ApplyConfigSync, ConfigSyncPreview, ConfigSyncSource, configFields, type ConfigField } from "../shared/config-sync.js";
import type { ConfigureHost } from "./auth-profile.js";
import type { HostConfigurations, ManagedHost } from "./host-configurations.js";
import { argumentsOf, matchesBlock } from "./import/openssh.js";

type Source = z.infer<typeof ConfigSyncSource>;
type Apply = z.infer<typeof ApplyConfigSync>;
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const fieldDigest = (value: string | null) => digest(JSON.stringify(value));
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const SyncState = z.strictObject({ format: z.literal(1), fields: z.partialRecord(z.enum(configFields), hash) });
const MAX_SOURCE = 1024 * 1024;
const aliasPattern = ConfigSyncSource.shape.alias;
const fieldNames = new Map<string, ConfigField>(configFields.map((field) => [field.toLowerCase(), field]));

function invalidLine(line: number, message: string): never {
  throw errors.invalidInput(`OpenSSH 配置第 ${line + 1} 行：${message}`);
}

/** A sync mapping edits one literal Host block and preserves unsupported text around it. */
export function readSyncBlock(text: string, alias: string) {
  const lines = text.split(/(?<=\n)/u);
  const values = new Map<ConfigField, { value: string; line: number }>();
  let blockStart: number | undefined;
  let blockEnd = lines.length;
  let current = false;
  let inherited = true;
  for (const [line, source] of lines.entries()) {
    if (!source.trim() || source.trimStart().startsWith("#")) continue;
    const directive = /^\s*([a-zA-Z][a-zA-Z0-9]*)\s*(?:=\s*|\s+)\s*(.+?)\s*$/u.exec(source);
    if (!directive) invalidLine(line, "无法读取指令");
    const key = directive[1]!.toLowerCase();
    const valuesOnLine = argumentsOf(directive[2]!);
    if (valuesOnLine.length === 0) invalidLine(line, "缺少参数或引号未闭合");
    if (key === "include" || key === "match") invalidLine(line, "同步只处理源文件本身的 Host 块，Include 或 Match 的生效顺序需先核对");
    if (key === "host") {
      if (current) blockEnd = line;
      const patterns = valuesOnLine.map((value) => value.toLowerCase());
      const exact = patterns.includes(alias.toLowerCase());
      current = exact;
      if (exact) {
        if (patterns.length !== 1 || blockStart !== undefined) invalidLine(line, "映射的别名必须有一个独立的 Host 块");
        blockStart = line;
      }
      inherited = !exact && matchesBlock(alias.toLowerCase(), patterns);
      continue;
    }
    if (key === "proxycommand" && (current || inherited) && valuesOnLine[0]?.toLowerCase() !== "none") invalidLine(line, "ProxyCommand 保留为文本，此 Host 块不能用 ProxyJump 同步");
    const field = fieldNames.get(key);
    if (inherited && field) invalidLine(line, `${field} 也由映射的 Host 块之外的指令设置`);
    if (!current || !field) continue;
    if (valuesOnLine.length !== 1 || values.has(field)) invalidLine(line, `${field} 必须有且仅有一个值`);
    const value = valuesOnLine[0]!;
    if (field === "ProxyJump" && value.toLowerCase() !== "none" && !aliasPattern.safeParse(value).success) invalidLine(line, "ProxyJump 只接受一个已映射的跳板别名");
    if (field === "IdentityFile" && value.toLowerCase() !== "none" && !path.isAbsolute(value) && !value.startsWith("~/")) invalidLine(line, "IdentityFile 需要绝对或 ~/ 路径");
    if (field === "ServerAliveInterval" || field === "ServerAliveCountMax") {
      const max = field === "ServerAliveInterval" ? 3600 : 1000;
      if (!/^\d+$/u.test(value) || Number(value) > max) invalidLine(line, `${field} 超出 Huhu 支持的范围`);
    }
    values.set(field, { value, line });
  }
  if (blockStart === undefined) throw errors.notFound(`OpenSSH Host ${alias}`);
  return { values, lines, blockEnd };
}

function fromFile(field: ConfigField, value: string | undefined): string | null {
  if (!value) return null;
  if ((field === "IdentityFile" || field === "ProxyJump") && value.toLowerCase() === "none") return null;
  if (field === "ProxyJump") return value.toLowerCase();
  if (field === "IdentityFile" && value.startsWith("~/")) return path.join(homedir(), value.slice(2));
  return field.startsWith("ServerAlive") ? String(Number(value)) : value;
}

function changeKind(file: string | null, huhu: string | null, base: string | undefined) {
  if (file === huhu) return "same";
  if (!base) return "unbound";
  if (base === fieldDigest(file)) return "huhu";
  if (base === fieldDigest(huhu)) return "file";
  return "conflict";
}

async function readSource(file: string) {
  if (!path.isAbsolute(file) || file.startsWith("//") || file.startsWith("\\\\")) throw errors.invalidInput("请选择本机 OpenSSH 配置文件");
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_SOURCE || stat.nlink !== 1) throw errors.invalidInput("SSH 配置需为 1 MiB 以内的普通文件");
    const buffer = Buffer.alloc(MAX_SOURCE + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > MAX_SOURCE) throw errors.invalidInput("SSH 配置超过 1 MiB");
    const bytes = buffer.subarray(0, offset);
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.includes("\0")) throw errors.invalidInput("SSH 配置包含无效字符");
    return { text, fingerprint: digest(bytes), mode: stat.mode & 0o777 };
  } catch (error) {
    if (error instanceof Error && "code" in error && String(error.code).startsWith("E")) throw errors.invalidInput("无法读取 OpenSSH 配置");
    if (error instanceof TypeError) throw errors.invalidInput("SSH 配置需要 UTF-8 编码");
    throw error;
  } finally {
    await handle?.close();
  }
}

export class SshConfigSync {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly hosts: HostConfigurations,
    private readonly files: HuhuApi["vault"]["files"],
  ) {}

  private async snapshot(source: Source) {
    const { text, fingerprint, mode } = await readSource(source.path);
    const parsed = readSyncBlock(text, source.alias);
    const directory = (await this.hosts.list()).filter((host): host is ManagedHost => "revision" in host);
    const host = directory.find(({ id }) => id === source.hostId);
    if (!host) throw errors.notFound("SSH 主机");
    const baseFile = `.huhu/ssh/config-sync/${digest(JSON.stringify([path.normalize(source.path), source.alias.toLowerCase(), host.id]))}.json`;
    const saved = this.files.read(baseFile);
    const previous = saved ? SyncState.parse(JSON.parse(saved.bytes.toString("utf8"))).fields : {};
    const jump = directory.find(({ id }) => id === host.jumpHostIds[0]);
    const localIdentity = await this.hosts.syncIdentityFile(host);
    const working = {
      ProxyJump: !host.routeDisabled && jump ? jump.name.toLowerCase() : null,
      IdentityFile: localIdentity,
      ServerAliveInterval: host.keepaliveIntervalSec?.toString() ?? null,
      ServerAliveCountMax: host.keepaliveCountMax?.toString() ?? null,
    };
    const rows = configFields.map((field) => {
      const file = fromFile(field, parsed.values.get(field)?.value);
      const huhu = working[field];
      return { field, file, huhu, change: changeKind(file, huhu, previous[field]) } as const;
    });
    const comparison = digest(JSON.stringify(rows));
    return { fingerprint, comparison, mode, parsed, directory, host, baseFile, previous, stateRevision: saved?.version ?? null, rows };
  }

  async preview(source: Source): Promise<ConfigSyncPreview> {
    const { fingerprint, comparison, host, stateRevision, rows } = await this.snapshot(source);
    return { fingerprint, comparison, hostRevision: host.revision, stateRevision, rows };
  }

  apply(input: Apply, signal: AbortSignal): Promise<ConfigSyncPreview> {
    const next = this.tail.then(() => this.update(input, signal));
    this.tail = next.catch(() => undefined);
    return next;
  }

  private async update(input: Apply, signal: AbortSignal) {
    const rec = await this.snapshot(input);
    if (rec.fingerprint !== input.fingerprint || rec.comparison !== input.comparison || rec.host.revision !== input.hostRevision || rec.stateRevision !== input.stateRevision) throw errors.versionConflict(rec.fingerprint);
    const row = rec.rows.find(({ field }) => field === input.field)!;
    const value = input.direction === "file-to-huhu" ? row.file : row.huhu;
    signal.throwIfAborted();
    if (row.file !== row.huhu) {
      if (input.direction === "establish") throw errors.invalidInput("先选择保留文件或 Huhu 的值");
      if (input.direction === "file-to-huhu") await this.toHost(rec.host, rec.directory, row.field, value, signal);
      else await this.toFile(input.path, rec, row.field, value, signal);
    }
    signal.throwIfAborted();
    const fields = { ...rec.previous, [row.field]: fieldDigest(value) };
    await this.files.write(rec.baseFile, Buffer.from(JSON.stringify({ format: 1, fields }) + "\n"), { expectedVersion: rec.stateRevision });
    return this.preview(input);
  }

  private async toHost(host: ManagedHost, directory: ManagedHost[], field: ConfigField, value: string | null, signal: AbortSignal) {
    const { id, revision, auth, authState, configured: _configured, keyId: _keyId, ...profile } = host;
    const input: ConfigureHost = { ...profile, hostId: id, expectedRevision: revision, authKind: auth.kind, credentials: [] };
    switch (field) {
      case "ProxyJump": {
        const matches = value ? directory.filter(({ name }) => name.toLowerCase() === value.toLowerCase()) : [];
        if (value && matches.length !== 1) throw errors.invalidInput("请先为跳板别名配置唯一的 Huhu 主机");
        input.jumpHostIds = matches.map(({ id }) => id);
        input.routeDisabled = false;
        break;
      }
      case "IdentityFile":
        if (auth.kind !== "identity-file") throw errors.invalidInput("请先在主机编辑中选择本机身份文件认证");
        if (value && !path.isAbsolute(value)) throw errors.invalidInput("写入 Huhu 前，请把身份文件路径改为绝对路径");
        input.credentials = [value ? { purpose: "identityFile", action: "replace", value, ...(authState.identityFile === "needs-reconfiguration" && { reconfigure: true as const }) } : { purpose: "identityFile", action: "clear" }];
        break;
      case "ServerAliveInterval":
        if (value === null) delete input.keepaliveIntervalSec;
        else input.keepaliveIntervalSec = Number(value);
        break;
      case "ServerAliveCountMax":
        if (value === null) delete input.keepaliveCountMax;
        else input.keepaliveCountMax = Number(value);
        break;
    }
    await this.hosts.configure(input, signal);
  }

  private async toFile(file: string, rec: Awaited<ReturnType<SshConfigSync["snapshot"]>>, field: ConfigField, value: string | null, signal: AbortSignal) {
    if (field === "ProxyJump" && value && !aliasPattern.safeParse(value).success) throw errors.invalidInput("Huhu 跳板名称需要是有效的 OpenSSH 别名");
    // Control bytes cannot be represented in an OpenSSH field value.
    // eslint-disable-next-line no-control-regex
    if (value && /[\x00-\x1f\x7f]/u.test(value)) throw errors.invalidInput("配置值包含无法保存的控制字符");
    const original = rec.parsed.values.get(field);
    const lines = rec.parsed.lines.slice();
    const newline = lines.some((line) => line.endsWith("\r\n")) ? "\r\n" : "\n";
    const escaped = field === "IdentityFile" && value ? JSON.stringify(value) : value;
    const replacement = escaped === null ? "" : `    ${field} ${escaped}${newline}`;
    if (original) lines.splice(original.line, 1, replacement);
    else if (replacement) {
      const at = rec.parsed.blockEnd;
      if (at > 0 && !lines[at - 1]!.endsWith("\n")) lines[at - 1] += newline;
      lines.splice(at, 0, replacement);
    }
    const temporary = path.join(path.dirname(file), `.huhu-ssh-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, lines.join(""), { mode: rec.mode, flag: "wx", flush: true, signal });
      const latest = await readSource(file);
      if (latest.fingerprint !== rec.fingerprint) throw errors.versionConflict(latest.fingerprint);
      signal.throwIfAborted();
      await rename(temporary, file);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
}

const descriptor = { plugin: "ssh", desktopOnly: true, exposable: false, defaultExposed: false, risk: "normal" } as const;
export const sshConfigSyncDescriptors = {
  configSyncPreview: defineCapabilityDescriptor({
    ...descriptor,
    name: "ssh.configSync.preview",
    title: "预览 OpenSSH 配置同步",
    description: "按主机 ID 比较桌面选取的本机配置文件中的 Host 块与 Huhu。",
    scope: "read",
    input: ConfigSyncSource,
    output: ConfigSyncPreview,
  }),
  configSyncApply: defineCapabilityDescriptor({
    ...descriptor,
    name: "ssh.configSync.apply",
    title: "应用 OpenSSH 配置同步",
    description: "按已预览版本和用户选择应用一个字段。",
    scope: "write",
    input: ApplyConfigSync,
    output: ConfigSyncPreview,
  }),
};

export function registerSshConfigSync(api: HuhuApi, hosts: HostConfigurations): void {
  const sync = new SshConfigSync(hosts, api.vault.files);
  api.defineCapability(
    bindCapability(sshConfigSyncDescriptors.configSyncPreview, ({ caller }, source) => {
      if (caller !== "desktop") throw errors.permissionDenied(sshConfigSyncDescriptors.configSyncPreview.name);
      return sync.preview(source);
    }),
  );
  api.defineCapability(
    bindCapability(sshConfigSyncDescriptors.configSyncApply, ({ caller, signal }, input) => {
      if (caller !== "desktop") throw errors.permissionDenied(sshConfigSyncDescriptors.configSyncApply.name);
      return sync.apply(input, signal);
    }),
  );
}
