import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { errors, HuhuError } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { LocalEnvironment, LocalSession, OpenLocalShell } from "../shared/local-shell.js";
import type { SshTerminalAttacher } from "./terminal-bridge.js";

type Environment = { view: LocalEnvironment; argv: string[] };
export type LocalPty = { write(data: Buffer): void; resize(cols: number, rows: number): void; stop(): void | Promise<void> };
export type LaunchLocalPty = (config: { argv: readonly string[]; cwd: string; signal: AbortSignal }, view: { data(bytes: Buffer): void; end(): void }) => Promise<LocalPty>;
type View = Parameters<SshTerminalAttacher>[1];
type Session = { info: LocalSession; pty?: LocalPty; pending: AbortController; buffer: Buffer[]; buffered: number; views: Set<View> };

const exec = promisify(execFile);
const sizeLimit = 64 * 1024;
const unavailable = (label: string) => new HuhuError("SSH_DISCONNECTED", `${label}在此设备不可用`);

async function executable(file: string) {
  if (!path.isAbsolute(file)) return false;
  try {
    const info = await stat(file);
    await access(file, constants.X_OK);
    return info.isFile();
  } catch {
    return false;
  }
}
function environment(kind: LocalEnvironment["kind"], name: string, argv: string[]): Environment {
  const id = createHash("sha256")
    .update(JSON.stringify([kind, argv]))
    .digest("hex");
  return { view: { id, name, kind }, argv };
}

/** Follow Motty local shell discovery using only exact executable paths and WSL distribution names. */
export async function discoverLocalEnvironments(signal: AbortSignal): Promise<Environment[]> {
  signal.throwIfAborted();
  if (process.platform !== "win32") {
    const defaults = [process.env["SHELL"], "/bin/sh"];
    const shellList = (await readFile("/etc/shells", { encoding: "utf8", signal }).catch(() => "")).split("\n").flatMap((line) => {
      const entry = line.trim();
      return entry.startsWith("/") ? [entry] : [];
    });
    const paths = [...new Set([...defaults, ...shellList].filter((entry): entry is string => Boolean(entry)))];
    const shells = await Promise.all(paths.map(async (file) => ((await executable(file)) ? [environment("shell", path.basename(file), [file])] : [])));
    signal.throwIfAborted();
    return shells.flat();
  }
  const osRoot = process.env["SystemRoot"];
  const system32 = osRoot ? path.join(osRoot, "System32") : undefined;
  const candidates = [process.env["ComSpec"], system32 && path.join(system32, "WindowsPowerShell", "v1.0", "powershell.exe"), process.env["ProgramFiles"] && path.join(process.env["ProgramFiles"]!, "PowerShell", "7", "pwsh.exe")];
  const windows = (await Promise.all([...new Set(candidates)].map(async (file) => (file && (await executable(file)) ? [environment("shell", path.parse(file).name, [file])] : [])))).flat();
  const wsl = system32 && path.join(system32, "wsl.exe");
  if (wsl && (await executable(wsl))) {
    try {
      const { stdout } = await exec(wsl, ["--list", "--quiet"], { encoding: "buffer", windowsHide: true, timeout: 5000, maxBuffer: 65536, signal });
      const text = stdout.toString(stdout.includes(0) ? "utf16le" : "utf8");
      const distributions = [
        ...new Set(
          text
            .split(/\r?\n/u)
            .map((line) => line.replace(/^\uFEFF/u, "").trim())
            // Reject control bytes in discovered environment names.
            // eslint-disable-next-line no-control-regex
            .filter((line) => line && !line.startsWith("-") && !/[\x00-\x1F\x7F]/u.test(line)),
        ),
      ];
      windows.push(...distributions.map((name) => environment("wsl", name, [wsl, "--distribution", name])));
    } catch {
      signal.throwIfAborted();
    }
  }
  signal.throwIfAborted();
  return windows;
}

export class SshLocalShells {
  private readonly sessions = new Map<string, Session>();
  private readonly restarting = new Set<string>();
  private readonly lifetime = new AbortController();
  private readonly openings = new Set<Promise<LocalSession>>();
  private disposing: Promise<void> | undefined;

  constructor(
    private readonly launch: LaunchLocalPty,
    private readonly changed: (id: string) => void,
    private readonly discover = discoverLocalEnvironments,
  ) {}

  async environments(signal: AbortSignal) {
    return (await this.discover(AbortSignal.any([signal, this.lifetime.signal]))).map(({ view }) => view);
  }

  list(): LocalSession[] {
    return [...this.sessions.values()].map(({ info }) => ({ ...info }));
  }

  open(input: OpenLocalShell, signal: AbortSignal): Promise<LocalSession> {
    const opening = this.openSession(input, AbortSignal.any([signal, this.lifetime.signal]));
    this.openings.add(opening);
    const release = () => this.openings.delete(opening);
    void opening.then(release, release);
    return opening;
  }

  private async openSession(input: OpenLocalShell, launchSignal: AbortSignal): Promise<LocalSession> {
    launchSignal.throwIfAborted();
    const previous = input.action === "restart" ? this.sessions.get(input.sessionId) : undefined;
    if (input.action === "restart" && !previous) throw errors.notFound("本地 Shell");
    if (previous?.info.state === "running") throw errors.invalidInput("请先结束当前本地 Shell");
    const id = input.action === "launch" ? input.environmentId : previous!.info.environment.id;
    const environment = (await this.discover(launchSignal)).find(({ view }) => view.id === id);
    launchSignal.throwIfAborted();
    if (!environment) throw unavailable(previous?.info.environment.name ?? "此本地 Shell 环境");
    if ([...this.sessions.values()].filter(({ info }) => info.state === "running").length >= 16) throw errors.invalidInput("最多同时打开 16 个本地 Shell");
    if (previous) {
      if (this.restarting.has(previous.info.id) || this.sessions.get(previous.info.id) !== previous) throw errors.invalidInput("此本地 Shell 正在重连或已重连");
      this.restarting.add(previous.info.id);
    }
    const info: LocalSession = { id: `ssh-local-${randomUUID()}`, environment: environment.view, state: "running" };
    const pending = new AbortController();
    const session: Session = { info, buffer: [], buffered: 0, views: new Set(), pending };
    this.sessions.set(info.id, session);
    try {
      const pty = await this.launch(
        { argv: environment.argv, cwd: homedir(), signal: AbortSignal.any([launchSignal, pending.signal]) },
        {
          data: (bytes) => {
            if (info.state !== "running") return;
            const chunk = Buffer.from(bytes.subarray(Math.max(0, bytes.length - sizeLimit)));
            if (chunk.length) {
              session.buffer.push(chunk);
              session.buffered += chunk.length;
            }
            while (session.buffered > sizeLimit && session.buffer.length > 1) session.buffered -= session.buffer.shift()!.length;
            for (const view of session.views) view.onData(bytes);
          },
          end: () => this.end(session),
        },
      );
      session.pty = pty;
      if (launchSignal.aborted || pending.signal.aborted) {
        await pty.stop();
        launchSignal.throwIfAborted();
        throw unavailable(environment.view.name);
      }
      if (previous) this.sessions.delete(previous.info.id);
      this.changed(info.id);
      return { ...info };
    } catch (reason) {
      this.sessions.delete(info.id);
      if (reason instanceof HuhuError) throw reason;
      throw unavailable(environment.view.name);
    } finally {
      if (previous) this.restarting.delete(previous.info.id);
    }
  }

  readonly attach: SshTerminalAttacher = (id, view) => {
    const session = this.sessions.get(id);
    if (!session) return null;
    for (const bytes of session.buffer) view.onData(bytes);
    session.views.add(view);
    if (session.info.state === "ended") queueMicrotask(view.onEnd);
    return {
      write: (data) => {
        if (session.info.state === "running") session.pty?.write(data);
      },
      resize: (cols, rows) => {
        if (session.info.state === "running") session.pty?.resize(cols, rows);
      },
      detach: () => {
        session.views.delete(view);
      },
    };
  };

  async close(id: string) {
    const session = this.sessions.get(id);
    if (!session) throw errors.notFound("本地 Shell");
    if (session.info.state === "ended") return;
    session.pending.abort();
    await session.pty?.stop();
    this.end(session);
  }

  dispose(): Promise<void> {
    return (this.disposing ??= this.closeAll());
  }

  private async closeAll(): Promise<void> {
    this.lifetime.abort();
    await Promise.allSettled([...this.openings, ...Array.from(this.sessions.keys(), (id) => this.close(id))]);
  }

  private end(session: Session) {
    if (session.info.state === "ended") return;
    session.info.state = "ended";
    for (const view of session.views) view.onEnd();
    this.changed(session.info.id);
  }
}

const desktop = { plugin: "ssh", desktopOnly: true, exposable: false, defaultExposed: false, risk: "normal" } as const;
const empty = z.strictObject({});
export const sshLocalShellDescriptors = {
  localEnvironments: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.local.environments",
    title: "列出本机 Shell 环境",
    description: "发现当前设备已安装的 Shell 和 WSL 发行版。",
    scope: "read",
    input: empty,
    output: z.array(LocalEnvironment),
  }),
  localList: defineCapabilityDescriptor({ ...desktop, name: "ssh.local.list", title: "列出 SSH 模块本地终端", description: "读取此 Vault 的本地终端及其启动来源。", scope: "read", input: empty, output: z.array(LocalSession) }),
  localOpen: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.local.open",
    title: "打开本地 Shell",
    description: "在指定本机环境启动 PTY，或者使用原环境重新打开上一个终端。",
    scope: "execute",
    input: OpenLocalShell,
    output: LocalSession,
  }),
  localClose: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.local.close",
    title: "结束本地 Shell",
    description: "停止指定的本地终端进程。",
    scope: "execute",
    input: LocalSession.pick({ id: true }),
    output: z.strictObject({ ok: z.literal(true) }),
  }),
};

export function registerSshLocalShells(api: HuhuApi, launch: LaunchLocalPty) {
  const shells = new SshLocalShells(launch, (id) => api.events.publish("entity.changed", { kind: "ssh-local-shell", id, op: "updated" }));
  const requireDesktop = (caller: string) => {
    if (caller !== "desktop") throw errors.permissionDenied("SSH 本地终端");
  };
  const d = sshLocalShellDescriptors;
  api.defineCapability(
    bindCapability(d.localEnvironments, ({ caller, signal }) => {
      requireDesktop(caller);
      return shells.environments(signal);
    }),
  );
  api.defineCapability(
    bindCapability(d.localList, ({ caller }) => {
      requireDesktop(caller);
      return shells.list();
    }),
  );
  api.defineCapability(
    bindCapability(d.localOpen, ({ caller, signal }, input) => {
      requireDesktop(caller);
      return shells.open(input, signal);
    }),
  );
  api.defineCapability(
    bindCapability(d.localClose, async ({ caller }, { id }) => {
      requireDesktop(caller);
      await shells.close(id);
      return { ok: true as const };
    }),
  );
  return shells;
}
