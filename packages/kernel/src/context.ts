import { Context } from "@huhu/cordis";
import { errors, type EventPayload, type EventType, type HuhuEvent } from "@huhu/contracts";
import type { SemanticRepository, Trash, VaultFiles, VaultIndex } from "@huhu/vault";
import type { CapabilityDefinition, CapabilityRegistry } from "./capabilities/define.js";

export { Context };

/** 事件总线：Engine 在提交成功后发布；订阅者（WS 推送、插件）自行过滤。 */
export class EventBus {
  private readonly listeners = new Set<(e: HuhuEvent) => void>();
  private counter = 0;

  constructor(private readonly vaultId: () => string, private readonly now: () => Date = () => new Date()) {}

  subscribe(fn: (e: HuhuEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  publish<T extends EventType>(type: T, payload: EventPayload<T>): HuhuEvent<T> {
    const event: HuhuEvent<T> = { id: `evt-${++this.counter}`, vaultId: this.vaultId(), type, at: this.now().toISOString(), payload };
    for (const l of this.listeners) {
      try {
        l(event as HuhuEvent);
      } catch {
        // 订阅者异常不得影响发布者与其他订阅者
      }
    }
    return event;
  }
}

/** 插件作用域内可用的 HUHU 门面；资源随作用域自动释放。 */
export interface VaultServices {
  repo: SemanticRepository;
  files: VaultFiles;
  index: VaultIndex;
  trash: Trash;
  vaultId: string;
}

export interface HuhuApi {
  vault: VaultServices;
  defineCapability<I, O>(def: CapabilityDefinition<I, O>): void;
  events: EventBus;
  call(capability: string, input: unknown, opts?: { idempotencyKey?: string }): Promise<unknown>;
}

declare module "@huhu/cordis" {
  interface Context {
    huhu: HuhuApi;
  }
}

export interface RootDeps {
  registry: CapabilityRegistry;
  events: EventBus;
  vault: VaultServices;
  call: (caller: `plugin:${string}`, capability: string, input: unknown, idempotencyKey?: string) => Promise<unknown>;
}

/** 创建绑定了 HUHU 门面的根上下文；`forPlugin` 为每个插件生成带其身份的门面。 */
export function createHuhuContext(deps: RootDeps): { root: Context; facade: (pluginId: string, ctx: Context) => HuhuApi } {
  const root = new Context();
  const facade = (pluginId: string, ctx: Context): HuhuApi => ({
    // 订阅挂到插件作用域，停用后不再收到事件
    events: Object.assign(Object.create(deps.events) as EventBus, {
      subscribe: (fn: (e: HuhuEvent) => void) => {
        let off: (() => void) | undefined;
        ctx.effect(() => {
          off = deps.events.subscribe(fn);
          return () => off?.();
        });
        return () => off?.();
      },
    }),
    vault: deps.vault,
    defineCapability(def) {
      if (def.plugin !== pluginId) throw errors.permissionDenied(`${def.name}（插件 ${pluginId} 不能注册属于 ${def.plugin} 的能力）`);
      ctx.effect(() => deps.registry.register(def));
    },
    call: async (capability, input, opts) => {
      const r = await deps.call(`plugin:${pluginId}`, capability, input, opts?.idempotencyKey);
      return r;
    },
  });
  return { root, facade };
}
