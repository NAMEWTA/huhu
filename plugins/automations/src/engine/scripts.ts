import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors, newId } from "@huhu/contracts";

export interface ScriptDef {
  id: string;
  title: string;
  program: string;
  args: string[];
  cwd: string;
  /** 环境变量名 → 保险箱引用 `safe://<itemId>`。 */
  envRefs: Record<string, string>;
  timeoutSec: number;
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 预配置脚本：`.huhu/automations/scripts.json`。 */
export class ScriptStore {
  constructor(private readonly file: string) {}

  list(): ScriptDef[] {
    if (!existsSync(this.file)) return [];
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as ScriptDef[];
    } catch {
      throw new Error("scripts.json 无法解析，请修复或删除后重试"); // 不静默清空
    }
  }

  get(id: string): ScriptDef {
    const s = this.list().find((x) => x.id === id);
    if (!s) throw errors.notFound(`脚本 ${id} 不存在`);
    return s;
  }

  save(input: Omit<ScriptDef, "id"> & { id?: string | undefined }): ScriptDef {
    if (!input.title.trim()) throw errors.invalidInput("脚本名称必填");
    if (!path.isAbsolute(input.program)) throw errors.invalidInput("程序路径必须是绝对路径");
    if (!path.isAbsolute(input.cwd) || !existsSync(input.cwd)) throw errors.invalidInput("工作目录必须是存在的绝对路径");
    for (const [k, v] of Object.entries(input.envRefs)) {
      if (!ENV_NAME.test(k)) throw errors.invalidInput(`环境变量名无效：${k}`);
      if (!/^safe:\/\/item-[0-9a-z]+$/.test(v)) throw errors.invalidInput(`环境变量 ${k} 必须引用保险箱条目（safe://…）`);
    }
    if (!Number.isInteger(input.timeoutSec) || input.timeoutSec < 1 || input.timeoutSec > 3600) throw errors.invalidInput("超时 1–3600 秒");
    const all = this.list();
    const def: ScriptDef = { ...input, id: input.id ?? newId("script"), title: input.title.trim() };
    const next = input.id ? all.map((s) => (s.id === input.id ? def : s)) : [...all, def];
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(next, null, 2));
    return def;
  }

  delete(id: string): void {
    this.get(id);
    writeFileSync(this.file, JSON.stringify(this.list().filter((s) => s.id !== id), null, 2));
  }
}

/** 终止整个进程树：Unix 杀进程组（子进程持有管道时，只杀 shell 会让 close 迟迟不来），Windows 用 taskkill /T。 */
export function killTree(p: ChildProcess): void {
  if (!p.pid) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true });
    else process.kill(-p.pid, "SIGKILL");
  } catch {
    p.kill("SIGKILL"); // 进程组已不存在
  }
}

export interface ScriptResult { state: "succeeded" | "failed" | "cancelled"; exitCode: number | null; output: string }

/**
 * 运行脚本：参数作为独立 argv（shell:false，ACC-AU-11），环境变量由保险箱引用解析（锁定时 SAFE_LOCKED），
 * 输出只保留最后 200 行，超时即终止。
 */
export function runScript(def: ScriptDef, extraArgs: string[], resolveSecret: (ref: string) => string, signal?: AbortSignal): Promise<ScriptResult> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const secrets: string[] = [];
  for (const [k, ref] of Object.entries(def.envRefs)) {
    const v = resolveSecret(ref); // 抛 SAFE_LOCKED / SECRET_REF_INVALID
    env[k] = v;
    if (v.length >= 4) secrets.push(v);
  }
  /** 输出会写进 Vault（并可能被同步），所以脚本回显的秘密值必须先抹掉。 */
  const redact = (text: string) => secrets.reduce((t, s) => t.split(s).join("***"), text);
  return new Promise((resolve) => {
    let out = "";
    const p = spawn(def.program, [...def.args, ...extraArgs], { cwd: def.cwd, env, shell: false, windowsHide: true, detached: process.platform !== "win32" });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(p); }, def.timeoutSec * 1000);
    signal?.addEventListener("abort", () => killTree(p), { once: true });
    const tail = () => redact(out).split("\n").slice(-200).join("\n");
    const MAX = 2 * 1024 * 1024; // 内存里只保留最近 2 MiB，持续输出的进程不会占满内存
    const add = (b: Buffer) => { out += b; if (out.length > MAX) out = out.slice(-MAX); };
    p.stdout.on("data", add);
    p.stderr.on("data", add);
    p.once("error", (e) => { clearTimeout(timer); resolve({ state: "failed", exitCode: null, output: `${e.message}\n${tail()}`.trim() }); });
    p.once("close", (code, sig) => {
      clearTimeout(timer);
      if (timedOut) return resolve({ state: "failed", exitCode: code, output: `${tail()}\n[超时 ${def.timeoutSec} 秒，已终止]`.trim() });
      resolve({ state: sig ? "cancelled" : code === 0 ? "succeeded" : "failed", exitCode: code, output: tail() });
    });
  });
}

export function secretErrorToNotice(e: unknown): string {
  return e instanceof HuhuError ? `${e.code}：${e.message}` : e instanceof Error ? e.message : String(e);
}
