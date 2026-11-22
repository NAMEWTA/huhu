import { findDependencyCycle, HuhuError, type PluginManifest } from "@huhu/contracts";
import type { Context } from "@huhu/cordis";
import type { EventBus, HuhuApi } from "./context.js";

export type PluginState = "active" | "disabled" | "failed";

export interface PluginEntry {
  manifest: PluginManifest;
  apply: (ctx: Context, api: HuhuApi) => void | Promise<void>;
  /** 确认由 Engine 托管的设备资源已停止。可在停用状态下重试。 */
  confirmStopped?: () => Promise<void>;
}

interface Runtime {
  entry: PluginEntry;
  state: PluginState;
  error?: string;
  dispose?: () => Promise<void>;
  cleanupError?: HuhuError;
}

/** 按 dependsOn 拓扑启停插件；停用先拒绝新调用，再释放作用域。 */
export class PluginManager {
  private readonly plugins = new Map<string, Runtime>();
  private readonly enabling = new Map<string, Promise<PluginState>>();
  private readonly disabling = new Map<string, Promise<string[]>>();
  private readonly unregistering = new Map<string, Promise<void>>();

  constructor(
    private readonly root: Context,
    private readonly facade: (pluginId: string, ctx: Context) => HuhuApi,
    private readonly events: EventBus,
  ) {}

  register(entry: PluginEntry, pendingInstall = false): void {
    const id = entry.manifest.id;
    if (this.plugins.has(id)) throw new Error(`插件重复：${id}`);
    const cycle = findDependencyCycle([...[...this.plugins.values()].map((p) => p.entry.manifest), entry.manifest]);
    if (cycle) throw new Error(`插件依赖成环：${cycle.join(" → ")}`);
    this.onRegister?.(entry.manifest, pendingInstall);
    this.plugins.set(id, { entry, state: "disabled" });
  }

  /** 新安装先登记并保留名称，启动成功后确认归属。失败由安装方注销。 */
  async activateInstall(entry: PluginEntry): Promise<PluginState> {
    this.register(entry, true);
    const id = entry.manifest.id;
    const state = await this.enable(id);
    if (state === "active") this.onInstallConfirmed?.(id);
    return state;
  }

  state(id: string): PluginState | undefined {
    return this.plugins.get(id)?.state;
  }

  error(id: string): string | undefined {
    return this.plugins.get(id)?.error;
  }

  cleanupError(id: string): HuhuError | undefined {
    return this.plugins.get(id)?.cleanupError;
  }

  /** 插件清单中声明的权限（内置插件的授予范围）。 */
  originOf(id: string): "builtin" | "external" {
    return this.plugins.get(id)?.entry.manifest.origin === "builtin" ? "builtin" : "external";
  }

  permissionsOf(id: string): readonly string[] {
    return this.plugins.get(id)?.entry.manifest.permissions ?? [];
  }

  isEnabled(id: string): boolean {
    return id === "kernel" || this.plugins.get(id)?.state === "active";
  }

  list(): { id: string; state: PluginState; error?: string; manifest: PluginManifest }[] {
    return [...this.plugins.values()].map((p) => ({ id: p.entry.manifest.id, state: p.state, manifest: p.entry.manifest, ...(p.error ? { error: p.error } : {}) }));
  }

  /** 启用插件及其硬依赖。依赖缺失或未能启用则该插件不启用并写明原因。 */
  enable(id: string): Promise<PluginState> {
    if (this.unregistering.has(id)) return Promise.resolve("disabled");
    const running = this.enabling.get(id);
    if (running) return running;
    const p = this.doEnable(id).finally(() => this.enabling.delete(id));
    this.enabling.set(id, p);
    return p;
  }

  private async doEnable(id: string): Promise<PluginState> {
    const rt = this.plugins.get(id);
    if (!rt) throw new Error(`未知插件：${id}`);
    const disabling = this.disabling.get(id);
    if (disabling) await disabling;
    if (rt.state === "active") return "active";
    if (rt.cleanupError) {
      await this.confirmStopped(rt);
      if (rt.cleanupError) return "disabled";
    }
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
  disable(id: string): Promise<string[]> {
    const running = this.disabling.get(id);
    if (running) return running;
    const pending = this.doDisable(id).finally(() => this.disabling.delete(id));
    this.disabling.set(id, pending);
    return pending;
  }

  private async doDisable(id: string): Promise<string[]> {
    const rt = this.plugins.get(id);
    if (!rt) throw new Error(`未知插件：${id}`);
    await this.enabling.get(id)?.catch(() => undefined); // 等进行中的启用结束，再停用
    const stopped: string[] = [];
    for (const [otherId, other] of this.plugins) {
      if (other.state === "active" && other.entry.manifest.dependsOn.includes(id)) stopped.push(...(await this.disable(otherId)));
    }
    const changed = rt.state !== "disabled";
    if (changed) {
      // 先标记为非活动（Dispatcher 据此拒绝新调用），再释放作用域
      rt.state = "disabled";
      await rt.dispose?.();
      delete rt.dispose;
    }
    const hadCleanupError = rt.cleanupError !== undefined;
    if (rt.entry.confirmStopped) await this.confirmStopped(rt);
    if (changed || hadCleanupError || rt.cleanupError) {
      this.events.publish("plugin.stateChanged", { id, state: "disabled", ...(rt.cleanupError && { error: rt.cleanupError.message }) });
      stopped.push(id);
    }
    return stopped;
  }

  private async confirmStopped(rt: Runtime): Promise<void> {
    try {
      await rt.entry.confirmStopped?.();
      if (rt.cleanupError) {
        delete rt.cleanupError;
        delete rt.error;
      }
    } catch (error) {
      rt.cleanupError = error instanceof HuhuError ? error : new HuhuError("INTERNAL", "无法确认设备资源已回收", { retryable: false, details: { outcome: "unknown" } });
      rt.error = rt.cleanupError.message;
    }
  }

  /** 运行期故障（例如外部扩展进程崩溃）：标记 failed 并释放资源，状态页显示原因并允许重试。 */
  async markFailed(id: string, error: string): Promise<void> {
    const rt = this.plugins.get(id);
    if (!rt || rt.state !== "active") return;
    rt.state = "failed";
    rt.error = error;
    await rt.dispose?.();
    delete rt.dispose;
    this.events.publish("plugin.stateChanged", { id, state: "failed", error });
  }

  /** 卸载外部扩展时移除注册（先停用）。 */
  async unregister(id: string): Promise<void> {
    const running = this.unregistering.get(id);
    if (running) return running;
    if (!this.plugins.has(id)) return;
    const pending = this.disable(id)
      .then(() => {
        this.plugins.delete(id);
        this.onUnregister?.(id);
      })
      .finally(() => this.unregistering.delete(id));
    this.unregistering.set(id, pending);
    return pending;
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  /** 注册时回调（Engine 用它把清单声明的能力登记给注册表）。 */
  onRegister?: (manifest: PluginManifest, pendingInstall: boolean) => void;
  onInstallConfirmed?: (id: string) => void;
  onUnregister?: (id: string) => void;

  /** 返回 false 的插件在 enableAll 时保持停用（用户偏好）。 */
  shouldEnable: (id: string) => boolean = () => true;

  /** 按依赖顺序启用全部 activation=vault-open 的插件。 */
  async enableAll(): Promise<void> {
    for (const [id, rt] of this.plugins) if (rt.entry.manifest.activation === "vault-open" && this.shouldEnable(id)) await this.enable(id);
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
