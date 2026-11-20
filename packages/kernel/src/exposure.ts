import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { errors, ToolAccessFileSchema, type ToolAccessSnapshot } from "@huhu/contracts";
import { versionOf, type VaultFiles } from "@huhu/vault";

export const TOOL_ACCESS_FILE = ".huhu/gateway/tool-access.json";

type ReadyPolicy = Extract<ToolAccessSnapshot, { state: "ready" }>;
type PolicyError = Extract<ToolAccessSnapshot, { state: "error" }>;
type StoredPolicy = (ReadyPolicy & { version: string }) | PolicyError;

const policyError = (reason: PolicyError["reason"], message: string): PolicyError => ({ state: "error", reason, message });

export function toolSelection(policy: ToolAccessSnapshot, name: string): boolean | null {
  return policy.state === "ready" && Object.hasOwn(policy.choices, name) ? (policy.choices[name] ?? null) : null;
}

/** 每个 Vault 的工具开放策略。内置插件启停使用独立的 plugins.json。 */
export class ExposureStore {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly files: VaultFiles,
    private readonly pluginFile: string,
  ) {}

  private readPolicy(): StoredPolicy {
    let bytes: Buffer;
    try {
      const file = this.files.abs(TOOL_ACCESS_FILE);
      const stat = lstatSync(file, { throwIfNoEntry: false });
      if (!stat) return policyError("missing", "找不到工具开放配置");
      if (!stat.isFile()) return policyError("unreadable", "无法读取工具开放配置");
      bytes = readFileSync(file);
    } catch {
      return policyError("unreadable", "无法读取工具开放配置");
    }
    try {
      const parsed = ToolAccessFileSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      return { state: "ready", revision: parsed.revision, choices: parsed.choices, version: versionOf(bytes) };
    } catch {
      return policyError("invalid-format", "工具开放配置的格式或版本无效");
    }
  }

  async initialize(names: readonly string[]): Promise<void> {
    if (this.files.readOnly) return;
    const policy = this.readPolicy();
    if (policy.state === "error" && policy.reason === "missing") {
      // 初始化失败时仍可进入桌面诊断，随后的读取报告当前文件的问题。
      await this.writePolicy(0, Object.fromEntries(names.map((name) => [name, false])), null).catch(() => undefined);
    }
  }

  snapshot(): ToolAccessSnapshot {
    const policy = this.readPolicy();
    if (policy.state === "ready") return { state: "ready", revision: policy.revision, choices: policy.choices };
    return policy;
  }

  set(name: string, selected: boolean): Promise<number> {
    return this.setMany([{ capability: name, exposed: selected }]).then(({ revision }) => revision);
  }

  setMany(changes: readonly { capability: string; exposed: boolean }[], expectedRevision?: number, assertCurrentCatalog?: () => void): Promise<{ revision: number; changed: boolean }> {
    const save = this.pending.then(async () => {
      this.files.assertWritable();
      const policy = this.readPolicy();
      if (policy.state === "error") throw errors.invalidInput(policy.message, { reason: policy.reason });
      if (expectedRevision !== undefined && policy.revision !== expectedRevision) throw errors.versionConflict(String(policy.revision));
      assertCurrentCatalog?.();
      if (changes.every(({ capability, exposed }) => toolSelection(policy, capability) === exposed)) return { revision: policy.revision, changed: false };
      if (policy.revision === Number.MAX_SAFE_INTEGER) throw errors.invalidInput("工具开放配置的版本已达上限");
      const revision = policy.revision + 1;
      const choices = { ...policy.choices, ...Object.fromEntries(changes.map(({ capability, exposed }) => [capability, exposed])) };
      await this.writePolicy(revision, choices, policy.version);
      return { revision, changed: true };
    });
    this.pending = save.catch(() => undefined);
    return save;
  }

  private writePolicy(revision: number, choices: ReadyPolicy["choices"], expectedVersion: string | null) {
    return this.files.write(TOOL_ACCESS_FILE, Buffer.from(JSON.stringify({ formatVersion: 1, revision, choices }, null, 2) + "\n"), { expectedVersion });
  }

  private loadPlugins(): Record<string, unknown> {
    try {
      return JSON.parse(readFileSync(this.pluginFile, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /** 内置插件的用户启停偏好（`builtin.<id>.enabled`）；未记录视为启用。 */
  pluginEnabled(id: string): boolean {
    const b = this.loadPlugins()["builtin"] as Record<string, { enabled?: boolean }> | undefined;
    return b?.[id]?.enabled !== false;
  }

  setPluginEnabled(id: string, enabled: boolean): void {
    const all = this.loadPlugins();
    const b = (all["builtin"] as Record<string, { enabled?: boolean }> | undefined) ?? {};
    all["builtin"] = { ...b, [id]: { enabled } };
    mkdirSync(path.dirname(this.pluginFile), { recursive: true });
    writeFileSync(this.pluginFile, JSON.stringify(all, null, 2));
  }
}
