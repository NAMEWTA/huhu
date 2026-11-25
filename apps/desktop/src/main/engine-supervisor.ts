import { app, MessageChannelMain, shell, utilityProcess, type UtilityProcess } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { probeEngine, readEngineEndpoint, type EngineEndpointRecord } from "@huhu/vault";
import type { PrivateMailAttachmentRequest, SelectDraftAttachmentResult } from "@huhu/plugin-mail/desktop-attachments";

const mailGoogleClientSecret = process.env["HUHU_MAIL_GOOGLE_CLIENT_SECRET"];
delete process.env["HUHU_MAIL_GOOGLE_CLIENT_SECRET"];

/** 随应用打包的 Herdr Core：`resources/herdr/<platform>-<arch>/herdr-core(.exe)`；开发时用 HUHU_HERDR_BIN。 */
export function bundledHerdrBin(resourcesPath: string = process.resourcesPath, platform: string = process.platform, arch: string = process.arch): string | null {
  const exe = path.join(resourcesPath, "herdr", `${platform}-${arch}`, platform === "win32" ? "herdr-core.exe" : "herdr-core");
  return existsSync(exe) ? exe : null;
}

/** 随应用提供的示例扩展：打包后在 resources/plugins，开发时在仓库 examples/plugins。 */
function examplesDir(): string {
  const packaged = path.join(process.resourcesPath ?? "", "plugins");
  return existsSync(packaged) ? packaged : path.resolve(import.meta.dirname, "../../../../examples/plugins");
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

interface OAuthOpenMessage {
  type: "mail-oauth:open";
  id: string;
  url: string;
}

function mailAuthorizationUrl(value: string): URL | undefined {
  if (typeof value !== "string" || value.length > 8_192 || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return undefined;
  const host = url.hostname === "accounts.google.com" && url.pathname === "/o/oauth2/v2/auth" ? "127.0.0.1" : url.hostname === "login.microsoftonline.com" && url.pathname === "/common/oauth2/v2.0/authorize" ? "localhost" : null;
  if (!host || url.searchParams.get("response_type") !== "code" || url.searchParams.get("code_challenge_method") !== "S256") return undefined;
  const [target, extra] = url.searchParams.getAll("redirect_uri");
  if (!target || extra !== undefined || !URL.canParse(target)) return undefined;
  const callback = new URL(target);
  if (callback.protocol !== "http:" || callback.hostname !== host || !callback.port || callback.pathname !== "/mail/oauth/callback" || callback.username || callback.password || callback.search || callback.hash) return undefined;
  return url;
}

/** 监管 Engine utilityProcess：启动、崩溃通知、重启、有序关闭（最多等 15 秒）。 */
export class EngineSupervisor {
  private child: UtilityProcess | null = null;
  private attached: EngineEndpointRecord | null = null;
  private statusTimer: NodeJS.Timeout | undefined;
  private state: EngineState = "stopped";
  private endpoint: EngineEndpoint | null = null;
  private waiters: ((e: EngineEndpoint) => void)[] = [];
  private stopping = false;
  private restartWhenStopped = false;
  private stopGeneration = 0;
  private attachmentLifetime = new AbortController();
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

  get vaultRoot(): string {
    return this.vaultPath;
  }

  get activeVaultId(): string | undefined {
    return this.state === "ready" && !this.stopping ? this.endpoint?.vaultId : undefined;
  }

  mailAttachmentEndpoint(vaultId: string): EngineEndpoint | null {
    return this.state === "ready" && !this.stopping && !this.flags.readOnly && this.endpoint?.vaultId === vaultId ? this.endpoint : null;
  }

  addMailDraftAttachment(request: PrivateMailAttachmentRequest, signal: AbortSignal): Promise<SelectDraftAttachmentResult> {
    const child = this.child;
    const unavailable = { status: "failed", reason: "unavailable" } as const;
    if (!child || !this.mailAttachmentEndpoint(request.vaultId)) return Promise.resolve(unavailable);
    const active = AbortSignal.any([signal, this.attachmentLifetime.signal]);
    if (active.aborted) return Promise.resolve({ status: "cancelled" });
    return new Promise((resolve) => {
      const { port1, port2 } = new MessageChannelMain();
      const finish = (result: SelectDraftAttachmentResult) => {
        active.removeEventListener("abort", cancel);
        child.off("exit", exited);
        port1.removeAllListeners();
        port1.close();
        resolve(result);
      };
      const cancel = () => finish({ status: "cancelled" });
      const exited = () => finish(unavailable);
      active.addEventListener("abort", cancel, { once: true });
      child.once("exit", exited);
      port1.once("close", exited);
      port1.once("message", (event) => finish(event.data as SelectDraftAttachmentResult));
      port1.start();
      try {
        child.postMessage(request, [port2]);
      } catch {
        port2.close();
        finish(unavailable);
      }
    });
  }

  private set(s: EngineState): void {
    this.state = s;
    this.onState(s);
    for (const l of this.listeners) l(s);
  }

  private ready(port: number, token: string, vaultId: string): void {
    this.endpoint = { baseUrl: `http://127.0.0.1:${port}`, token, vaultId };
    this.set("ready");
    for (const waiter of this.waiters.splice(0)) waiter(this.endpoint);
  }

  private attach(endpoint: EngineEndpointRecord, generation: number): void {
    void probeEngine(endpoint, "attach").then(({ status, rendererToken }) => {
      if (generation !== this.stopGeneration) return;
      if (!rendererToken) throw new Error("Engine 未授予工作台连接");
      this.attached = endpoint;
      this.ready(status.port, rendererToken, status.vaultId);
      const monitor = () => {
        this.statusTimer = setTimeout(() => {
          void probeEngine(endpoint).then(() => {
            if (this.attached === endpoint) monitor();
          }).catch(() => {
            if (this.attached !== endpoint) return;
            this.attached = null;
            this.endpoint = null;
            this.statusTimer = undefined;
            this.set("crashed");
          });
        }, 2_000);
        this.statusTimer.unref();
      };
      monitor();
    }).catch(() => {
      if (generation !== this.stopGeneration) return;
      this.lastError = { code: "ENGINE_CONFLICT", message: "已有 Engine 但无法确认 Vault 连接，请在原宿主检查或停止它" };
      this.set("crashed");
    });
  }

  start(): void {
    if (this.child || this.attached || this.state === "starting") return;
    this.attachmentLifetime.abort();
    this.attachmentLifetime = new AbortController();
    this.stopGeneration++;
    this.stopping = false;
    this.restartWhenStopped = false;
    this.endpoint = null;
    this.lastError = null;
    this.set("starting");
    if (!this.flags.readOnly) {
      const found = readEngineEndpoint(this.vaultPath);
      if (found.state === "running") {
        this.attach(found.endpoint, this.stopGeneration);
        return;
      }
      if (found.state === "conflict") {
        this.lastError = { code: "ENGINE_CONFLICT", message: found.message };
        this.set("crashed");
        return;
      }
    }
    const args = ["--vault", this.vaultPath, ...(this.flags.create ? ["--create"] : []), ...(this.flags.readOnly ? ["--read-only"] : [])];
    const protectedPtyName = process.platform === "win32" ? "huhu-agent-pty.exe" : "huhu-agent-pty";
    const protectedPty = app.isPackaged ? path.join(process.resourcesPath, "agent-pty", protectedPtyName) : (process.env["HUHU_AGENT_PTY_HOST"] ?? path.resolve(import.meta.dirname, "../../../../native/agent-pty/bin", protectedPtyName));
    const inheritedEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toUpperCase() !== "HUHU_AGENT_PTY_HOST"));
    const child = utilityProcess.fork(this.entry, args, {
      stdio: "pipe",
      serviceName: "huhu-engine",
      env: {
        ...inheritedEnv,
        ...(mailGoogleClientSecret && { HUHU_MAIL_GOOGLE_CLIENT_SECRET: mailGoogleClientSecret }),
        HUHU_EXAMPLES_DIR: examplesDir(),
        HUHU_WEB_ASSETS_DIR: path.join(import.meta.dirname, "../web"),
        HUHU_DESKTOP_USER_DATA: app.getPath("userData"),
        ...((process.platform === "win32" || process.platform === "linux") && process.arch === "x64" && existsSync(protectedPty) ? { HUHU_AGENT_PTY_HOST: protectedPty } : {}),
        HUHU_NODE_BIN: process.execPath /* 主程序可执行文件：Engine 里启动监督进程要用它（utilityProcess 的 execPath 在 macOS 可能是 Helper） */,
        HUHU_CODEX_DISPATCH_HELPER: app.isPackaged ? path.join(process.resourcesPath, "codex-dispatch", "helper.cjs") : path.resolve(import.meta.dirname, "../../../../plugins/agent-cli/src/engine/codex-dispatch-helper.cjs"),
        HUHU_PROTECTED_LAUNCH_HELPER: app.isPackaged ? path.join(process.resourcesPath, "protected-launch", "helper.cjs") : path.resolve(import.meta.dirname, "../../../../plugins/agent-cli/src/engine/protected-launch-helper.cjs"),
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
    child.on("message", (m: ReadyMessage | OAuthOpenMessage) => {
      if (this.child !== child || !m || typeof m !== "object") return;
      if (m.type === "mail-oauth:open") {
        const url = this.state === "ready" && !this.stopping ? mailAuthorizationUrl(m.url) : undefined;
        void (
          url
            ? shell.openExternal(url.href).then(
                () => true,
                () => false,
              )
            : Promise.resolve(false)
        ).then((opened) => {
          if (this.child !== child) return;
          try {
            child.postMessage({ type: "mail-oauth:opened", id: m.id, opened });
          } catch {
            // The old Engine may exit before the browser result returns.
          }
        });
        return;
      }
      if (m.type !== "ready") return;
      this.ready(m.port, m.rendererToken, m.vaultId);
    });
    child.on("exit", () => {
      if (this.child !== child) return;
      this.child = null;
      this.endpoint = null;
      if (!this.stopping && !this.flags.readOnly && this.state === "starting") {
        const found = readEngineEndpoint(this.vaultPath);
        if (found.state === "running") {
          this.attach(found.endpoint, this.stopGeneration);
          return;
        }
      }
      this.set(this.stopping ? "stopped" : "crashed");
      if (this.restartWhenStopped) this.restart();
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

  /** 以桌面身份调用 Engine 能力（Main 自己的需要，如系统锁屏 / 休眠时锁定保险箱）；Engine 不可用时静默忽略。 */
  async callDesktop(capability: string, input: unknown = {}): Promise<void> {
    const ep = this.endpoint;
    if (!ep) return;
    try {
      await fetch(`${ep.baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${ep.token}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: `main-${Date.now().toString(36)}`, idempotencyKey: `main-${capability}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }),
      });
    } catch {
      // Engine 正在退出
    }
  }

  /** 等待 Engine 就绪后返回端点。 */
  whenReady(): Promise<EngineEndpoint> {
    if (this.endpoint) return Promise.resolve(this.endpoint);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  restart(): void {
    if (this.child || this.attached) return; // 仍在运行时不重复启动
    this.start();
  }

  /** 退出撤销时恢复原 Engine。若 stop 等到了强制结束时限，等原进程实际退出再启动。 */
  restartAfterStop(generation: number): void {
    if (generation !== this.stopGeneration) return;
    if (this.child && this.stopping) {
      this.restartWhenStopped = true;
      return;
    }
    this.restart();
  }

  /** 发送关闭请求并等待退出。返回本次停止身份，较晚的停止可以撤销其恢复许可。 */
  async stop(timeoutMs = 15_000): Promise<number> {
    const generation = ++this.stopGeneration;
    this.restartWhenStopped = false;
    const child = this.child;
    if (!child) {
      clearTimeout(this.statusTimer);
      this.statusTimer = undefined;
      this.attached = null;
      this.endpoint = null;
      if (this.state !== "stopped") this.set("stopped");
      return generation;
    }
    this.stopping = true;
    this.attachmentLifetime.abort();
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
    return generation;
  }
}
