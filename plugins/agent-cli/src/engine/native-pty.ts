import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, realpathSync } from "node:fs";
import path from "node:path";
import { errors } from "@huhu/contracts";

export type PinnedImage = { path: string; sha256: string };
type Directory = { path: string; id: { volume: string; index: string; created: string } };
export interface NativeLaunchPlan {
  directory: Directory;
  image: PinnedImage;
  entry?: PinnedImage;
  files: PinnedImage[];
  argv: string[];
  ordinary: Record<string, string>;
  protect: string[];
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

export async function pinNativeImage(file: string): Promise<PinnedImage> {
  if (!path.isAbsolute(file)) throw errors.invalidInput("请使用本机绝对文件路径");
  try {
    const resolved = realpathSync.native(file);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(resolved)) hash.update(chunk);
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
        env: windowsAgentEnvironment(process.env, {}),
        ...(signal && { signal }),
      },
      (error, stdout) => {
        if (error) reject(errors.invalidInput("Windows 受保护宿主无法核对本机文件或进程"));
        else resolve(stdout.trim());
      },
    );
  });
}

export async function nativeDirectory(helper: PinnedImage, cwd: string): Promise<Directory> {
  let resolved: string;
  try {
    resolved = realpathSync.native(cwd);
  } catch {
    throw errors.invalidInput("工作目录已变化，请重新选择");
  }
  const identity = /^HUHU_PTY DIRECTORY 1 (\d{1,20}) (\d{1,20}) (\d{1,20})$/.exec(await helperStatus(helper.path, ["directory", resolved]));
  if (!identity) throw errors.invalidInput("无法核对受保护启动的工作目录");
  return { path: resolved, id: { volume: identity[1]!, index: identity[2]!, created: identity[3]! } };
}

export type BrokerOutcome = "started" | "not-started" | "unknown";

export class NativePtyBroker {
  private readonly runId = randomBytes(16).toString("hex");
  private readonly child: ChildProcessWithoutNullStreams;
  private transcript = "";
  private readonly controller = new AbortController();
  private readonly signal: AbortSignal;
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
      env: windowsAgentEnvironment(process.env, {}),
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
    if (!created || this.signal.aborted) throw errors.invalidInput("Windows 受保护宿主未就绪");
    return [this.helper.path, "host", this.runId, String(this.child.pid), created];
  }

  async inspectHost(hostPid: number): Promise<{ pid: number; created: string; image: PinnedImage } | null> {
    if (this.signal.aborted) return null;
    try {
      const status = await helperStatus(this.helper.path, ["inspect", String(hostPid), this.helper.path, this.helper.sha256], this.signal);
      const process = /^HUHU_PTY PROCESS 1 (\d{1,10}) (\d{1,20})$/.exec(status);
      return process && Number(process[1]) === hostPid ? { pid: hostPid, created: process[2]!, image: this.helper } : null;
    } catch {
      return null;
    }
  }

  async start(host: { pid: number; created: string; image: PinnedImage }, plan: NativeLaunchPlan, protectedValues: ReadonlyMap<string, string>, onConsumed: () => void): Promise<BrokerOutcome> {
    if (this.issued || this.signal.aborted) return "not-started";
    this.issued = true;
    const { ordinary, ...target } = plan;
    const environment = new Map(Object.entries(ordinary).map(([name, value]) => [name.toUpperCase(), [name, value] as const]));
    for (const [name, value] of protectedValues) environment.set(name.toUpperCase(), [name, value]);
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
