import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants, createReadStream, realpathSync } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { errors } from "@huhu/contracts";

type FileIdentity = { volume: string; index: string; created: string };
export type PinnedImage = { path: string; sha256: string; id?: FileIdentity };
export type ApprovedLinuxShell = {
  executable: { path: string; identity: string; birthtimeNs: string; ctimeNs: string; mtimeNs: string; size: string; sha256: string };
  argv: [executable: string, flag: "-c", command: string];
};
type Directory = { path: string; id: FileIdentity };
export interface NativeLaunchPlan {
  directory: Directory;
  image: PinnedImage;
  entry?: PinnedImage;
  files: PinnedImage[];
  argv: string[];
  ordinary: Record<string, string>;
  protect: string[];
  approvedShell?: ApprovedLinuxShell["executable"];
}

const WIN_AMBIENT = new Set([
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "WINDIR",
  "COMSPEC",
  "PATH",
  "PATHEXT",
  "TEMP",
  "TMP",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMW6432",
  "COMMONPROGRAMFILES",
  "USERNAME",
  "USERDOMAIN",
  "TERM",
  "COLORTERM",
  "LANG",
  "LC_ALL",
  "OS",
  "PROCESSOR_ARCHITECTURE",
]);
export function windowsAgentEnvironment(env: NodeJS.ProcessEnv, ordinary: Record<string, string>): Record<string, string> {
  const values = new Map<string, readonly [string, string]>();
  for (const [name, value] of Object.entries(env)) {
    const key = name.toUpperCase();
    if (value !== undefined && WIN_AMBIENT.has(key) && !values.has(key)) values.set(key, [name, value]);
  }
  for (const [name, value] of Object.entries(ordinary)) values.set(name.toUpperCase(), [name, value]);
  return Object.fromEntries(values.values());
}

const LINUX_AMBIENT = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LANGUAGE",
  "TMPDIR",
  "TERM",
  "COLORTERM",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
  "XDG_RUNTIME_DIR",
  "DBUS_SESSION_BUS_ADDRESS",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "XAUTHORITY",
]);

export function nativeHostPlatform(): "linux" | "win32" | undefined {
  return process.arch === "x64" && (process.platform === "linux" || process.platform === "win32") ? process.platform : undefined;
}

export function protectedLinuxVariable(name: string): boolean {
  return !name.startsWith("LD_") && name !== "GLIBC_TUNABLES";
}

export function nativeAgentEnvironment(env: NodeJS.ProcessEnv, ordinary: Record<string, string>): Record<string, string> {
  if (process.platform === "win32") return windowsAgentEnvironment(env, ordinary);
  return { ...Object.fromEntries(Object.entries(env).flatMap(([name, value]) => (value !== undefined && (LINUX_AMBIENT.has(name) || /^LC_[A-Z_]+$/.test(name)) ? [[name, value]] : []))), ...ordinary };
}

export async function pinNativeImage(file: string): Promise<PinnedImage> {
  if (!path.isAbsolute(file)) throw errors.invalidInput("请使用本机绝对文件路径");
  try {
    const resolved = realpathSync.native(file);
    const hash = createHash("sha256");
    if (process.platform === "linux") {
      const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const stat = await handle.stat({ bigint: true });
        if (!stat.isFile() || stat.size > 512n * 1024n * 1024n) throw new Error("Invalid executable file");
        for await (const chunk of handle.createReadStream({ autoClose: false, end: Number(stat.size) })) hash.update(chunk);
        if ((await handle.stat({ bigint: true })).ctimeNs !== stat.ctimeNs) throw new Error("Executable changed during verification");
      } finally {
        await handle.close();
      }
    } else {
      for await (const chunk of createReadStream(resolved)) hash.update(chunk);
    }
    return { path: resolved, sha256: hash.digest("hex") };
  } catch {
    throw errors.invalidInput("无法核对受保护启动所需的程序文件");
  }
}

function helperStatus(exe: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      exe,
      args,
      {
        timeout: 5000,
        maxBuffer: 4096,
        windowsHide: true,
        env: nativeAgentEnvironment(process.env, {}),
        ...(signal && { signal }),
      },
      (error, stdout) => {
        if (error) reject(errors.invalidInput("受保护终端宿主无法核对本机文件或进程"));
        else resolve(stdout.trim());
      },
    );
  });
}

function identityFromStatus(status: string, operation: "DIRECTORY" | "PROGRAM"): FileIdentity {
  const match = /^HUHU_PTY (DIRECTORY|PROGRAM) 1 (\d{1,20}) (\d{1,20}) (\d{1,20})$/.exec(status);
  if (!match || match[1] !== operation) throw errors.invalidInput("无法核对受保护启动的程序或工作目录");
  return { volume: match[2]!, index: match[3]!, created: match[4]! };
}

export async function linuxProgramIdentity(helper: PinnedImage, image: PinnedImage): Promise<PinnedImage> {
  try {
    const status = await helperStatus(helper.path, ["program", image.path, image.sha256]);
    return { ...image, id: identityFromStatus(status, "PROGRAM") };
  } catch {
    throw errors.invalidInput("Linux 受保护启动需要可核验的本机 ELF 可执行文件");
  }
}

export async function nativeDirectory(helper: PinnedImage, cwd: string): Promise<Directory> {
  let resolved: string;
  try {
    resolved = realpathSync.native(cwd);
  } catch {
    throw errors.invalidInput("工作目录已变化，请重新选择");
  }
  const id = identityFromStatus(await helperStatus(helper.path, ["directory", resolved]), "DIRECTORY");
  return { path: resolved, id };
}

export type BrokerOutcome = "started" | "not-started" | "unknown";

export class NativePtyBroker {
  private readonly runId = randomBytes(16).toString("hex");
  private readonly child: ChildProcessWithoutNullStreams;
  private transcript = "";
  private readonly controller = new AbortController();
  private readonly signal: AbortSignal;
  readonly waiting: AbortSignal;
  private readonly exit: Promise<number | null>;
  private readonly ready: Promise<string | null>;
  private issued = false;
  private onConsumed: (() => void) | undefined;

  constructor(
    private readonly helper: PinnedImage,
    signal?: AbortSignal,
  ) {
    this.signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(24_000), ...(signal ? [signal] : [])]);
    this.signal.throwIfAborted();
    this.child = spawn(helper.path, ["broker", this.runId], {
      env: nativeAgentEnvironment(process.env, {}),
      windowsHide: true,
      stdio: "pipe",
      signal: this.signal,
    });
    this.child.stderr.resume(); // Fixed diagnostic codes; keep transport output out of application logs.
    this.child.stdin.on("error", () => {});
    this.exit = new Promise((resolve) => {
      this.child.once("error", () => resolve(null));
      this.child.once("close", (code) => resolve(code));
    });
    const stopped = new AbortController();
    this.waiting = AbortSignal.any([this.signal, stopped.signal]);
    void this.exit.then(() => stopped.abort());
    this.ready = new Promise((resolve) => {
      this.child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        if (this.transcript.length + chunk.length > 4096) {
          this.revoke();
          resolve(null);
          return;
        }
        this.transcript += chunk;
        if (this.onConsumed && /^HUHU_PTY ISSUED_ONCE\r?\n/m.test(this.transcript)) {
          const notify = this.onConsumed;
          this.onConsumed = undefined;
          try {
            notify();
          } catch {
            this.revoke();
          }
        }
        const ready = /^HUHU_PTY BROKER_READY 1 (\d{1,10}) (\d{1,20})\r?$/m.exec(this.transcript);
        if (ready && Number(ready[1]) === this.child.pid) resolve(ready[2]!);
      });
      void this.exit.then(() => resolve(null));
    });
  }

  async hostArgv(): Promise<string[]> {
    const created = await this.ready;
    if (!created || this.signal.aborted) throw errors.invalidInput("受保护终端宿主未就绪");
    return [this.helper.path, "host", this.runId, String(this.child.pid), created];
  }

  async inspectHost(hostPid: number): Promise<{ pid: number; created: string; image: PinnedImage } | null> {
    if (this.signal.aborted) return null;
    try {
      const args = ["inspect", String(hostPid), this.helper.path, this.helper.sha256];
      if (process.platform === "linux") {
        const created = await this.ready;
        if (!created || !this.child.pid) return null;
        args.push(this.runId, String(this.child.pid), created);
      }
      const status = await helperStatus(this.helper.path, args, this.signal);
      const match = /^HUHU_PTY PROCESS 1 (\d{1,10}) (\d{1,20})$/.exec(status);
      return match && Number(match[1]) === hostPid ? { pid: hostPid, created: match[2]!, image: this.helper } : null;
    } catch {
      return null;
    }
  }

  async start(host: { pid: number; created: string; image: PinnedImage }, plan: NativeLaunchPlan, protectedValues: ReadonlyMap<string, string>, onConsumed: () => void): Promise<BrokerOutcome> {
    if (this.issued || this.signal.aborted) return "not-started";
    this.issued = true;
    const { ordinary, ...target } = plan;
    const key = (name: string) => (process.platform === "win32" ? name.toUpperCase() : name);
    const environment = new Map(Object.entries(ordinary).map(([name, value]) => [key(name), [name, value] as const]));
    for (const [name, value] of protectedValues) environment.set(key(name), [name, value]);
    const message = Buffer.from(
      JSON.stringify({
        version: 1,
        host,
        launch: { ...target, environment: Object.fromEntries(environment.values()) },
      }),
      "utf8",
    );
    environment.clear();
    this.onConsumed = onConsumed;
    this.child.stdin.end(message, () => message.fill(0));
    const code = await this.exit;
    message.fill(0);
    this.onConsumed = undefined;
    const consumed = /^HUHU_PTY ISSUED_ONCE\r?\n/m.test(this.transcript);
    if (consumed && /^HUHU_PTY RUNNING\r?\n/m.test(this.transcript)) return "started";
    if (/^HUHU_PTY START_FAILED (?:70|74)\r?\n/m.test(this.transcript)) return "not-started";
    if (!consumed && (code === 64 || code === 73 || code === 74)) return "not-started";
    return "unknown";
  }

  revoke(): void {
    this.controller.abort();
    this.child.stdin.destroy();
  }
}
