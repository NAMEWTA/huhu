import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { findOnPath } from "./detect.js";
import { launchHash } from "./launch-binding.js";
import { linuxInstallationEnvironment, linuxInteractiveProgram } from "./linux-interactive-program.js";
import type { AgentEnvironmentAccess } from "./launch-environment.js";
import type { LaunchInput } from "./sessions.js";
import { nativeDirectory, nativeHostPlatform, pinNativeImage, nativeAgentEnvironment, protectedLinuxVariable, type NativeLaunchPlan, type PinnedImage } from "./native-pty.js";

export interface AgentEnvironmentSelection {
  id: string;
  revision: string;
}

export interface AgentEnvironmentApproval extends AgentEnvironmentSelection {
  approval: string;
}

export interface InteractiveNativePlan {
  kind: "native";
  helper: PinnedImage;
  launch: NativeLaunchPlan;
  selection: AgentEnvironmentSelection;
  provider: LaunchInput["provider"];
  approval: string;
}

interface InteractiveOrdinaryPlan {
  kind: "ordinary";
  env: Record<string, string>;
  approval: string;
}

const entryPattern = /\.(?:js|mjs|cjs)$/i;
const winExe = /\.exe$/i;

function piInstallation(shim: string): { node: string; entry: string; files: string[]; ordinary: Record<string, string> } {
  const node = findOnPath("node.exe");
  if (!node) throw errors.invalidInput("受保护 Pi 启动需要本机 Node.js");
  const dir = path.dirname(shim);
  const packageNames = ["@earendil-works/pi-coding-agent", "@mariozechner/pi-coding-agent"];
  const managed = existsSync(path.join(dir, "pi-launcher.js"));
  const installRoot = path.resolve(dir, "../install");
  let release = dir;
  if (managed) {
    const version = readFileSync(path.join(installRoot, "current-version"), "utf8").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/.test(version)) throw errors.invalidInput("无法读取 Pi 的本机安装版本");
    release = path.join(installRoot, "releases", version);
  }
  const pkg = packageNames.map((name) => path.join(release, "node_modules", name)).find((candidate) => existsSync(path.join(candidate, "package.json")));
  if (!pkg) throw errors.invalidInput("请在智能体设置中指定 Pi 的可执行文件或 JavaScript 入口");
  const manifest = path.join(pkg, "package.json");
  const { bin } = JSON.parse(readFileSync(manifest, "utf8")) as { bin?: string | { pi?: string } };
  const relative = typeof bin === "string" ? bin : bin?.pi;
  const entry = relative ? path.resolve(pkg, relative) : "";
  if (!relative || !entryPattern.test(entry) || path.relative(pkg, entry).startsWith("..") || !entry.startsWith(pkg + path.sep)) {
    throw errors.invalidInput("Pi 的安装入口无效");
  }
  const files = [manifest];
  const dist = path.join(pkg, "dist");
  if (existsSync(dist)) {
    for (const item of readdirSync(dist, { recursive: true, withFileTypes: true })) {
      if (item.isSymbolicLink()) throw errors.invalidInput("Pi 安装包含无法固定的文件链接");
      if (!item.isFile() || !/\.(?:js|mjs|cjs|json|wasm|node)$/i.test(item.name)) continue;
      const file = path.join(item.parentPath, item.name);
      if (file !== entry) files.push(file);
      if (files.length > 128) throw errors.invalidInput("Pi 安装超出受保护启动的固定文件范围");
    }
  }
  return { node, entry, files: files.sort(), ordinary: managed ? { PI_MANAGED_INSTALL_ROOT: installRoot } : {} };
}

function codexExecutable(shim: string): string {
  const modules = path.join(path.dirname(shim), "node_modules", "@openai");
  const bundled = path.join(modules, "codex", "node_modules", "@openai");
  const nativeRelative = path.join("codex-win32-x64", "vendor", "x86_64-pc-windows-msvc", "bin", "codex.exe");
  const image = [bundled, modules].map((dir) => path.join(dir, nativeRelative)).find(existsSync);
  if (!image) throw errors.invalidInput("请在智能体设置中指定本机 Codex 可执行文件");
  return image;
}

async function windowsProgram(provider: LaunchInput["provider"], resolvedArgv: string[] | undefined) {
  const [command, ...args] = resolvedArgv ?? [process.env["ComSpec"] ?? process.env["COMSPEC"] ?? ""];
  const base = path.basename(command ?? "").toLowerCase();
  const convertPi = provider === "pi" && base === "pi.cmd";
  let imagePath = command ?? "";
  let entryPath: string | undefined;
  let files: string[] = [];
  let ordinary: Record<string, string> = {};
  if (convertPi) {
    const install = piInstallation(imagePath);
    ({ node: imagePath, entry: entryPath, files, ordinary } = install);
  } else if (provider === "codex" && base === "codex.cmd") {
    imagePath = codexExecutable(imagePath);
  } else if (entryPattern.test(imagePath)) {
    entryPath = imagePath;
    imagePath = findOnPath("node.exe") ?? "";
  } else if (base === "node.exe") {
    entryPath = args.shift();
    if (entryPath === undefined || !entryPattern.test(entryPath) || !path.isAbsolute(entryPath)) {
      throw errors.invalidInput("受保护的 Node.js 启动需要固定的绝对入口文件");
    }
  }
  if (!winExe.test(imagePath)) throw errors.invalidInput("受保护启动需要本机 Windows 可执行文件或受支持的安装入口");
  const image = await pinNativeImage(imagePath);
  const entry = entryPath && (await pinNativeImage(entryPath));
  const pinned = await Promise.all(files.map(pinNativeImage));
  return {
    image,
    ...(entry && { entry }),
    files: pinned,
    argv: [image.path, ...(entry ? [entry.path] : []), ...args],
    ordinary,
  };
}

export class InteractiveEnvironment {
  constructor(
    private readonly helperFile: string | undefined,
    private readonly credentials: AgentEnvironmentAccess,
  ) {}

  get available(): boolean {
    return this.credentials.available && this.helperAvailable;
  }

  get helperAvailable(): boolean {
    return nativeHostPlatform() !== undefined && !!this.helperFile && existsSync(this.helperFile);
  }

  async pinHelper(): Promise<PinnedImage> {
    if (!this.helperAvailable) throw errors.invalidInput("当前桌面未配置本机受保护终端宿主");
    return pinNativeImage(this.helperFile!);
  }

  async prepare(selection: AgentEnvironmentSelection, provider: LaunchInput["provider"], cwd: string, argv: string[] | undefined, env: Record<string, string> | undefined): Promise<InteractiveOrdinaryPlan | InteractiveNativePlan> {
    if (argv && provider === "shell") throw errors.invalidInput("本机启动环境仅用于交互终端");
    const profile = await this.credentials.profile(selection, provider);
    const overlay = Object.fromEntries(profile.ordinary.map(({ name, value }) => [name, value]));
    const version = { id: selection.id, revision: selection.revision };
    if (!profile.protectedNames.length) {
      const ordinary = process.platform === "win32" ? Object.fromEntries(new Map(Object.entries({ ...env, ...overlay }).map(([name, value]) => [name.toUpperCase(), [name, value]] as const)).values()) : { ...env, ...overlay };
      return { kind: "ordinary", env: ordinary, approval: launchHash({ kind: "ordinary", cwd, argv, ordinary, selection: version, provider }) };
    }

    const platform = nativeHostPlatform();
    if (!platform || !this.available) throw errors.invalidInput("当前桌面未配置本机受保护终端宿主");
    const helper = await this.pinHelper();
    const effective = nativeAgentEnvironment(process.env, { ...env, ...overlay });
    const directory = await nativeDirectory(helper, cwd);
    let ordinary = effective;
    let program: Pick<NativeLaunchPlan, "image" | "entry" | "files" | "argv" | "linuxInstallation" | "returnShell">;
    if (platform === "linux") {
      program = await linuxInteractiveProgram(helper, provider, directory.path, argv, effective);
    } else {
      const windows = await windowsProgram(provider, argv);
      const { ordinary: derived } = windows;
      // Keep the first-generation Windows launch plan and approval shape.
      program = windows;
      ordinary = nativeAgentEnvironment(process.env, { ...env, ...derived, ...overlay });
    }
    const protect = profile.protectedNames;
    if (platform === "linux") {
      for (const name of linuxInstallationEnvironment(program.linuxInstallation)) {
        if (protect.includes(name)) throw errors.invalidInput("受保护变量不能覆盖已核对的安装参数");
        delete ordinary[name];
      }
    }
    const key = (name: string) => (platform === "win32" ? name.toUpperCase() : name);
    const protectedKeys = new Set(protect.map(key));
    if (platform === "linux" && [...Object.keys(ordinary), ...protect].some((name) => !protectedLinuxVariable(name))) {
      throw errors.invalidInput("受保护启动不能覆盖 Linux 动态加载器配置");
    }
    for (const name of Object.keys(ordinary)) {
      if (protectedKeys.has(key(name))) delete ordinary[name];
    }
    const launch = { ...program, directory, ordinary, protect };
    return { kind: "native", helper, launch, selection: version, provider, approval: launchHash({ helper, launch, selection: version, provider }) };
  }

  async use<R>(plan: InteractiveNativePlan, consumer: (values: ReadonlyMap<string, string>) => Promise<R>): Promise<R> {
    return this.credentials.use(plan.selection, plan.provider, plan.launch.protect, consumer);
  }
}
