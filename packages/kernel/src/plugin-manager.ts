import { findDependencyCycle, type PluginManifest } from "@huhu/contracts";
import type { Context } from "@huhu/cordis";
import type { EventBus, HuhuApi } from "./context.js";

export type PluginState = "active" | "disabled" | "failed";

export interface PluginEntry {
  manifest: PluginManifest;
  apply: (ctx: Context, api: HuhuApi) => void | Promise<void>;
}

interface Runtime {
  entry: PluginEntry;
  state: PluginState;
  error?: string;
  dispose?: () => Promise<void>;
}

/** 按 dependsOn 拓扑启停插件；停用先拒绝新调用，再释放作用域。 */
export class PluginManager {
  private readonly plugins = new Map<string, Runtime>();

  constructor(
    private readonly root: Context,
    private readonly facade: (pluginId: string, ctx: Context) => HuhuApi,
    private readonly events: EventBus,
  ) {}

  register(entry: PluginEntry): void {
    const id = entry.manifest.id;
    if (this.plugins.has(id)) throw new Error(`插件重复：${id}`);
    const cycle = findDependencyCycle([...[...this.plugins.values()].map((p) => p.entry.manifest), entry.manifest]);
    if (cycle) throw new Error(`插件依赖成环：${cycle.join(" → ")}`);
    this.plugins.set(id, { entry, state: "disabled" });
  }

  state(id: string): PluginState | undefined {
    return this.plugins.get(id)?.state;
  }

  error(id: string): string | undefined {
    return this.plugins.get(id)?.error;
  }

  isEnabled(id: string): boolean {
    return id === "kernel" || this.plugins.get(id)?.state === "active";
  }

  list(): { id: string; state: PluginState; error?: string; manifest: PluginManifest }[] {
    return [...this.plugins.values()].map((p) => ({ id: p.entry.manifest.id, state: p.state, manifest: p.entry.manifest, ...(p.error ? { error: p.error } : {}) }));
  }

  /** 启用插件及其硬依赖。依赖缺失或未能启用则该插件不启用并写明原因。 */
  async enable(id: string): Promise<PluginState> {
    const rt = this.plugins.get(id);
    if (!rt) throw new Error(`未知插件：${id}`);
    if (rt.state === "active") return "active";
    for (const dep of rt.entry.manifest.dependsOn) {
      if (!this.plugins.has(dep)) return this.fail(rt, `缺少依赖插件：${dep}`);
      if ((await this.enable(dep)) !== "active") return this.fail(rt, `依赖插件 ${dep} 未能启用`);
    }
    let applyError: unknown;
    const ctx = this.root;
    const fiber = ctx.plugin({
      name: id,
      apply: async (scoped: Context) => {
        try {
          await rt.entry.apply(scoped, this.facade(id, scoped));
        } catch (e) {
          applyError = e;
          throw e;
        }
      },
    });
    const dispose = () => fiber.dispose();
    try {
      await fiber.await?.();
    } catch (e) {
      applyError ??= e;
    }
    if (applyError) {
      await dispose(); // 回滚已注册的资源
      return this.fail(rt, applyError instanceof Error ? applyError.message : String(applyError));
    }
    rt.dispose = dispose;
    rt.state = "active";
    delete rt.error;
    this.events.publish("plugin.stateChanged", { id, state: "active" });
    return "active";
  }

  /** 停用插件；依赖它的插件先被停用，返回被一并停用的 id（含自身）。 */
  async disable(id: string): Promise<string[]> {
    const rt = this.plugins.get(id);
    if (!rt) throw new Error(`未知插件：${id}`);
    const stopped: string[] = [];
    for (const [otherId, other] of this.plugins) {
      if (other.state === "active" && other.entry.manifest.dependsOn.includes(id)) stopped.push(...(await this.disable(otherId)));
    }
    if (rt.state !== "disabled") {
      // 先标记为非活动（Dispatcher 据此拒绝新调用），再释放作用域
      rt.state = "disabled";
      await rt.dispose?.();
      delete rt.dispose;
      this.events.publish("plugin.stateChanged", { id, state: "disabled" });
      stopped.push(id);
    }
    return stopped;
  }

  /** 按依赖顺序启用全部 activation=vault-open 的插件。 */
  async enableAll(): Promise<void> {
    for (const [id, rt] of this.plugins) if (rt.entry.manifest.activation === "vault-open") await this.enable(id);
  }

  async disposeAll(): Promise<void> {
    for (const id of [...this.plugins.keys()].reverse()) await this.disable(id);
  }

  private fail(rt: Runtime, message: string): PluginState {
    rt.state = "failed";
    rt.error = message;
    this.events.publish("plugin.stateChanged", { id: rt.entry.manifest.id, state: "failed", error: message });
    return "failed";
  }
}
