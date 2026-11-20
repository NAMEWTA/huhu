import { HuhuError, type CapabilityRisk, type CapabilityScope } from "@huhu/contracts";
import type { z } from "zod";

export interface CapabilityContext {
  /** 客户端断开或用户取消时触发。 */
  signal: AbortSignal;
  caller: string;
  requestId: string;
}

interface CapabilityContract<I, O> {
  name: string;
  plugin: string;
  scope: CapabilityScope;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  /** 是否可为 CLI、MCP 和受权 HTTP 工具入口开放。 */
  exposable: boolean;
  /** 外部入口（MCP/CLI/HTTP）的默认开放状态。 */
  defaultExposed: boolean;
  /** 覆盖默认 60 秒超时。 */
  timeoutMs?: number;
}

/** 由领域模块提供，安装后可在插件启用之前登记。 */
export interface CapabilityDescriptor<I = unknown, O = unknown> extends Readonly<CapabilityContract<I, O>> {
  readonly title: string;
  readonly description: string;
  readonly risk: CapabilityRisk;
}

const descriptorSnapshots = new WeakMap<object, CapabilityDescriptor>();
const descriptorBindings = new WeakMap<object, CapabilityDescriptor>();

export interface CapabilityDefinition<I = unknown, O = unknown> extends CapabilityContract<I, O> {
  handler: (ctx: CapabilityContext, input: I) => Promise<O> | O;
}

/** 原样返回定义，用于类型推断。 */
export function defineCapability<I, O>(def: CapabilityDefinition<I, O>): CapabilityDefinition<I, O> {
  return def;
}

export function defineCapabilityDescriptor<I, O>(descriptor: CapabilityDescriptor<I, O>): CapabilityDescriptor<I, O> {
  const existing = descriptorSnapshots.get(descriptor);
  if (existing) return existing as CapabilityDescriptor<I, O>;
  // 声明和绑定都可以先发生，首次使用时固定描述字段。
  const snapshot = Object.freeze({ ...descriptor });
  descriptorSnapshots.set(descriptor, snapshot);
  descriptorSnapshots.set(snapshot, snapshot);
  return snapshot;
}

export function bindCapability<I, O>(descriptor: CapabilityDescriptor<I, O>, handler: CapabilityDefinition<NoInfer<I>, NoInfer<O>>["handler"]): CapabilityDefinition<I, O> {
  const fixed = defineCapabilityDescriptor(descriptor);
  const bound = Object.freeze({ ...fixed, handler });
  descriptorBindings.set(bound, fixed);
  return bound;
}

export const mcpToolName = (capability: string) => capability.replace(/\./g, "_");

interface KnownCapability {
  plugin: string;
  descriptor?: CapabilityDescriptor;
}

export class CapabilityRegistry {
  private readonly map = new Map<string, CapabilityDefinition>();
  /** 清单身份和静态描述独立于活动 handler 的生命周期。 */
  private readonly known = new Map<string, KnownCapability>();
  // 待确认和已确认的归属都阻止同名注册。已确认的归属在同一个 Engine 内保留。
  private readonly toolOwners = new Map<string, { name: string; plugin: string }>();
  /** 每次安装只跟踪它新增的占位，已有历史归属仍由 toolOwners 保留。 */
  private readonly pendingInstalls = new Map<string, Set<string>>();

  declareDescriptors(plugin: string, descriptors: readonly CapabilityDescriptor[]): void {
    const additions = new Map<string, KnownCapability>();
    for (const source of descriptors) {
      const descriptor = defineCapabilityDescriptor(source);
      const { name } = descriptor;
      if (descriptor.plugin !== plugin) throw new Error(`能力归属不符：${name}（${plugin} / ${descriptor.plugin}）`);
      const known = this.known.get(name);
      if (known && known.plugin !== plugin) throw new Error(`能力归属不符：${name}（${known.plugin} / ${plugin}）`);
      if (known?.descriptor || this.map.has(name) || additions.has(name)) throw new Error(`能力描述重复登记：${name}`);
      additions.set(name, { plugin, descriptor });
    }
    this.reserveNames(plugin, additions.keys());
    for (const [name, entry] of additions) this.known.set(name, entry);
  }

  /** 注册并返回注销函数（供插件作用域释放）。 */
  register<I, O>(def: CapabilityDefinition<I, O>): () => void {
    if (this.map.has(def.name)) throw new Error(`能力重复注册：${def.name}`);
    const descriptor = this.known.get(def.name)?.descriptor;
    if (descriptor !== descriptorBindings.get(def)) throw new Error(`能力处理函数与已登记的描述不匹配：${def.name}`);
    this.reserveNames(def.plugin, [def.name]);
    this.map.set(def.name, def as unknown as CapabilityDefinition);
    if (!descriptor) this.known.set(def.name, { plugin: def.plugin });
    return () => {
      if (this.map.get(def.name) === (def as unknown)) this.map.delete(def.name);
    };
  }

  /** 清单声明的能力（插件尚未启用时也能区分"插件已停用"与"能力不存在"）。 */
  declare(plugin: string, names: readonly string[], pendingInstall = false): void {
    this.reserveNames(plugin, names, pendingInstall);
    for (const n of names) if (!this.known.has(n)) this.known.set(n, { plugin });
  }

  confirmPluginInstall(plugin: string): void {
    this.pendingInstalls.delete(plugin);
  }

  forgetPlugin(plugin: string): void {
    for (const [name, entry] of this.known) {
      if (entry.plugin !== plugin) continue;
      this.map.delete(name);
      this.known.delete(name);
    }
    // PluginManager 在停用和作用域清理完成后注销，期间待确认的归属仍阻止其他插件占用。
    const pending = this.pendingInstalls.get(plugin);
    if (pending) {
      for (const tool of pending) this.toolOwners.delete(tool);
      this.pendingInstalls.delete(plugin);
    }
  }

  private reserveNames(plugin: string, names: Iterable<string>, pendingInstall = false): void {
    const additions = new Map<string, { name: string; plugin: string }>();
    for (const name of names) {
      const tool = mcpToolName(name);
      const owner = this.toolOwners.get(tool) ?? additions.get(tool);
      if (owner && (owner.name !== name || owner.plugin !== plugin)) {
        throw new HuhuError("NAME_CONFLICT", `工具名 ${tool} 已由插件 ${owner.plugin} 的能力 ${owner.name} 登记`);
      }
      if (!owner) additions.set(tool, { name, plugin });
    }
    if (pendingInstall) this.pendingInstalls.set(plugin, new Set());
    const pending = this.pendingInstalls.get(plugin);
    for (const [tool, owner] of additions) {
      this.toolOwners.set(tool, owner);
      pending?.add(tool);
    }
  }

  /** 曾注册或在清单中声明过的全部能力名（含已停用插件的）。 */
  knownNames(): string[] {
    return [...this.known.keys()];
  }

  knownPlugin(name: string): string | undefined {
    return this.known.get(name)?.plugin;
  }

  getDescriptor(name: string): CapabilityDescriptor | undefined {
    return this.known.get(name)?.descriptor;
  }

  get(name: string): CapabilityDefinition | undefined {
    return this.map.get(name);
  }

  list(): CapabilityDefinition[] {
    return [...this.map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
