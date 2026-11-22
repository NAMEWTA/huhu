import { spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { HuhuError } from "@huhu/contracts";
import { HerdrClient } from "./client.js";
import { findOnPath, runnable } from "./executable.js";

type CoreStatus = { state: "connected" | "unavailable" | "idle"; version: string | null; coreId?: string; pid?: number; error?: string };
type RunningCore = { version: string; core: { id: string }; pid: number };

export interface HerdrCoreOptions {
  /** herdr-core 可执行文件（随应用打包；开发时可用 HUHU_HERDR_BIN）。 */
  bin: string;
  vaultId: string;
  machineId: string;
  /** `<Vault>/.huhu/runtime/<machineId>/herdr`。 */
  runtimeDir: string;
  signal?: AbortSignal;
  session?: string;
  /** A distinct endpoint for an application-owned Core. Unix stores it under a private directory. */
  socketName?: string;
}

/** 实例隔离的 Herdr Core（interfaces.md §7）：独立 session、状态与配置目录、短路径 socket。 */
export class HerdrCore {
  private client: HerdrClient | null = null;
  private startedWith: string | undefined;
  private stopping: Promise<void> | undefined;

  constructor(private readonly o: HerdrCoreOptions) {}

  get endpoint(): string {
    const tag = this.o.socketName ?? `huhu-${this.o.vaultId.replace(/^vault-/, "").slice(0, 8)}-${this.o.machineId.slice(0, 4)}`;
    if (process.platform === "win32") return `\\\\.\\pipe\\${tag}`;
    const runtime = process.env["XDG_RUNTIME_DIR"] ?? os.tmpdir();
    const filename = `${tag}.sock`;
    if (!this.o.socketName) return path.join(runtime, filename);
    const privateDirectory = `huhu-hc-${process.getuid?.()}`;
    const endpoint = path.join(path.isAbsolute(runtime) ? runtime : os.tmpdir(), privateDirectory, filename);
    // Herdr Core appends ".holder" and an eight-character holder ID to this path.
    return Buffer.byteLength(endpoint) + 16 <= 103 ? endpoint : path.join("/tmp", privateDirectory, filename);
  }

  private checkSocketDirectory(create: boolean): void {
    if (process.platform === "win32" || !this.o.socketName) return;
    const directory = path.dirname(this.endpoint);
    if (!create && !lstatSync(directory, { throwIfNoEntry: false })) return;
    const parent = path.dirname(directory);
    const entry = statSync(parent, { throwIfNoEntry: false });
    const uid = process.getuid?.();
    const ownerOnly = entry && entry.uid === uid && (entry.mode & 0o022) === 0;
    const sticky = entry && (entry.uid === 0 || entry.uid === uid) && (entry.mode & 0o1000) !== 0;
    if (!path.isAbsolute(parent) || uid === undefined || !entry?.isDirectory() || (!ownerOnly && !sticky)) throw new HuhuError("HERDR_UNAVAILABLE", "Herdr Core 的运行目录不可信");
    if (create) {
      try {
        mkdirSync(directory, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    const actual = lstatSync(directory, { throwIfNoEntry: false });
    if (!actual?.isDirectory() || actual.uid !== uid || (actual.mode & 0o077) !== 0) throw new HuhuError("HERDR_UNAVAILABLE", "Herdr Core 的私有套接字目录不可信");
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

  private resolveBinary(): string | null {
    const { bin } = this.o;
    if (!path.isAbsolute(bin) && path.basename(bin) === bin) return findOnPath(bin);
    return runnable(bin) ? path.resolve(bin) : null;
  }

  /** 确保 Core 在运行并返回已连接的客户端；二进制缺失或启动失败 → HERDR_UNAVAILABLE。 */
  async ensure(signal?: AbortSignal): Promise<HerdrClient> {
    signal?.throwIfAborted();
    this.o.signal?.throwIfAborted();
    if (this.stopping) throw new HuhuError("HERDR_UNAVAILABLE", "Herdr Core 正在停止");
    if (this.client) return this.client;
    // 并发的 ensure（打开终端与健康诊断同时发生）共用同一次启动，不各自 spawn `server start`
    this.starting ??= this.start().finally(() => {
      this.starting = null;
    });
    return waitForStart(this.starting, signal);
  }
  private starting: Promise<HerdrClient> | null = null;

  private async start(): Promise<HerdrClient> {
    const bin = this.resolveBinary();
    if (!bin) throw new HuhuError("HERDR_UNAVAILABLE", `找不到可运行的 Herdr Core：${this.o.bin}`);
    this.checkSocketDirectory(true);
    mkdirSync(this.o.runtimeDir, { recursive: true });
    this.startedWith = bin;
    await new Promise<void>((resolve, reject) => {
      const p = spawn(bin, ["server", "start"], { env: this.env(), stdio: "ignore", windowsHide: true });
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

  private async connect(signal?: AbortSignal): Promise<HerdrClient> {
    this.o.signal?.throwIfAborted();
    const c: HerdrClient = new HerdrClient({
      endpoint: this.endpoint,
      onClose: () => {
        if (this.client === c) this.client = null;
      },
    });
    const lifetime = this.o.signal;
    await c.connect(signal && lifetime ? AbortSignal.any([signal, lifetime]) : (signal ?? lifetime));
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
  async peek(signal?: AbortSignal): Promise<HerdrClient | "absent" | null> {
    signal?.throwIfAborted();
    if (this.o.signal?.aborted) return null;
    this.checkSocketDirectory(false);
    if (this.client) return this.client;
    if (process.platform !== "win32" && !existsSync(this.endpoint)) return "absent"; // Unix 套接字文件都不存在：确定没有 Core
    try {
      return await this.connect(signal);
    } catch (e) {
      signal?.throwIfAborted();
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
    return this.resolveBinary() ? status : { state: "unavailable", version: null, error: `找不到可运行的 Herdr Core：${this.o.bin}` };
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
      this.stopping ??= this.stopPrivate().finally(() => {
        this.stopping = undefined;
      });
      return this.stopping;
    }
    this.dispose();
    const bin = this.startedWith ?? this.resolveBinary() ?? this.o.bin;
    await new Promise<void>((resolve) => {
      const p = spawn(bin, ["server", "stop"], { env: this.env(), stdio: "ignore", windowsHide: true });
      p.once("exit", () => resolve());
      p.once("error", () => resolve());
    });
  }

  private async stopPrivate(): Promise<void> {
    const deadline = AbortSignal.timeout(8_000);
    const unconfirmed = () => new HuhuError("HERDR_UNAVAILABLE", "无法确认私有 Herdr Core 与终端持有进程已停止", { retryable: false, details: { outcome: "unknown" } });
    try {
      if (this.starting)
        await waitForStart(
          this.starting.catch(() => undefined),
          deadline,
        );
      const client = await this.peek(deadline);
      if (client === "absent" && !this.hasHolderEndpoint()) return;
      if (!client || client === "absent") throw unconfirmed();
      const reply = await client.call<{ stopped: boolean }>("server.stop", {}, deadline);
      if (reply?.stopped !== true) throw unconfirmed();
      this.dispose();
      while ((await this.peek(deadline)) !== "absent" || this.hasHolderEndpoint()) {
        this.dispose();
        await delay(50, undefined, { signal: deadline });
      }
    } catch {
      throw unconfirmed();
    } finally {
      this.dispose();
    }
  }

  private hasHolderEndpoint(): boolean {
    if (process.platform === "win32") return false;
    const directory = path.dirname(this.endpoint);
    if (!existsSync(directory)) return false;
    const base = path.basename(this.endpoint, ".sock") + ".holder";
    return readdirSync(directory).some((name) => name === base + ".sock" || (name.startsWith(base + ".") && name.endsWith(".sock")));
  }
}
async function waitForStart<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    void pending.then(
      (value) => {
        signal.removeEventListener("abort", cancel);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", cancel);
        reject(error);
      },
    );
  });
}
