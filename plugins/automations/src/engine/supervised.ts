import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * 监督进程：引擎重启（甚至被强杀）后，Agent CLI 仍在运行并把结果落到文件里，重开后可接管（ACC-AU-06）。
 * 目录布局（每一轮一个目录）：launch.json（输入）、prompt.txt（stdin）、supervisor.json、heartbeat、stdout.jsonl、stderr.log、cancel、exit.json。
 * 监督进程脚本以字符串内嵌（不依赖打包后的文件位置），用 `node` / `ELECTRON_RUN_AS_NODE` 运行。
 */
export const SUPERVISOR_SRC = String.raw`"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const dir = process.argv[2];
const L = JSON.parse(fs.readFileSync(path.join(dir, "launch.json"), "utf8"));
const put = (f, o) => { const t = path.join(dir, f + "." + process.pid + ".tmp"); fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, path.join(dir, f)); };
const beat = () => { try { const n = new Date(); fs.utimesSync(path.join(dir, "heartbeat"), n, n); } catch (e) {} };
fs.writeFileSync(path.join(dir, "heartbeat"), "");
const out = fs.openSync(path.join(dir, "stdout.jsonl"), "a");
const err = fs.openSync(path.join(dir, "stderr.log"), "a");
const input = L.stdinFile ? fs.openSync(path.join(dir, L.stdinFile), "r") : "ignore";
let done = false, timedOut = false, cancelled = false, child = null;
const finish = (o) => { if (done) return; done = true; put("exit.json", Object.assign({ finishedAt: new Date().toISOString(), timedOut, cancelled }, o)); process.exit(0); };
const killTree = () => {
  if (!child || !child.pid) return;
  try { if (process.platform === "win32") cp.spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }); else process.kill(-child.pid, "SIGKILL"); } catch (e) { try { child.kill("SIGKILL"); } catch (e2) {} }
};
const childEnv = Object.assign({}, process.env, L.env || {});
if (!(L.env && L.env.ELECTRON_RUN_AS_NODE)) delete childEnv.ELECTRON_RUN_AS_NODE; // 这是给监督进程自己用的，不能漏给 CLI
try {
  child = cp.spawn(L.exe, L.args, { cwd: L.cwd, env: childEnv, stdio: [input, out, err], shell: false, windowsHide: true, detached: process.platform !== "win32" });
} catch (e) { finish({ code: null, signal: null, error: String(e && e.message || e) }); }
child.on("error", (e) => finish({ code: null, signal: null, error: String(e && e.message || e) }));
child.on("exit", (code, signal) => finish({ code, signal }));
put("supervisor.json", { supervisorPid: process.pid, workerPid: child.pid || null, startedAt: new Date().toISOString() });
setInterval(beat, 2000);
setInterval(() => { if (fs.existsSync(path.join(dir, "cancel"))) { cancelled = true; killTree(); } }, 500);
if (L.timeoutMs > 0) setTimeout(() => { timedOut = true; killTree(); }, L.timeoutMs);
`;

export interface LaunchSpec { exe: string; args: string[]; env?: Record<string, string>; cwd: string; timeoutMs: number; stdin?: string; extra?: Record<string, unknown> }
export interface ExitInfo { code: number | null; signal: string | null; finishedAt: string; timedOut?: boolean; cancelled?: boolean; error?: string }
export interface SupervisorInfo { supervisorPid: number; workerPid: number | null; startedAt: string }
export type WaitResult = { kind: "exited"; exit: ExitInfo } | { kind: "stopped" } | { kind: "lost"; reason: string };

const HEARTBEAT_FRESH_MS = 8000;
const STALE_GRACE_MS = 8000;

function readJson<T>(file: string): T | null {
  try { return JSON.parse(readFileSync(file, "utf8")) as T; } catch { return null; } // 半写或不存在都按“还没有”处理
}

export const readExit = (dir: string): ExitInfo | null => readJson<ExitInfo>(path.join(dir, "exit.json"));
export const readSupervisor = (dir: string): SupervisorInfo | null => readJson<SupervisorInfo>(path.join(dir, "supervisor.json"));

/** 监督进程是否仍然存活：心跳新鲜 + pid 存在。只看 pid 会被复用的 pid 骗过去。 */
export function supervisorAlive(dir: string, now = Date.now()): boolean {
  const s = readSupervisor(dir);
  if (!s) return false;
  try {
    if (now - statSync(path.join(dir, "heartbeat")).mtimeMs > HEARTBEAT_FRESH_MS) return false;
    process.kill(s.supervisorPid, 0);
    return true;
  } catch {
    return false;
  }
}

const pidExists = (pid: number | null | undefined): boolean => {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; } // EPERM = 别的用户的进程，不是我们启动的
};

/**
 * 这一轮是否还有进程在跑：监督进程心跳正常，或记录的 CLI 进程还在（监督进程被杀后 CLI 会成为孤儿继续运行）。
 * 只看 pid 可能被复用而误判“还在跑”：宁可拒绝重试，也不并发启动第二个 CLI。
 */
export function roundActive(dir: string): boolean {
  const s = readSupervisor(dir);
  if (!s || readExit(dir)) return false;
  return supervisorAlive(dir) || pidExists(s.workerPid);
}

/** 启动监督进程并立即返回（它脱离引擎独立运行）。提示词写入文件走 stdin，不进 argv。 */
export function launchSupervised(dir: string, spec: LaunchSpec, nodeBin: string = process.env["HUHU_NODE_BIN"] || process.execPath): void {
  mkdirSync(dir, { recursive: true });
  const script = path.join(path.dirname(dir), "_supervisor.cjs");
  try { if (readFileSync(script, "utf8") !== SUPERVISOR_SRC) throw new Error("stale"); } catch { const tmp = `${script}.${process.pid}.tmp`; writeFileSync(tmp, SUPERVISOR_SRC); renameSync(tmp, script); }
  if (spec.stdin !== undefined) writeFileSync(path.join(dir, "prompt.txt"), spec.stdin);
  writeFileSync(path.join(dir, "launch.json"), JSON.stringify({ ...spec.extra, exe: spec.exe, args: spec.args, env: spec.env ?? {}, cwd: spec.cwd, timeoutMs: spec.timeoutMs, ...(spec.stdin !== undefined ? { stdinFile: "prompt.txt" } : {}) }));
  const p = spawn(nodeBin, [script, dir], { detached: process.platform !== "win32", stdio: "ignore", windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
  p.once("error", () => undefined); // 启动失败由 waitExit 的握手超时报告
  p.unref();
}

/** 请求取消：监督进程自己结束 CLI 进程树；调用方在宽限期后可用 forceKill。 */
export function requestCancel(dir: string): void {
  try { writeFileSync(path.join(dir, "cancel"), ""); } catch { /* 目录不存在：没有可取消的进程 */ }
}

export function forceKill(dir: string): void {
  const s = readSupervisor(dir);
  if (!s) return;
  // 监督进程还在 → 两个都杀；监督进程已死（心跳过期）→ 只在记录较新时杀孤儿 CLI 的进程组，避免 pid 被复用后误杀
  const fresh = Date.now() - Date.parse(s.startedAt) < 24 * 3600_000;
  if (!supervisorAlive(dir) && !fresh) return;
  for (const pid of supervisorAlive(dir) ? [s.workerPid, s.supervisorPid] : [s.workerPid]) {
    if (!pid) continue;
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
      else process.kill(-pid, "SIGKILL");
    } catch { /* 已退出 */ }
  }
}

/** 强行终止一轮（含孤儿 CLI），并补写 cancelled 的 exit.json：之后 roundActive 为 false，不会因 pid 被复用而永远拒绝重试。 */
export function killRound(dir: string): void {
  requestCancel(dir);
  forceKill(dir);
  if (!readExit(dir)) {
    try { const t = path.join(dir, `exit.json.${process.pid}.tmp`); writeFileSync(t, JSON.stringify({ code: null, signal: "SIGKILL", cancelled: true, finishedAt: new Date().toISOString() })); renameSync(t, path.join(dir, "exit.json")); } catch { /* 目录已不存在 */ }
  }
}

export interface WaitOptions {
  /** 只停止等待（引擎关闭/停用）：不杀进程，下次启动对账接管。 */
  stopWaiting?: AbortSignal;
  /** 取消运行：请求监督进程结束 CLI；宽限期内没退出则强杀。 */
  cancel?: AbortSignal;
  pollMs?: number;
  handshakeMs?: number;
  cancelGraceMs?: number;
}

export async function waitExit(dir: string, o: WaitOptions = {}): Promise<WaitResult> {
  const poll = o.pollMs ?? 300;
  const t0 = Date.now();
  let cancelAt: number | null = null;
  let staleSince: number | null = null;
  for (;;) {
    const exit = readExit(dir);
    if (exit) return { kind: "exited", exit };
    if (o.cancel?.aborted && cancelAt === null) { requestCancel(dir); cancelAt = Date.now(); }
    if (cancelAt !== null && Date.now() - cancelAt > (o.cancelGraceMs ?? 5000)) { forceKill(dir); const e = readExit(dir); return e ? { kind: "exited", exit: e } : { kind: "exited", exit: { code: null, signal: "SIGKILL", cancelled: true, finishedAt: new Date().toISOString() } }; }
    if (o.stopWaiting?.aborted) return { kind: "stopped" };
    const sup = readSupervisor(dir);
    if (!sup) {
      if (Date.now() - t0 > (o.handshakeMs ?? 10_000)) return { kind: "lost", reason: "监督进程没有启动" };
    } else if (!supervisorAlive(dir)) {
      const again = readExit(dir); // 它刚好写完 exit.json 然后退出
      if (again) return { kind: "exited", exit: again };
      if (cancelAt !== null) { forceKill(dir); return { kind: "exited", exit: { code: null, signal: "SIGKILL", cancelled: true, finishedAt: new Date().toISOString() } }; } // 取消时监督进程已死：没人会读 cancel 文件，直接强杀孤儿 CLI
      // 进程还在但心跳过期（机器睡眠后唤醒）：多给几个心跳周期；进程已经不在就直接判定
      staleSince ??= Date.now();
      if (!pidExists(sup.supervisorPid) || Date.now() - staleSince > STALE_GRACE_MS) {
        const last = readExit(dir);
        if (last) return { kind: "exited", exit: last };
        return { kind: "lost", reason: pidExists(sup.workerPid) ? "监督进程已不存在，但 CLI 进程可能仍在运行；结果无法确认" : "监督进程已不存在，结果无法确认" };
      }
    } else staleSince = null;
    await new Promise((r) => setTimeout(r, poll));
  }
}

export const hasRunDir = (dir: string): boolean => existsSync(path.join(dir, "launch.json"));
