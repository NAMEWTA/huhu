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

  /** 注册并返回注销函数（供插件作用域释放）。 */
  register<I, O>(def: CapabilityDefinition<I, O>): () => void {
    if (this.map.has(def.name)) throw new Error(`能力重复注册：${def.name}`);
    this.map.set(def.name, def as unknown as CapabilityDefinition);
    return () => {
      if (this.map.get(def.name) === (def as unknown)) this.map.delete(def.name);
    };
  }

  get(name: string): CapabilityDefinition | undefined {
    return this.map.get(name);
  }

  list(): CapabilityDefinition[] {
    return [...this.map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
