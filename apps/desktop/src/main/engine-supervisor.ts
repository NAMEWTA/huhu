import { utilityProcess, type UtilityProcess } from "electron";
import path from "node:path";

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

  constructor(private readonly vaultPath: string, private readonly onState: (s: EngineState) => void, private readonly entry: string = path.join(import.meta.dirname, "engine.js")) {}

  get current(): EngineState {
    return this.state;
  }

  private set(s: EngineState): void {
    this.state = s;
    this.onState(s);
  }

  start(): void {
    this.stopping = false;
    this.endpoint = null;
    this.set("starting");
    const child = utilityProcess.fork(this.entry, ["--vault", this.vaultPath, "--create"], { stdio: "pipe", serviceName: "huhu-engine" });
    this.child = child;
    child.stderr?.on("data", (d) => process.stderr.write(`[engine] ${d}`));
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
