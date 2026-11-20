import type { CapabilityRisk, CapabilityScope } from "@huhu/contracts";
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
  /** false = 只允许桌面调用。 */
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

const descriptorBinding = Symbol("capabilityDescriptor");

export interface CapabilityDefinition<I = unknown, O = unknown> extends CapabilityContract<I, O> {
  handler: (ctx: CapabilityContext, input: I) => Promise<O> | O;
  readonly [descriptorBinding]?: CapabilityDescriptor<I, O>;
}

/** 原样返回定义，用于类型推断。 */
export function defineCapability<I, O>(def: CapabilityDefinition<I, O>): CapabilityDefinition<I, O> {
  return def;
}

export function defineCapabilityDescriptor<I, O>(descriptor: CapabilityDescriptor<I, O>): CapabilityDescriptor<I, O> {
  return Object.freeze({ ...descriptor });
}

export function bindCapability<I, O>(descriptor: CapabilityDescriptor<I, O>, handler: CapabilityDefinition<NoInfer<I>, NoInfer<O>>["handler"]): CapabilityDefinition<I, O> {
  const bound = { ...descriptor, handler };
  Object.defineProperty(bound, descriptorBinding, { value: descriptor });
  return Object.freeze(bound);
}

interface KnownCapability {
  plugin: string;
  descriptor?: CapabilityDescriptor;
}

export class CapabilityRegistry {
  private readonly map = new Map<string, CapabilityDefinition>();
  /** 清单身份和静态描述独立于活动 handler 的生命周期。 */
  private readonly known = new Map<string, KnownCapability>();

  declareDescriptors(plugin: string, descriptors: readonly CapabilityDescriptor[]): void {
    const additions = new Map<string, KnownCapability>();
    for (const descriptor of descriptors) {
      const { name } = descriptor;
      if (descriptor.plugin !== plugin) throw new Error(`能力归属不符：${name}（${plugin} / ${descriptor.plugin}）`);
      const known = this.known.get(name);
      if (known && known.plugin !== plugin) throw new Error(`能力归属不符：${name}（${known.plugin} / ${plugin}）`);
      if (known?.descriptor || this.map.has(name) || additions.has(name)) throw new Error(`能力描述重复登记：${name}`);
      additions.set(name, { plugin, descriptor });
    }
    for (const [name, entry] of additions) this.known.set(name, entry);
  }

  /** 注册并返回注销函数（供插件作用域释放）。 */
  register<I, O>(def: CapabilityDefinition<I, O>): () => void {
    if (this.map.has(def.name)) throw new Error(`能力重复注册：${def.name}`);
    const descriptor = this.known.get(def.name)?.descriptor;
    if (descriptor !== def[descriptorBinding]) throw new Error(`能力处理函数与已登记的描述不匹配：${def.name}`);
    this.map.set(def.name, def as unknown as CapabilityDefinition);
    if (!descriptor) this.known.set(def.name, { plugin: def.plugin });
    return () => {
      if (this.map.get(def.name) === (def as unknown)) this.map.delete(def.name);
    };
  }

  /** 清单声明的能力（插件尚未启用时也能区分"插件已停用"与"能力不存在"）。 */
  declare(plugin: string, names: readonly string[]): void {
    for (const n of names) if (!this.known.has(n)) this.known.set(n, { plugin });
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
