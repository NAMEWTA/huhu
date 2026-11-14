import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { errors, PluginManifestSchema, type PluginManifest } from "@huhu/contracts";
import { unzipSync } from "fflate";
import type { PluginManager } from "../plugin-manager.js";
import { BUILTIN_ONLY_PERMISSIONS, PERMISSION_TABLE } from "../permissions.js";
import type { TokenTable } from "../server/tokens.js";
import { PLUGIN_HOST_SCRIPT } from "./host-script.js";

const MAX_FILES = 300;
const MAX_BYTES = 8 * 1024 * 1024;
const READY_TIMEOUT_MS = 15_000;
const RUN_TIMEOUT_MS = 60_000;

interface Record_ {
  version: string;
  enabled: boolean;
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
  tokens: TokenTable;
  /** Engine HTTP 基址（服务启动后才知道端口）。 */
  baseUrl(): string;
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

/** 外部扩展：安装 / 卸载 / 独立宿主进程 / 命令。授权仍由 Dispatcher 按 `plugin:<id>` 令牌判定。 */
export class ExternalPlugins {
  private readonly hosts = new Map<string, { child: ChildProcess; commands: Map<string, string>; pending: Map<string, (r: { ok: boolean; result?: unknown; error?: string }) => void> }>();
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
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
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
      if (this.builtinIds.has(manifest.id) || (this.d.plugins.has(manifest.id) && !this.has(manifest.id))) reject(`id 与内置插件冲突：${manifest.id}`);
      const bad = manifest.permissions.filter((p) => !(p in PERMISSION_TABLE) || BUILTIN_ONLY_PERMISSIONS.has(p));
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
        this.register(info);
      } catch {
        // 包损坏：不登记，插件中心不显示；用户可重新安装
      }
    }
  }

  private register(info: ExternalInfo): void {
    const { manifest, main } = info;
    const dir = this.pkgDir(manifest.id, manifest.version);
    this.d.plugins.register({
      manifest,
      apply: async (ctx) => {
        const handle = await this.spawnHost(manifest.id, dir, main);
        ctx.effect(() => () => this.stopHost(manifest.id, handle));
      },
    });
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
        this.writeJson(this.recordFile, { ...this.records(), [id]: { version: info.manifest.version, enabled: true } });
        this.writeJson(this.trustFile, { ...this.trusted(), [id]: this.trustKey(id, info.manifest.version) });
        this.register(this.inspect(target));
        const state = await this.d.plugins.enable(id);
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
    return [...this.hosts.entries()].flatMap(([pluginId, h]) => [...h.commands.entries()].map(([id, title]) => ({ pluginId, id, title })));
  }

  runCommand(pluginId: string, commandId: string, args: unknown = {}): Promise<unknown> {
    const h = this.hosts.get(pluginId);
    if (!h || !h.commands.has(commandId)) throw errors.notFound(`命令不存在：${pluginId}/${commandId}`);
    if (h.pending.size >= 8) throw errors.invalidInput("这个扩展正在执行的命令过多");
    const reqId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject2) => {
      const timer = setTimeout(() => {
        h.pending.delete(reqId);
        reject2(errors.invalidInput("命令执行超时"));
      }, RUN_TIMEOUT_MS);
      h.pending.set(reqId, (r) => {
        clearTimeout(timer);
        if (r.ok) resolve(r.result);
        else reject2(errors.invalidInput(r.error ?? "命令执行失败"));
      });
      h.child.send({ type: "run", reqId, id: commandId, args });
    });
  }

  private spawnHost(id: string, dir: string, main: string): Promise<ChildProcess> {
    mkdirSync(this.dataDir(id), { recursive: true });
    const caller = `plugin:${id}` as const;
    const token = this.d.tokens.issue(caller);
    const nodeBin = this.d.nodeBin ?? (process.env["HUHU_NODE_BIN"] || process.execPath);
    const child = spawn(nodeBin, ["--input-type=module", "-e", PLUGIN_HOST_SCRIPT, "--", dir, main, this.d.baseUrl(), token, this.dataDir(id)], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      windowsHide: true,
      env: hostEnv(),
    });
    const host = { child, commands: new Map<string, string>(), pending: new Map<string, (r: { ok: boolean; result?: unknown; error?: string }) => void>() };
    this.hosts.set(id, host);
    let stderr = "";
    child.stderr?.on("data", (d) => (stderr = (stderr + String(d)).slice(-2000)));
    return new Promise<ChildProcess>((resolve, rejectStart) => {
      let ready = false;
      const timer = setTimeout(() => {
        child.kill();
        rejectStart(new Error("扩展启动超时"));
      }, READY_TIMEOUT_MS);
      child.on("message", (m: { type?: string; id?: string; title?: string; reqId?: string; ok?: boolean; result?: unknown; error?: string }) => {
        if (m.type === "command" && m.id) host.commands.set(m.id, m.title ?? m.id);
        else if (m.type === "ready") {
          ready = true;
          clearTimeout(timer);
          resolve(child);
        } else if (m.type === "failed") {
          clearTimeout(timer);
          rejectStart(new Error(m.error ?? "扩展启动失败"));
        } else if (m.type === "result" && m.reqId) {
          const cb = host.pending.get(m.reqId);
          host.pending.delete(m.reqId);
          cb?.({ ok: m.ok === true, result: m.result, ...(m.error !== undefined ? { error: m.error } : {}) });
        }
      });
      child.on("error", (e) => {
        clearTimeout(timer);
        rejectStart(e);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        for (const cb of host.pending.values()) cb({ ok: false, error: "扩展进程已退出" });
        host.pending.clear();
        if (!ready) return rejectStart(new Error(stderr.trim() || `扩展进程退出（${code ?? "?"}）`));
        // 运行中崩溃：只影响这个扩展，Engine 继续运行
        if (this.hosts.get(id) === host) {
          this.hosts.delete(id);
          this.d.tokens.revokeCaller(caller);
          void this.d.plugins.markFailed(id, stderr.trim() || `扩展进程意外退出（${code ?? "?"}）`);
        }
      });
    }).catch((e: unknown) => {
      this.stopHost(id, child);
      throw e;
    });
  }

  private stopHost(id: string, child: ChildProcess): void {
    const h = this.hosts.get(id);
    if (h?.child === child) this.hosts.delete(id);
    this.d.tokens.revokeCaller(`plugin:${id}`);
    try {
      child.kill();
    } catch {
      // 已退出
    }
  }
}
