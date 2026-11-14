import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RunOutcome, WorkerInput } from "./service.js";
import { launchSupervised, waitExit, type ExitInfo } from "./supervised.js";

/** 回执块：最后一条消息里的 ```agent-autoloop 围栏，内容为 JSON `{ask:[{id,text,options}], notice}`。 */
export function parseReceipt(message: string): { questions: RunOutcome["questions"]; notice: string | null } {
  const m = /```agent-autoloop\s*\n([\s\S]*?)```/.exec(message);
  if (!m) return { questions: [], notice: null };
  try {
    const j = JSON.parse(m[1] ?? "{}") as { ask?: { id?: string; text: string; options?: string[] }[]; notice?: string };
    return { questions: (j.ask ?? []).map((q, i) => ({ id: q.id ?? `q-${i + 1}`, text: q.text, options: q.options ?? [] })), notice: j.notice ?? null };
  } catch {
    return { questions: [], notice: null };
  }
}

const RECEIPT_HINT = ['完成后在最后一条消息中给出结果。如需向用户提问，请在消息末尾附一个 ```agent-autoloop 围栏，内容为 JSON：{"ask":[{"id":"q-1","text":"问题","options":["选项"]}]}；', '如只需附带说明，使用 {"notice":"说明"}。'];

/**
 * 构造提示词（spec §3.5）：第一条写明 Vault 绝对路径、快照文件路径与格式约定；自动化规则的补充指令附在其后。
 * Agent 通过 Vault 绝对路径自行读取被引用的文件，这里不内联文件内容，也不做容量裁剪。
 */
export function buildPrompt(i: { vaultRoot: string; snapshotFile: string; instruction?: string | undefined }): string {
  return [
    `Vault 的绝对路径：${i.vaultRoot}`,
    `任务快照文件：${i.snapshotFile}（这是本次运行开始时的任务文件完整副本，请读取它）。`,
    "格式约定：`<task>` 区段是本次要完成的要求；`<comments>` 区段是讨论历史，每条评论带 `source`（human / agent / system / external）；`[[路径]]` 是相对于 Vault 根目录的引用，需要时用上面的 Vault 绝对路径自行读取。",
    ...RECEIPT_HINT,
    ...(i.instruction?.trim() ? ["", "补充指令：", i.instruction.trim()] : []),
  ].join("\n");
}

/** 一次性提示词（agent 动作的 prompt 输入）：同样写明 Vault 绝对路径，再给出规则正文。 */
export function buildRulePrompt(vaultRoot: string, prompt: string): string {
  return [`Vault 的绝对路径：${vaultRoot}`, ...RECEIPT_HINT, "", prompt.trim()].join("\n");
}

/** 把整份任务文件原样复制到运行目录，作为本次输入快照（替代旧的 context.md）；返回快照路径。 */
export function writeSnapshot(runDir: string, text: string): string {
  mkdirSync(runDir, { recursive: true });
  const file = path.join(runDir, "task-snapshot.md");
  writeFileSync(file, text);
  return file;
}

/** 原生会话 id 会进 argv：只接受字母数字、点、下划线、连字符，且不能以 - 开头。 */
export const isSafeId = (v: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
const isSafeRunId = (v: string): boolean => /^[A-Za-z0-9_-]{1,128}$/.test(v);

/** 从 CLI 的结构化输出里取最终消息与原生会话 id；解析不了就把原文当作消息。 */
export function parseOutput(provider: string, text: string): { message: string; nativeSessionId: string | null; isError: boolean } {
  let message = "";
  let sid: string | null = null;
  let isError = false;
  let parsed = false;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    let j: Record<string, unknown>;
    try {
      j = JSON.parse(t) as Record<string, unknown>;
    } catch {
      continue;
    }
    parsed = true;
    if (provider === "claude") {
      if (typeof j["session_id"] === "string") sid = j["session_id"];
      if (j["type"] === "result") {
        if (typeof j["result"] === "string") message = j["result"];
        isError = j["is_error"] === true;
      }
    } else {
      if (j["type"] === "thread.started" && typeof j["thread_id"] === "string") sid = j["thread_id"];
      const item = j["item"] as { type?: string; text?: string } | undefined;
      if (j["type"] === "item.completed" && item?.type === "agent_message" && typeof item.text === "string") message = item.text;
      if (j["type"] === "error" || j["type"] === "turn.failed") isError = true;
    }
  }
  return parsed ? { message: message.trim(), nativeSessionId: sid && isSafeId(sid) ? sid : null, isError } : { message: text.trim(), nativeSessionId: null, isError: false };
}

const tail = (file: string, lines: number): string => {
  try {
    return readFileSync(file, "utf8").split("\n").slice(-lines).join("\n").trim();
  } catch {
    return "";
  }
};

/** 把一轮运行的落盘结果（exit.json + stdout.jsonl）解释成结果。启动运行和重启后接管共用，保证两条路径结论一致。 */
export function finalizeRound(dir: string, provider: string, exit: ExitInfo, knownSession: string | null): RunOutcome {
  const fail = (message: string, state: RunOutcome["state"] = "failed"): RunOutcome => ({ state, message, exitCode: exit.code, nativeSessionId: knownSession, questions: [] });
  if (exit.cancelled) return fail("已取消", "cancelled");
  if (exit.timedOut) return fail("运行超时，已终止");
  if (exit.error) return fail(exit.error);
  let raw = "";
  try {
    raw = readFileSync(path.join(dir, "stdout.jsonl"), "utf8");
  } catch {
    /* 没有输出 */
  }
  const out = parseOutput(provider, raw);
  const sid = out.nativeSessionId ?? knownSession;
  const receipt = parseReceipt(out.message);
  if (receipt.questions.length > 0 && exit.code === 0) return { state: "waiting_input", message: out.message, exitCode: exit.code, nativeSessionId: sid, questions: receipt.questions };
  if (exit.code === 0 && out.message && !out.isError) return { state: "succeeded", message: out.message, exitCode: 0, nativeSessionId: sid, questions: [] };
  return { state: "failed", message: `${out.message}\n\n${tail(path.join(dir, "stderr.log"), 50)}`.trim() || "运行失败", exitCode: exit.code, nativeSessionId: sid, questions: [] };
}

/** 智能体启动合成（agent-cli 的 resolveAgentLaunch）：交互、headless 共用同一份设置，默认完全访问。 */
export type ResolveLaunch = (input: {
  agentId: string;
  mode: "headless";
  model?: string | undefined;
  effort?: string | undefined;
  fast?: boolean | undefined;
  prompt?: string | undefined;
  sessionId?: string | undefined;
  resume?: string | undefined;
}) => Promise<{ command: string; argv: string[]; env: Record<string, string>; stdin?: string; warnings: string[] }>;

export interface ProcessWorkerDeps {
  runsDir: string;
  resolveLaunch: ResolveLaunch;
  timeoutMs?: number;
}

export interface AdoptInput {
  runId: string;
  provider: string;
  round: number;
  stopWaiting?: AbortSignal;
  signal: AbortSignal;
}
export interface ProcessWorker {
  run(i: WorkerInput): Promise<RunOutcome | null>;
  /** 引擎重启后接管上次遗留的运行：结果已落盘 → 直接解释；监督进程仍在 → 等它结束；都没有 → unknown。null = 停止等待（运行继续）。 */
  adopt(i: AdoptInput): Promise<RunOutcome | null>;
}

export const roundDir = (runsDir: string, runId: string, round: number): string => path.join(runsDir, runId, `r${round}`);

/**
 * 默认 worker：在 Space 根目录以无界面模式运行 provider，由独立的监督进程托管（引擎退出后 CLI 继续运行）。
 * 进程参数作为独立 argv（不经 shell），提示词走 stdin；输出落在 runs/<runId>/r<轮次>/。
 */
export function processWorker(d: ProcessWorkerDeps): ProcessWorker {
  const timeoutMs = d.timeoutMs ?? 30 * 60_000;
  const knownSession = (dir: string): string | null => {
    try {
      return (JSON.parse(readFileSync(path.join(dir, "launch.json"), "utf8")) as { nativeSessionId?: string | null }).nativeSessionId ?? null;
    } catch {
      return null;
    }
  };
  const settle = async (dir: string, provider: string, opts: { stopWaiting: AbortSignal | undefined; signal: AbortSignal; handshakeMs?: number }): Promise<RunOutcome | null> => {
    const r = await waitExit(dir, { ...(opts.stopWaiting ? { stopWaiting: opts.stopWaiting } : {}), cancel: opts.signal, ...(opts.handshakeMs !== undefined ? { handshakeMs: opts.handshakeMs } : {}) });
    if (r.kind === "stopped") return null;
    if (r.kind === "lost") return { state: "unknown", message: r.reason, exitCode: null, nativeSessionId: knownSession(dir), questions: [] };
    return finalizeRound(dir, provider, r.exit, knownSession(dir));
  };
  return {
    async run(i) {
      const fail = (message: string): RunOutcome => ({ state: "failed", message, exitCode: null, nativeSessionId: null, questions: [] });
      if (!isSafeRunId(i.runId)) return fail("非法的运行 id");
      const round = i.round ?? 1;
      const dir = roundDir(d.runsDir, i.runId, round);
      let prompt: string;
      if (i.resume) prompt = i.resume.prompt;
      else if (i.snapshotText !== undefined) prompt = buildPrompt({ vaultRoot: i.vaultRoot, snapshotFile: writeSnapshot(path.join(d.runsDir, i.runId), i.snapshotText), instruction: i.instruction });
      else prompt = buildRulePrompt(i.vaultRoot, i.task.body);
      // 新会话由 HUHU 指定会话 id（claude）；codex 的会话 id 从输出里读
      const sessionId = i.resume ? undefined : i.provider === "claude" ? randomUUID() : undefined;
      let r: Awaited<ReturnType<ResolveLaunch>>;
      try {
        r = await d.resolveLaunch({ agentId: i.provider, mode: "headless", model: i.model ?? undefined, effort: i.effort ?? undefined, fast: i.fast || undefined, prompt, sessionId, resume: i.resume?.nativeSessionId });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
      if (existsSync(path.join(dir, "launch.json"))) return fail("这一轮已经启动过"); // 一轮只启动一次，防止重复启动第二个进程
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ provider: i.provider, round }));
      launchSupervised(dir, {
        exe: r.command,
        args: r.argv,
        ...(Object.keys(r.env).length ? { env: r.env } : {}),
        cwd: i.cwd,
        timeoutMs,
        stdin: r.stdin ?? prompt,
        extra: { nativeSessionId: i.resume?.nativeSessionId ?? sessionId ?? null },
      });
      return settle(dir, i.provider, { stopWaiting: i.stopWaiting, signal: i.signal });
    },
    adopt: (i) => (isSafeRunId(i.runId) ? settle(roundDir(d.runsDir, i.runId, i.round), i.provider, { stopWaiting: i.stopWaiting, signal: i.signal, handshakeMs: 0 }) : Promise.resolve(null)),
  };
}
