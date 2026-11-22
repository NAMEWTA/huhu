import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HuhuError } from "@huhu/contracts";
import { HerdrClient } from "./client.js";

type CoreStatus = { state: "connected" | "unavailable" | "idle"; version: string | null; coreId?: string; pid?: number; error?: string };
type RunningCore = { version: string; core: { id: string }; pid: number };

export function runnable(candidate: string, platform: NodeJS.Platform = process.platform): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    if (platform !== "win32") accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export interface HerdrCoreOptions {
  /** herdr-core 可执行文件（随应用打包；开发时可用 HUHU_HERDR_BIN）。 */
  bin: string;
  vaultId: string;
  machineId: string;
  /** `<Vault>/.huhu/runtime/<machineId>/herdr`。 */
  runtimeDir: string;
  signal?: AbortSignal;
  session?: string;
  socketName?: string;
}

/** 实例隔离的 Herdr Core（interfaces.md §7）：独立 session、状态与配置目录、短路径 socket。 */
export class HerdrCore {
  private client: HerdrClient | null = null;

  constructor(private readonly o: HerdrCoreOptions) {}

  get endpoint(): string {
    const tag = this.o.socketName ?? `huhu-${this.o.vaultId.replace(/^vault-/, "").slice(0, 8)}-${this.o.machineId.slice(0, 4)}`;
    return process.platform === "win32" ? `\\\\.\\pipe\\${tag}` : path.join(process.env["XDG_RUNTIME_DIR"] ?? os.tmpdir(), `${tag}.sock`);
  }

  get connected(): HerdrClient | null {
    return this.o.signal?.aborted ? null : this.client;
  }

  private env(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      HC_SESSION: this.o.session ?? "huhu",
      HC_SOCKET: this.endpoint,
      XDG_STATE_HOME: path.join(this.o.runtimeDir, "state"),
      XDG_CONFIG_HOME: path.join(this.o.runtimeDir, "config"),
    };
  }

  /** 确保 Core 在运行并返回已连接的客户端；二进制缺失或启动失败 → HERDR_UNAVAILABLE。 */
  async ensure(): Promise<HerdrClient> {
    this.o.signal?.throwIfAborted();
    if (this.client) return this.client;
    // 并发的 ensure（打开终端与健康诊断同时发生）共用同一次启动，不各自 spawn `server start`
    this.starting ??= this.start().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }
  private starting: Promise<HerdrClient> | null = null;

  private async start(): Promise<HerdrClient> {
    if (!existsSync(this.o.bin)) throw new HuhuError("HERDR_UNAVAILABLE", `找不到 Herdr Core：${this.o.bin}`);
    mkdirSync(this.o.runtimeDir, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const p = spawn(this.o.bin, ["server", "start"], { env: this.env(), stdio: "ignore", windowsHide: true });
      const timer = setTimeout(() => {
        p.kill();
        reject(new HuhuError("HERDR_UNAVAILABLE", "启动 Herdr Core 超时"));
      }, 15_000);
      p.once("error", (e) => {
        clearTimeout(timer);
        reject(new HuhuError("HERDR_UNAVAILABLE", `启动 Herdr Core 失败：${e.message}`));
      });
      p.once("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new HuhuError("HERDR_UNAVAILABLE", `Herdr Core 启动退出码 ${code}`));
      });
    });
    return this.connect();
  }

  private async connect(): Promise<HerdrClient> {
    this.o.signal?.throwIfAborted();
    const c: HerdrClient = new HerdrClient({
      endpoint: this.endpoint,
      onClose: () => {
        if (this.client === c) this.client = null;
      },
    });
    await c.connect();
    if (this.o.signal?.aborted) {
      c.close();
      this.o.signal.throwIfAborted();
    }
    if (this.client) {
      c.close();
      return this.client;
    }
    this.client = c;
    return c;
  }

  /**
   * 只在 Core 已经在运行时返回客户端，不会去启动它：用于“对账”这类只读检查。
   * "absent" = 确认没有 Core 在监听（套接字不存在 / 拒绝连接）；null = 暂时判断不了（其他连接错误）。
   */
  async peek(): Promise<HerdrClient | "absent" | null> {
    if (this.o.signal?.aborted) return null;
    if (this.client) return this.client;
    if (process.platform !== "win32" && !existsSync(this.endpoint)) return "absent"; // Unix 套接字文件都不存在：确定没有 Core
    try {
      return await this.connect();
    } catch (e) {
      // HerdrClient.connect 把底层错误包装成 HuhuError，errno 只留在消息里；套接字文件残留但没有进程监听 = ECONNREFUSED
      const text = `${(e as { code?: string }).code ?? ""} ${e instanceof Error ? e.message : String(e)}`;
      return /ENOENT|ECONNREFUSED/.test(text) ? "absent" : null;
    }
  }

  /**
   * 读取工作区布局用的连接。Core 未运行且磁盘上没有保存的布局时返回 null（空布局）。
   * 有保存布局时只有 start=true（工作台打开 Agent 工作区）才拉起 Core；外部只读调用不启动进程，改报 HERDR_UNAVAILABLE。
   */
  async workspaceConnection(start = true): Promise<HerdrClient | null> {
    const client = start ? await this.peek() : this.connected;
    const savedLayout = path.join(this.o.runtimeDir, "state", "herdr-core", this.o.session ?? "huhu", "docs.json");
    if (!start && client === null) {
      if (existsSync(savedLayout) || this.hasEndpoint()) throw new HuhuError("HERDR_UNAVAILABLE", "当前连接无法核对已保存的工作区布局");
      return null;
    }
    if (client === null) throw new HuhuError("HERDR_UNAVAILABLE", "无法核对原 Core 的工作区状态");
    if (client !== "absent") return client;
    if (!existsSync(savedLayout)) return null;
    return this.ensure();
  }

  private hasEndpoint(): boolean {
    // Without opening the named pipe, Windows cannot establish absence.
    return process.platform === "win32" || existsSync(this.endpoint);
  }

  /** 诊断用：不启动 Core。未运行时只核对随包程序是否存在。 */
  async probe(): Promise<{ state: "connected" | "idle" | "unavailable"; version: string | null; error?: string }> {
    const status = await this.statusIfRunning();
    if (status.state !== "idle") return status;
    return runnable(this.o.bin) ? status : { state: "unavailable", version: null, error: `找不到可运行的 Herdr Core：${this.o.bin}` };
  }

  async statusIfRunning(allowConnect = true): Promise<CoreStatus> {
    const client = allowConnect ? await this.peek() : (this.connected ?? (this.hasEndpoint() ? null : "absent"));
    if (client === "absent") return { state: "idle", version: null };
    if (!client) return { state: "unavailable", version: null };
    try {
      const { version, core, pid } = await client.call<RunningCore>("server.status");
      if (allowConnect) return { state: "connected", version };
      if (!core?.id || !Number.isSafeInteger(pid) || pid <= 0) return { state: "unavailable", version: null };
      return { state: "connected", version, coreId: core.id, pid };
    } catch (error) {
      return { state: "unavailable", version: null, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async assertInstance(expected: string | null, expectedPid: number | undefined): Promise<void> {
    const client = await this.peek();
    if (client === "absent" && expected === null && expectedPid === undefined) return;
    if (client && client !== "absent" && expected !== null && expectedPid !== undefined) {
      const { core, pid } = await client.call<RunningCore>("server.status");
      if (expected === core?.id && expectedPid === pid) return;
    }
    throw new HuhuError("VERSION_CONFLICT", "受管 Core 已变化，请重新读取 Core 状态");
  }

  async status(): Promise<{ state: "connected" | "unavailable"; version: string | null; error?: string }> {
    try {
      const s = await (await this.ensure()).call<{ version: string }>("server.status");
      return { state: "connected", version: s.version };
    } catch (e) {
      return { state: "unavailable", version: null, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** 断开连接但不结束 Core（运行中的终端保留）。 */
  dispose(): void {
    this.client?.close();
    this.client = null;
  }

  /** 结束 Core。私有宿主可要求确认停止，供卸载和 Vault 切换时使用。 */
  async stop({ requireConfirmation = false }: { requireConfirmation?: boolean } = {}): Promise<void> {
    this.o.signal?.throwIfAborted();
    if (requireConfirmation) {
      await this.starting?.catch(() => undefined);
      if ((await this.peek()) === "absent") return;
    }
    this.dispose();
    await new Promise<void>((resolve, reject) => {
      const p = spawn(this.o.bin, ["server", "stop"], { env: this.env(), stdio: "ignore", windowsHide: true });
      p.once("exit", (code) => {
        if (!requireConfirmation || code === 0) resolve();
        else reject(new HuhuError("HERDR_UNAVAILABLE", `停止 Herdr Core 失败（退出码 ${code ?? "未知"}）`));
      });
      p.once("error", (error) => {
        if (!requireConfirmation) resolve();
        else reject(new HuhuError("HERDR_UNAVAILABLE", `停止 Herdr Core 失败：${error.message}`));
      });
    });
  }
}
