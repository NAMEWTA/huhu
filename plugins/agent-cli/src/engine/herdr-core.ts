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
    if (this.client) return this.client;
    if (!existsSync(this.o.bin)) throw new HuhuError("HERDR_UNAVAILABLE", `找不到 Herdr Core：${this.o.bin}`);
    mkdirSync(this.o.runtimeDir, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const p = spawn(this.o.bin, ["server", "start"], { env: this.env(), stdio: "ignore", windowsHide: true });
      const timer = setTimeout(() => { p.kill(); reject(new HuhuError("HERDR_UNAVAILABLE", "启动 Herdr Core 超时")); }, 15_000);
      p.once("error", (e) => { clearTimeout(timer); reject(new HuhuError("HERDR_UNAVAILABLE", `启动 Herdr Core 失败：${e.message}`)); });
      p.once("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new HuhuError("HERDR_UNAVAILABLE", `Herdr Core 启动退出码 ${code}`));
      });
    });
    const c = new HerdrClient({ endpoint: this.endpoint, onClose: () => { this.client = null; } });
    await c.connect();
    this.client = c;
    return c;
  }

  async status(): Promise<{ state: "connected" | "unavailable"; version: string | null; error?: string }> {
    try {
      const s = (await (await this.ensure()).call<{ version: string }>("server.status")) ;
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
    this.dispose();
    await new Promise<void>((resolve) => {
      const p = spawn(this.o.bin, ["server", "stop"], { env: this.env(), stdio: "ignore" });
      p.once("exit", () => resolve());
      p.once("error", () => resolve());
    });
  }
}
