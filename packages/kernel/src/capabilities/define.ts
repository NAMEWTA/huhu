import type { CapabilityScope } from "@huhu/contracts";
import type { z } from "zod";

export interface CapabilityContext {
  /** 客户端断开或用户取消时触发。 */
  signal: AbortSignal;
  caller: string;
  requestId: string;
}

export interface CapabilityDefinition<I = unknown, O = unknown> {
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
  handler: (ctx: CapabilityContext, input: I) => Promise<O> | O;
}

/** 原样返回定义，用于类型推断。 */
export function defineCapability<I, O>(def: CapabilityDefinition<I, O>): CapabilityDefinition<I, O> {
  return def;
}

export class CapabilityRegistry {
  private readonly map = new Map<string, CapabilityDefinition>();
  /** 曾经注册过的能力 → 所属插件（注销后仍保留，用于把"插件已停用"与"能力不存在"区分开）。 */
  private readonly known = new Map<string, string>();

  /** 注册并返回注销函数（供插件作用域释放）。 */
  register<I, O>(def: CapabilityDefinition<I, O>): () => void {
    if (this.map.has(def.name)) throw new Error(`能力重复注册：${def.name}`);
    this.map.set(def.name, def as unknown as CapabilityDefinition);
    this.known.set(def.name, def.plugin);
    return () => {
      if (this.map.get(def.name) === (def as unknown)) this.map.delete(def.name);
    };
  }

  /** 清单声明的能力（插件尚未启用时也能区分"插件已停用"与"能力不存在"）。 */
  declare(plugin: string, names: readonly string[]): void {
    for (const n of names) if (!this.known.has(n)) this.known.set(n, plugin);
  }

  /** 曾注册或在清单中声明过的全部能力名（含已停用插件的）。 */
  knownNames(): string[] {
    return [...this.known.keys()];
  }

  knownPlugin(name: string): string | undefined {
    return this.known.get(name);
  }

  get(name: string): CapabilityDefinition | undefined {
    return this.map.get(name);
  }

  list(): CapabilityDefinition[] {
    return [...this.map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
