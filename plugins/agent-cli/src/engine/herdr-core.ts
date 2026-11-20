import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HuhuError } from "@huhu/contracts";
import { HerdrClient } from "@huhu/herdr-client";

export interface HerdrCoreOptions {
  /** herdr-core 可执行文件（随应用打包；开发时可用 HUHU_HERDR_BIN）。 */
  bin: string;
  vaultId: string;
  machineId: string;
  /** `<Vault>/.huhu/runtime/<machineId>/herdr`。 */
  runtimeDir: string;
  signal?: AbortSignal;
}

/** 实例隔离的 Herdr Core（interfaces.md §7）：独立 session、状态与配置目录、短路径 socket。 */
export class HerdrCore {
  private client: HerdrClient | null = null;

  constructor(private readonly o: HerdrCoreOptions) {}

  get endpoint(): string {
    const tag = `huhu-${this.o.vaultId.replace(/^vault-/, "").slice(0, 8)}-${this.o.machineId.slice(0, 4)}`;
    return process.platform === "win32" ? `\\\\.\\pipe\\${tag}` : path.join(process.env["XDG_RUNTIME_DIR"] ?? os.tmpdir(), `${tag}.sock`);
  }

  private env(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      HC_SESSION: "huhu",
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

  async workspaceConnection(): Promise<HerdrClient | null> {
    const client = await this.peek();
    if (client === null) throw new HuhuError("HERDR_UNAVAILABLE", "无法核对原 Core 的工作区状态");
    if (client !== "absent") return client;
    const savedLayout = path.join(this.o.runtimeDir, "state", "herdr-core", "huhu", "docs.json");
    return existsSync(savedLayout) ? this.ensure() : null;
  }

  async statusIfRunning(): Promise<{ state: "connected" | "unavailable" | "idle"; version: string | null; error?: string }> {
    const client = await this.peek();
    if (client === "absent") return { state: "idle", version: null };
    if (!client) return { state: "unavailable", version: null };
    try {
      const { version } = await client.call<{ version: string }>("server.status");
      return { state: "connected", version };
    } catch (error) {
      return { state: "unavailable", version: null, error: error instanceof Error ? error.message : String(error) };
    }
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

  /** 结束 Core（测试与"重启 Core"使用）。 */
  async stop(): Promise<void> {
    this.o.signal?.throwIfAborted();
    this.dispose();
    await new Promise<void>((resolve) => {
      const p = spawn(this.o.bin, ["server", "stop"], { env: this.env(), stdio: "ignore" });
      p.once("exit", () => resolve());
      p.once("error", () => resolve());
    });
  }
}
