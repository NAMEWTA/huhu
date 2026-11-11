import { utilityProcess, type UtilityProcess } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";

/** 随应用打包的 Herdr Core：`resources/herdr/<platform>-<arch>/herdr-core(.exe)`；开发时用 HUHU_HERDR_BIN。 */
export function bundledHerdrBin(resourcesPath: string = process.resourcesPath, platform: string = process.platform, arch: string = process.arch): string | null {
  const exe = path.join(resourcesPath, "herdr", `${platform}-${arch}`, platform === "win32" ? "herdr-core.exe" : "herdr-core");
  return existsSync(exe) ? exe : null;
}

export type EngineState = "starting" | "ready" | "stopped" | "crashed";

export interface EngineEndpoint {
  baseUrl: string;
  token: string;
  vaultId: string;
}

interface ReadyMessage {
  type: "ready";
  port: number;
  rendererToken: string;
  vaultId: string;
}

/** 监管 Engine utilityProcess：启动、崩溃通知、重启、有序关闭（最多等 15 秒）。 */
export class EngineSupervisor {
  private child: UtilityProcess | null = null;
  private state: EngineState = "stopped";
  private endpoint: EngineEndpoint | null = null;
  private waiters: ((e: EngineEndpoint) => void)[] = [];
  private stopping = false;
  /** 最近一次启动失败的原因（Engine 在 stderr 上输出的 {"type":"error"} 行）。 */
  lastError: { code: string; message: string } | null = null;

  constructor(
    private readonly vaultPath: string,
    private readonly flags: { create?: boolean; readOnly?: boolean } = { create: true },
    private readonly onState: (s: EngineState) => void,
    private readonly entry: string = path.join(import.meta.dirname, "engine.js"),
  ) {}

  get current(): EngineState {
    return this.state;
  }

  private set(s: EngineState): void {
    this.state = s;
    this.onState(s);
    for (const l of this.listeners) l(s);
  }

  start(): void {
    this.stopping = false;
    this.endpoint = null;
    this.lastError = null;
    this.set("starting");
    const args = ["--vault", this.vaultPath, ...(this.flags.create ? ["--create"] : []), ...(this.flags.readOnly ? ["--read-only"] : [])];
    const child = utilityProcess.fork(this.entry, args, {
      stdio: "pipe",
      serviceName: "huhu-engine",
      env: {
        ...process.env,
        HUHU_NODE_BIN: process.execPath /* 主程序可执行文件：Engine 里启动监督进程要用它（utilityProcess 的 execPath 在 macOS 可能是 Helper） */,
        ...(process.env["HUHU_HERDR_BIN"]
          ? {}
          : (() => {
              const b = bundledHerdrBin();
              return b ? { HUHU_HERDR_BIN: b } : {};
            })()),
      },
    });
    this.child = child;
    child.stderr?.on("data", (d) => {
      process.stderr.write(`[engine] ${d}`);
      for (const line of String(d).split("\n")) {
        if (!line.startsWith('{"type":"error"')) continue;
        try {
          const e = JSON.parse(line) as { code?: string; message?: string };
          this.lastError = { code: e.code ?? "INTERNAL", message: e.message ?? "Vault 打开失败" };
        } catch {
          // 非 JSON 行忽略
        }
      }
    });
    child.on("message", (m: ReadyMessage) => {
      if (m.type !== "ready") return;
      this.endpoint = { baseUrl: `http://127.0.0.1:${m.port}`, token: m.rendererToken, vaultId: m.vaultId };
      this.set("ready");
      for (const w of this.waiters.splice(0)) w(this.endpoint);
    });
    child.on("exit", () => {
      if (this.child !== child) return;
      this.child = null;
      this.endpoint = null;
      this.set(this.stopping ? "stopped" : "crashed");
    });
  }

  /** 启动结果：就绪 → ok；在就绪前退出 → 失败原因；被停止 → 已取消。超时与结算都会移除监听。 */
  whenStarted(timeoutMs = 60_000): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
    return new Promise((resolve) => {
      const done = (r: { ok: true } | { ok: false; code: string; message: string }) => {
        clearTimeout(timer);
        this.listeners.delete(check);
        resolve(r);
      };
      const check = (s: EngineState) => {
        if (s === "ready") done({ ok: true });
        else if (s === "crashed") done({ ok: false, ...(this.lastError ?? { code: "INTERNAL", message: "Engine 启动失败" }) });
        else if (s === "stopped") done({ ok: false, code: "CANCELLED", message: "已取消" });
      };
      const timer = setTimeout(() => done({ ok: false, code: "TIMEOUT", message: "Engine 启动超时" }), timeoutMs);
      this.listeners.add(check);
      check(this.state);
    });
  }

  private readonly listeners = new Set<(s: EngineState) => void>();

  /** 等待 Engine 就绪后返回端点。 */
  whenReady(): Promise<EngineEndpoint> {
    if (this.endpoint) return Promise.resolve(this.endpoint);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  restart(): void {
    if (this.child) return; // 仍在运行时不重复启动
    this.start();
  }

  /** 发送关闭请求并等待退出；超过 15 秒强制结束。 */
  async stop(timeoutMs = 15_000): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, timeoutMs);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.postMessage({ type: "shutdown" });
    });
  }
}
