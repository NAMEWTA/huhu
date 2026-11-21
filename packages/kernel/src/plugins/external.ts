import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { errors, HuhuError, PluginManifestSchema, type CapabilityResult, type PluginManifest } from "@huhu/contracts";
import { unzipSync } from "fflate";
import type { PluginEntry, PluginManager } from "../plugin-manager.js";
import { BUILTIN_ONLY_PERMISSIONS, PERMISSION_TABLE } from "../permissions.js";
import { bindCapability, type CapabilityContext, type CapabilityRegistry } from "../capabilities/define.js";
import type { Dispatcher } from "../dispatcher.js";
import { externalCommandDescriptors, type ExternalCommandDescriptor } from "./command-descriptors.js";
import { PLUGIN_HOST_SCRIPT } from "./host-script.js";

const MAX_FILES = 300;
const MAX_BYTES = 8 * 1024 * 1024;
const READY_TIMEOUT_MS = 15_000;
const RUN_TIMEOUT_MS = 60_000;

interface Record_ {
  version: string;
  enabled: boolean;
  grants?: string[];
}
export interface ExternalInfo {
  manifest: PluginManifest;
  main: string;
  publisher?: string;
  tags: string[];
  /** 来源目录（folder）或解压后的临时目录（zip）；安装后不再使用。 */
  dir: string;
  cleanup?: () => void;
}
export interface PermissionInfo {
  name: string;
  capabilities: readonly string[];
}
export interface ExternalCommand {
  pluginId: string;
  id: string;
  title: string;
}

export interface ExternalDeps {
  /** Vault 根目录。 */
  root: string;
  /** 状态目录；缺省为 `<root>/.huhu`。 */
  stateDir?: string;
  plugins: PluginManager;
  registry: CapabilityRegistry;
  dispatcher(): Dispatcher;
  vaultInstance: string;
  /** 运行宿主进程的可执行文件（Electron 主程序，配合 ELECTRON_RUN_AS_NODE）。 */
  nodeBin?: string;
  /** 随应用提供的示例扩展目录。 */
  examplesDir?: string;
  /** 只读 Vault 不能安装 / 卸载。 */
  assertWritable?(): void;
}

/** 宿主进程只拿到运行 Node 所需的最小环境：不把 Engine 进程里的 API 密钥等环境变量带给扩展。 */
function hostEnv(): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TEMP", "TMP", "SystemRoot", "LANG", "LC_ALL", "APPDATA", "LOCALAPPDATA"];
  const env: NodeJS.ProcessEnv = { ELECTRON_RUN_AS_NODE: "1" };
  for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
  return env;
}

const reject = (msg: string): never => {
  throw errors.invalidInput(`扩展无效：${msg}`);
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) reject(`不允许符号链接：${e.name}`);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

type Failure = Extract<CapabilityResult<unknown>, { ok: false }>;
type Delegation = {
  context: CapabilityContext;
  command: ExternalCommandDescriptor;
  vaultInstance: string;
  expires: number;
  controller: AbortController;
  childFailures: Map<string, Failure>;
  inflight: number;
  uncertain?: Failure;
  settle(result: CapabilityResult<unknown>): void;
};

type Host = {
  child: ChildProcess;
  commands: Map<string, ExternalCommandDescriptor>;
  pending: Map<string, Delegation>;
  lifetime: AbortController;
};

const failure = (error: HuhuError): Failure => ({ ok: false, error: error.toJSON() });
const rethrow = ({ code, message, retryable, details, recovery }: Failure["error"]): never => {
  throw new HuhuError(code, message, { retryable, ...(details && { details }), ...(recovery && { recovery }) });
};

/** External Node hosts get one capability delegation per active, declared command. */
export class ExternalPlugins {
  private readonly hosts = new Map<string, Host>();
  private readonly descriptors = new WeakMap<PluginManifest, ExternalCommandDescriptor[]>();
  private builtinIds = new Set<string>();

  constructor(private readonly d: ExternalDeps) {}

  private get stateDir(): string {
    return this.d.stateDir ?? path.join(this.d.root, ".huhu");
  }

  private get recordFile(): string {
    return path.join(this.stateDir, "plugins", "external.json");
  }
  private get trustFile(): string {
    return path.join(this.stateDir, "local", "external-trust.json");
  }
  private pkgDir(id: string, version: string): string {
    const base = path.join(this.stateDir, "plugins", "external");
    const dir = path.join(base, id, version);
    if (!dir.startsWith(path.join(base, id) + path.sep)) throw errors.invalidInput("扩展版本号不合法");
    return dir;
  }
  dataDir(id: string): string {
    return path.join(this.stateDir, "plugins", "data", id);
  }
  private readJson<T>(file: string, fallback: T): T {
    try {
      return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;
    } catch {
      return fallback;
    }
  }
  private records(): Record<string, Record_> {
    return this.readJson<Record<string, Record_>>(this.recordFile, {});
  }
  private writeJson(file: string, value: unknown): void {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file + ".tmp", `${JSON.stringify(value, null, 2)}\n`);
    renameSync(file + ".tmp", file);
  }
  private trusted(): Record<string, string> {
    return this.readJson<Record<string, string>>(this.trustFile, {});
  }

  has(id: string): boolean {
    return Object.hasOwn(this.records(), id);
  }
  /** 启动时是否启用：用户没停用，且在本机信任过（同步来的扩展不自动运行）。 */
  shouldEnable(id: string): boolean {
    const all = this.records();
    const r = Object.hasOwn(all, id) ? all[id] : undefined;
    return r !== undefined && r.enabled && Object.hasOwn(this.trusted(), id) && this.trusted()[id] === this.trustKey(id, r.version);
  }
  /** 信任绑定版本 + 包内容哈希：同版本的文件被替换后不再自动运行。 */
  private trustKey(id: string, version: string): string {
    const dir = this.pkgDir(id, version);
    const h = createHash("sha256");
    try {
      for (const f of walk(dir).sort()) h.update(path.relative(dir, f)).update("\0").update(readFileSync(f)).update("\0");
    } catch {
      return `${version}:unreadable`;
    }
    return `${version}:${h.digest("hex")}`;
  }
  /** 用户在本机显式启用 / 停用：启用即视为信任这个版本。 */
  setEnabled(id: string, enabled: boolean): void {
    this.d.assertWritable?.();
    const all = this.records();
    const r = Object.hasOwn(all, id) ? all[id] : undefined;
    if (!r) return;
    all[id] = { ...r, enabled };
    this.writeJson(this.recordFile, all);
    if (enabled) this.writeJson(this.trustFile, { ...this.trusted(), [id]: this.trustKey(id, r.version) });
  }

  permissionInfo(manifest: PluginManifest): PermissionInfo[] {
    return manifest.permissions.map((name) => ({ name, capabilities: PERMISSION_TABLE[name] ?? [] }));
  }

  grantsOf(id: string): readonly string[] {
    const all = this.records();
    if (!Object.hasOwn(all, id)) return [];
    const declared = this.d.plugins.permissionsOf(id);
    const granted = all[id]?.grants ?? declared;
    return Array.isArray(granted) ? granted.filter((name) => declared.includes(name)) : [];
  }

  setGrants(id: string, grants: string[]): void {
    this.d.assertWritable?.();
    const all = this.records();
    if (!Object.hasOwn(all, id)) throw errors.notFound("扩展授权");
    const declared = this.d.plugins.permissionsOf(id);
    if (new Set(grants).size !== grants.length || grants.some((name) => !declared.includes(name))) throw errors.invalidInput("授权超出扩展清单");
    all[id] = { ...all[id]!, grants };
    this.writeJson(this.recordFile, all);
  }

  declare(manifest: PluginManifest, pendingInstall: boolean): void {
    const commands = externalCommandDescriptors(manifest, this.trustKey(manifest.id, manifest.version));
    this.d.registry.declareDescriptors(
      manifest.id,
      commands.map(({ capability }) => capability),
      manifest.contributes.capabilities,
      pendingInstall,
    );
    this.descriptors.set(manifest, commands);
  }

  /** 读取并校验清单；zip 先安全解压到临时目录。 */
  inspect(source: string): ExternalInfo {
    if (!path.isAbsolute(source) || !existsSync(source)) throw errors.invalidInput("来源不存在");
    let dir = source;
    let cleanup: (() => void) | undefined;
    if (statSync(source).isFile()) {
      if (!/\.zip$/i.test(source)) reject("请选择文件夹或 .zip");
      const tmp = mkdtempSync(path.join(tmpdir(), "huhu-ext-"));
      cleanup = () => rmSync(tmp, { recursive: true, force: true });
      try {
        this.unzipTo(source, tmp);
      } catch (e) {
        cleanup();
        throw e;
      }
      const entries = readdirSync(tmp);
      dir = entries.length === 1 && statSync(path.join(tmp, entries[0] as string)).isDirectory() && !existsSync(path.join(tmp, "huhu-plugin.json")) ? path.join(tmp, entries[0] as string) : tmp;
    }
    try {
      const files = walk(dir);
      if (files.length > MAX_FILES) reject(`文件过多（最多 ${MAX_FILES} 个）`);
      if (files.reduce((n, f) => n + statSync(f).size, 0) > MAX_BYTES) reject("体积过大（最多 8 MB）");
      const manifestFile = path.join(dir, "huhu-plugin.json");
      if (!existsSync(manifestFile)) reject("缺少 huhu-plugin.json");
      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(readFileSync(manifestFile, "utf8")) as Record<string, unknown>;
      } catch {
        return reject("huhu-plugin.json 不是合法 JSON");
      }
      const parsed = PluginManifestSchema.safeParse(raw);
      if (!parsed.success) return reject(parsed.error.issues.map((i) => `${i.path.join(".")}：${i.message}`).join("；"));
      const manifest = parsed.data;
      if (manifest.origin !== "external") reject("origin 必须是 external");
      externalCommandDescriptors(manifest, manifest.version);
      if (this.builtinIds.has(manifest.id) || (this.d.plugins.has(manifest.id) && !this.has(manifest.id))) reject(`id 与内置插件冲突：${manifest.id}`);
      const bad = manifest.permissions.filter((p) => !Object.hasOwn(PERMISSION_TABLE, p) || BUILTIN_ONLY_PERMISSIONS.has(p));
      if (bad.length > 0) reject(`未知权限：${bad.join("、")}`);
      const main = typeof raw["main"] === "string" ? (raw["main"] as string) : "main.mjs";
      const abs = path.resolve(dir, main);
      if (path.isAbsolute(main) || !abs.startsWith(path.resolve(dir) + path.sep) || !/\.(mjs|js)$/.test(main)) reject("main 必须是包内的 .mjs / .js 文件");
      if (!existsSync(abs) || lstatSync(abs).isSymbolicLink()) reject(`main 文件不存在：${main}`);
      return {
        manifest,
        main,
        ...(typeof raw["publisher"] === "string" ? { publisher: raw["publisher"] as string } : {}),
        tags: Array.isArray(raw["tags"]) ? (raw["tags"] as unknown[]).filter((t): t is string => typeof t === "string") : [],
        dir,
        ...(cleanup ? { cleanup } : {}),
      };
    } catch (e) {
      cleanup?.();
      throw e;
    }
  }

  private unzipTo(zip: string, target: string): void {
    if (statSync(zip).size > MAX_BYTES) reject("zip 体积过大（最多 8 MB）");
    let entries: Record<string, Uint8Array>;
    try {
      // 在解压之前按声明的原始大小累计：文件数 / 总体积超限就不解压（防压缩炸弹）
      let files = 0;
      let declared = 0;
      entries = unzipSync(readFileSync(zip), {
        filter: (f) => {
          files += 1;
          declared += f.originalSize;
          if (files > MAX_FILES) reject(`文件过多（最多 ${MAX_FILES} 个）`);
          if (f.originalSize > MAX_BYTES || declared > MAX_BYTES) reject("体积过大（最多 8 MB）");
          return true;
        },
      });
    } catch (e) {
      if (e instanceof Error && e.name === "HuhuError") throw e;
      return reject("不是有效的 zip 文件");
    }
    let total = 0;
    const names = Object.keys(entries);
    if (names.length > MAX_FILES) reject(`文件过多（最多 ${MAX_FILES} 个）`);
    for (const name of names) {
      const norm = path.posix.normalize(name.replace(/\\/g, "/"));
      if (norm.startsWith("../") || norm === ".." || path.posix.isAbsolute(norm) || /^[A-Za-z]:/.test(norm)) reject(`不安全的路径：${name}`);
      if (name.endsWith("/")) continue;
      const bytes = entries[name] as Uint8Array;
      total += bytes.byteLength;
      if (total > MAX_BYTES) reject("体积过大（最多 8 MB）");
      const out = path.join(target, norm);
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, bytes);
    }
  }

  /** 随应用提供的示例扩展（发现页）。 */
  examples(): { id: string; manifest: PluginManifest; publisher: string; tags: string[]; installed: boolean; source: string }[] {
    const root = this.d.examplesDir;
    if (!root || !existsSync(root)) return [];
    const out = [];
    for (const name of readdirSync(root).sort()) {
      const dir = path.join(root, name);
      try {
        if (!statSync(dir).isDirectory()) continue;
        const info = this.inspect(dir);
        out.push({ id: info.manifest.id, manifest: info.manifest, publisher: info.publisher ?? "HUHU 示例", tags: info.tags, installed: this.has(info.manifest.id), source: dir });
      } catch {
        // 损坏的示例不显示
      }
    }
    return out;
  }

  /** 启动时登记已安装的扩展（不启动进程；是否启用由 shouldEnable 决定）。 */
  load(builtinIds: Iterable<string>): void {
    this.builtinIds = new Set(builtinIds);
    for (const [id, r] of Object.entries(this.records())) {
      try {
        const info = this.inspect(this.pkgDir(id, r.version));
        this.d.plugins.register(this.entry(info));
      } catch {
        // 包损坏：不登记，插件中心不显示；用户可重新安装
      }
    }
  }

  private entry(info: ExternalInfo): PluginEntry {
    const { manifest, main } = info;
    const dir = this.pkgDir(manifest.id, manifest.version);
    return {
      manifest,
      apply: async (ctx, api) => {
        const descriptors = this.descriptors.get(manifest) ?? [];
        const host = await this.spawnHost(manifest.id, dir, main, descriptors);
        ctx.effect(() => () => this.stopHost(manifest.id, host));
        for (const command of descriptors) {
          api.defineCapability(bindCapability(command.capability, (context, args) => this.runCommand(host, command, context, args)));
        }
      },
    };
  }

  async install(source: string, grants: string[]): Promise<{ id: string }> {
    this.d.assertWritable?.();
    const info = this.inspect(source);
    try {
      const want = [...info.manifest.permissions].sort().join(",");
      if ([...grants].sort().join(",") !== want) throw errors.invalidInput("授权与扩展请求的权限不一致，请重新确认");
      const id = info.manifest.id;
      if (this.has(id) || this.d.plugins.has(id)) throw errors.nameConflict(`扩展已安装：${id}`);
      const target = this.pkgDir(id, info.manifest.version);
      const hadData = existsSync(this.dataDir(id)); // 回滚时只清理这次安装新建的数据目录，不动用户之前保留的数据
      try {
        mkdirSync(path.dirname(target), { recursive: true });
        cpSync(info.dir, target, { recursive: true, dereference: false });
        this.writeJson(this.recordFile, { ...this.records(), [id]: { version: info.manifest.version, enabled: true, grants } });
        this.writeJson(this.trustFile, { ...this.trusted(), [id]: this.trustKey(id, info.manifest.version) });
        const state = await this.d.plugins.activateInstall(this.entry(this.inspect(target)));
        if (state !== "active") throw errors.invalidInput(`扩展未能启动：${this.d.plugins.error(id) ?? "未知原因"}`);
      } catch (e) {
        await this.rollback(id, !hadData); // 任何一步失败都不留半安装状态（可直接再试）
        throw e;
      }
      return { id };
    } finally {
      info.cleanup?.();
    }
  }

  private async rollback(id: string, eraseData: boolean): Promise<void> {
    await this.d.plugins.unregister(id).catch(() => undefined);
    rmSync(path.join(this.stateDir, "plugins", "external", id), { recursive: true, force: true });
    const records = this.records();
    if (Object.hasOwn(records, id)) {
      delete records[id];
      this.writeJson(this.recordFile, records);
    }
    const trust = this.trusted();
    if (Object.hasOwn(trust, id)) {
      delete trust[id];
      this.writeJson(this.trustFile, trust);
    }
    if (eraseData) rmSync(this.dataDir(id), { recursive: true, force: true });
  }

  /** 卸载：默认保留数据目录（ACC-PL-04）；eraseData 单独选择。 */
  async uninstall(id: string, eraseData: boolean): Promise<void> {
    this.d.assertWritable?.();
    const records = this.records();
    const r = Object.hasOwn(records, id) ? records[id] : undefined;
    if (!r) throw errors.notFound(`不是已安装的外部扩展：${id}`);
    await this.d.plugins.unregister(id);
    rmSync(path.join(this.stateDir, "plugins", "external", id), { recursive: true, force: true });
    delete records[id];
    this.writeJson(this.recordFile, records);
    const trust = this.trusted();
    delete trust[id];
    this.writeJson(this.trustFile, trust);
    if (eraseData) rmSync(this.dataDir(id), { recursive: true, force: true });
  }

  commands(): ExternalCommand[] {
    return [...this.hosts.entries()].flatMap(([pluginId, host]) => (this.d.plugins.isEnabled(pluginId) ? [...host.commands.values()].map(({ commandId, capability }) => ({ pluginId, id: commandId, title: capability.title })) : []));
  }

  async forwardCommand(context: CapabilityContext, pluginId: string, commandId: string, input: unknown) {
    const result = await this.d.dispatcher().forwardCommand(context, `extensions.${pluginId}.${commandId}`, input);
    if (!result.ok) return rethrow(result.error);
    return { result: result.data, ...(result.opId && { operationId: result.opId }) };
  }

  private async runCommand(host: Host, command: ExternalCommandDescriptor, context: CapabilityContext, args: unknown): Promise<unknown> {
    if (host.lifetime.signal.aborted || context.signal.aborted || (context.session && context.session.vaultInstance !== this.d.vaultInstance)) throw errors.permissionDenied(command.capability.name);
    if (host.pending.size >= 8) throw errors.invalidInput("这个扩展正在执行的命令过多");
    const handle = randomBytes(32).toString("base64url");
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, context.signal, host.lifetime.signal]);
    const expires = Date.now() + RUN_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
    timer.unref();
    let cancel: (() => void) | undefined;
    try {
      const result = await new Promise<CapabilityResult<unknown>>((settle) => {
        cancel = () => settle(failure(new HuhuError("INTERNAL", "命令委托已结束", { retryable: false, details: { outcome: "unknown" } })));
        signal.addEventListener("abort", cancel, { once: true });
        host.pending.set(handle, { context, command, vaultInstance: this.d.vaultInstance, expires, controller, childFailures: new Map(), inflight: 0, settle });
        host.child.send({ type: "run", handle, id: command.commandId, args }, (error) => {
          if (error) controller.abort();
        });
      });
      if (!result.ok) return rethrow(result.error);
      this.d.dispatcher().assertCommandCurrent(context);
      const output = command.capability.output.safeParse(result.data);
      if (!output.success) throw new HuhuError("INTERNAL", "扩展命令输出不符合声明", { retryable: false, details: { outcome: "unknown" } });
      return output.data;
    } finally {
      clearTimeout(timer);
      if (cancel) signal.removeEventListener("abort", cancel);
      host.pending.delete(handle);
      controller.abort();
      if (host.child.connected) host.child.send({ type: "end", handle }, () => undefined);
    }
  }

  private receive(host: Host, m: Record<string, unknown>) {
    const handle = m["handle"];
    if (typeof handle !== "string") return;
    const invocation = host.pending.get(handle);
    if (
      !invocation ||
      this.hosts.get(invocation.command.capability.plugin) !== host ||
      invocation.vaultInstance !== this.d.vaultInstance ||
      invocation.expires <= Date.now() ||
      invocation.context.signal.aborted ||
      invocation.controller.signal.aborted ||
      host.lifetime.signal.aborted
    )
      return;
    if (m["type"] === "child-call") {
      const callId = m["callId"];
      const capability = m["capability"];
      if (typeof callId !== "string" || typeof capability !== "string") return;
      void this.childCall(host, invocation, handle, callId, capability, m["input"], m["step"]);
    } else if (m["type"] === "result") {
      host.pending.delete(handle);
      if (invocation.uncertain) {
        invocation.settle(invocation.uncertain);
      } else if (invocation.inflight !== 0) {
        invocation.settle(failure(new HuhuError("INTERNAL", "命令结束时仍有子调用", { retryable: false, details: { outcome: "unknown" } })));
      } else if (m["ok"] === true) {
        invocation.settle({ ok: true, data: m["result"] });
      } else {
        const failedCallId = m["failedCallId"];
        const childFailure = typeof failedCallId === "string" ? invocation.childFailures.get(failedCallId) : undefined;
        invocation.settle(childFailure ?? failure(new HuhuError("INTERNAL", "扩展命令失败", { retryable: false, details: { outcome: "unknown" } })));
      }
    }
  }

  private async childCall(host: Host, invocation: Delegation, handle: string, callId: string, capability: string, input: unknown, step: unknown) {
    const send = (result: CapabilityResult<unknown>) => {
      if (host.pending.get(handle) !== invocation || !host.child.connected) return;
      if (!result.ok) {
        if (result.error.details?.["outcome"] === "unknown") invocation.uncertain = result;
        if (invocation.childFailures.size >= 40) invocation.childFailures.delete(invocation.childFailures.keys().next().value!);
        invocation.childFailures.set(callId, result);
      }
      host.child.send({ type: "child-result", handle, callId, result }, () => undefined);
    };
    if (invocation.uncertain) {
      send(invocation.uncertain);
      return;
    }
    if (invocation.inflight >= 8) {
      send(failure(errors.invalidInput("命令并发子调用过多")));
      return;
    }
    invocation.inflight++;
    try {
      const signal = AbortSignal.any([invocation.context.signal, invocation.controller.signal, host.lifetime.signal]);
      send(await this.d.dispatcher().invokeCommandStep(invocation.context, capability, input, step, { signal, vaultInstance: invocation.vaultInstance }));
    } catch {
      send(failure(new HuhuError("INTERNAL", "子调用结果待核实", { retryable: false, details: { outcome: "unknown" } })));
    } finally {
      invocation.inflight--;
    }
  }

  private spawnHost(id: string, dir: string, main: string, descriptors: ExternalCommandDescriptor[]): Promise<Host> {
    mkdirSync(this.dataDir(id), { recursive: true });
    const nodeBin = this.d.nodeBin ?? (process.env["HUHU_NODE_BIN"] || process.execPath);
    const child = spawn(nodeBin, ["--input-type=module", "-e", PLUGIN_HOST_SCRIPT, "--", dir, main, this.dataDir(id)], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      windowsHide: true,
      env: hostEnv(),
    });
    const host: Host = { child, commands: new Map(descriptors.map((command) => [command.commandId, command])), pending: new Map(), lifetime: new AbortController() };
    this.hosts.set(id, host);
    let stderr = "";
    child.stderr?.on("data", (d) => (stderr = (stderr + String(d)).slice(-2000)));
    return new Promise<Host>((resolve, rejectStart) => {
      let ready = false;
      const timer = setTimeout(() => rejectStart(new Error("扩展启动超时")), READY_TIMEOUT_MS);
      child.on("message", (m: unknown) => {
        if (!m || typeof m !== "object") return;
        const message = m as Record<string, unknown>;
        if (ready) {
          this.receive(host, message);
          return;
        }
        if (message["type"] === "failed") {
          rejectStart(new Error(typeof message["error"] === "string" ? message["error"] : "扩展启动失败"));
        } else if (message["type"] === "ready") {
          const registered = message["commands"];
          if (!Array.isArray(registered) || registered.length !== host.commands.size || new Set(registered).size !== registered.length || registered.some((command) => !host.commands.has(command))) {
            rejectStart(new Error("扩展注册的命令与清单不一致"));
            return;
          }
          ready = true;
          clearTimeout(timer);
          resolve(host);
        }
      });
      child.on("error", rejectStart);
      child.on("exit", (code) => {
        clearTimeout(timer);
        host.lifetime.abort();
        if (!ready) return rejectStart(new Error(stderr.trim() || `扩展进程退出（${code ?? "?"}）`));
        if (this.hosts.get(id) === host) {
          this.hosts.delete(id);
          void this.d.plugins.markFailed(id, stderr.trim() || `扩展进程意外退出（${code ?? "?"}）`);
        }
      });
      child.once("disconnect", () => host.lifetime.abort());
    }).catch((e: unknown) => {
      this.stopHost(id, host);
      throw e;
    });
  }

  private stopHost(id: string, host: Host): void {
    if (this.hosts.get(id) === host) this.hosts.delete(id);
    host.lifetime.abort();
    host.child.kill();
  }
}
