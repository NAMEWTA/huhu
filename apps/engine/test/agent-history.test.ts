import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AgentDetector, HerdrCore, SessionsService } from "@huhu/plugin-agent-cli/engine";
import * as kernel from "@huhu/kernel";
import { assert, expect, test, vi } from "vitest";
import type { HerdrClient } from "../../../packages/herdr-client/src/index.js";
import type { LaunchInput, SessionRecord } from "../../../plugins/agent-cli/src/engine/sessions.js";
import { createFixtureGate } from "../../../plugins/agent-cli/test/fixtures/dispatch-provider.js";
import { boot, type RunningEngine } from "../src/boot.js";

const claudeId = "79fc8333-8db7-463a-a6d6-02fbb2216496";
const codexId = "01998fe4-0316-7140-97c3-74965ba41745";
const codexChild = "01998fe4-0316-7140-97c3-74965ba41746";
const rollout = (id: string) => `rollout-2026-11-21T10-00-00-${id}.jsonl`;
const row = (value: object) => JSON.stringify(value) + "\n";

test.skipIf(process.platform === "win32")(
  "Claude 与具名 Codex shim 从公开入口恢复原会话、在原目录创建独立分支并按原布局意图重查",
  async () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-agent-history-engine-")));
    const vault = path.join(root, "vault");
    const work = path.join(vault, "project");
    const claudeProfile = path.join(root, "Claude data");
    const codexProfile = path.join(root, "Codex data");
    const bucket = path.join(claudeProfile, "projects", work.replace(/[^a-zA-Z0-9]/g, "-"));
    const sessions = path.join(codexProfile, "sessions", "2026", "11", "21");
    for (const dir of [work, bucket, sessions]) mkdirSync(dir, { recursive: true });
    const claudeSource = path.join(bucket, claudeId + ".jsonl");
    const codexSource = path.join(sessions, rollout(codexId));
    const codexChildPath = path.join(sessions, rollout(codexChild));
    writeFileSync(claudeSource, row({ type: "user", cwd: work, message: { role: "user", content: "Claude source" } }));
    writeFileSync(codexSource, row({ type: "session_meta", payload: { id: codexId, cwd: work } }));
    const parent = readFileSync(codexSource);
    const cli = (name: string) => path.join(root, name + ".cjs");
    writeFileSync(
      cli("claude"),
      `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const output = (text) => fs.writeSync(1, text + "\\n");
if (args[0] === "--version") output("2.1.211 (Claude Code)");
else if (args[0] === "--help") output("  -r, --resume [id]\\n  --fork-session\\n  --session-id <uuid>");
else if (args.includes("--fork-session")) {
  const bucket = path.join(process.env.CLAUDE_CONFIG_DIR, "projects", process.cwd().replace(/[^a-zA-Z0-9]/g, "-"));
  fs.copyFileSync(path.join(bucket, args[args.indexOf("--resume") + 1] + ".jsonl"), path.join(bucket, args[args.indexOf("--session-id") + 1] + ".jsonl"), fs.constants.COPYFILE_EXCL);
}
`,
      { mode: 0o755 },
    );
    const rpcLog = path.join(root, "codex-rpc.jsonl");
    const wrongSourceMarker = path.join(root, "wrong-source");
    const shim = path.join(root, "volta-shim.cjs");
    writeFileSync(
      shim,
      `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const output = (text) => fs.writeSync(1, text + "\\n");
if (path.basename(process.argv[1]) !== "codex.cjs") {
  fs.writeSync(2, "volta-shim should not be called directly\\n");
  process.exit(126);
}
if (args[0] === "--version") output("codex-cli 0.170.0");
else if (args[1] === "--help") output(args[0] === "resume" ? "Usage: codex resume [SESSION_ID]" : "  --listen <URL>");
else if (args[0] === "app-server") {
  if (process.env.CODEX_HOME !== ${JSON.stringify(codexProfile)} || process.cwd() !== ${JSON.stringify(work)}) process.exit(10);
  const handle = (line) => {
    const request = JSON.parse(line);
    fs.appendFileSync(${JSON.stringify(rpcLog)}, line + "\\n");
    let result;
    if (request.method === "initialize") result = {};
    if (request.method === "thread/read" && request.params.threadId === ${JSON.stringify(codexId)}) {
      result = { thread: { id: ${JSON.stringify(codexId)}, cwd: process.cwd(), path: fs.existsSync(${JSON.stringify(wrongSourceMarker)}) ? ${JSON.stringify(claudeSource)} : ${JSON.stringify(codexSource)} } };
    }
    if (request.method === "thread/fork" && request.params.path === ${JSON.stringify(codexSource)} && request.params.deferGoalContinuation && request.params.ephemeral === false) {
      fs.writeFileSync(${JSON.stringify(codexChildPath)}, JSON.stringify({ type: "session_meta", payload: { id: ${JSON.stringify(codexChild)}, cwd: process.cwd() } }) + "\\n", { flag: "wx" });
      result = { thread: { id: ${JSON.stringify(codexChild)}, forkedFromId: ${JSON.stringify(codexId)}, cwd: process.cwd(), path: ${JSON.stringify(codexChildPath)} } };
    }
    if (request.id) output(JSON.stringify(result ? { id: request.id, result } : { id: request.id, error: { message: "unexpected" } }));
  };
  const chunk = Buffer.alloc(4096);
  let remaining = "";
  for (let length; (length = fs.readSync(0, chunk));) {
    const lines = (remaining + chunk.toString("utf8", 0, length)).split("\\n");
    remaining = lines.pop();
    for (const line of lines) handle(line);
  }
} else if (args[0] === "resume") {
  if (process.env.CODEX_HOME !== ${JSON.stringify(codexProfile)} || process.cwd() !== ${JSON.stringify(work)}) process.exit(10);
  fs.appendFileSync(${JSON.stringify(rpcLog)}, JSON.stringify({ method: "cli/resume", id: args[1] }) + "\\n");
}
`,
      { mode: 0o755 },
    );

    symlinkSync(shim, cli("codex"));

    type Run = { argv: string[]; cwd: string; env: NodeJS.ProcessEnv; labels: Record<string, string> };
    const terminals: (Run & { address: string; pid: number; created_ms: number; state: string; finished_ms: number | null; exit_code: number | null; stderr: string })[] = [];
    let document = { version: 0, value: null as unknown };
    let delayForkReceipt = false;
    let forkReceipt: string | undefined;
    const rpc = vi.fn(async (method: string, input: Run & { version: number; value: unknown }) => {
      if (method === "hello") return { core: { id: "isolated-history-core" }, generation: 1 };
      if (method === "terminal.list") return { terminals: terminals.filter((terminal) => Object.entries(input.labels ?? {}).every(([key, value]) => terminal.labels[key] === value)) };
      if (method === "doc.get") return document;
      if (method === "doc.set") {
        expect(input.version).toBe(document.version);
        document = { version: document.version + 1, value: input.value };
        return document;
      }
      if (method !== "terminal.run") throw new Error(`Unexpected Core method ${method}`);
      const address = "t" + (terminals.length + 1);
      const [command, ...args] = input.argv;
      const child = spawn(command!, args, { cwd: input.cwd, env: { ...process.env, ...input.env, HOME: root, HC_TERMINAL_ID: address }, stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.setEncoding("utf8").on("data", (text: string) => {
        stderr += text;
      });
      const exit = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      if (delayForkReceipt && exit === 0 && args[1] === "--history" && args[2]) {
        forkReceipt = path.join(path.dirname(args[2]), "fork.json");
        renameSync(forkReceipt, `${forkReceipt}.delayed`);
        delayForkReceipt = false;
      }
      const now = Date.now();
      const terminal = { ...input, address, pid: child.pid!, created_ms: now - 1, state: exit === 0 ? "live" : "finished", finished_ms: exit === 0 ? null : now, exit_code: exit === 0 ? null : exit, stderr };
      terminals.push(terminal);
      return terminal;
    });
    const client = { call: rpc } as unknown as HerdrClient;
    const listen = vi.spyOn(kernel, "startEngineServer").mockResolvedValue({ port: 0, close: async () => {} } as kernel.RunningServer);
    const ensure = vi.spyOn(HerdrCore.prototype, "ensure").mockResolvedValue(client);
    const peek = vi.spyOn(HerdrCore.prototype, "peek").mockResolvedValue(client);
    let engine: RunningEngine | undefined;
    const call = (capability: string, input: unknown) => engine!.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
    const get = async <T>(capability: string, input: unknown): Promise<T> => {
      const response = await call(capability, input);
      assert(response.ok, JSON.stringify(response));
      return response.data as T;
    };
    try {
      engine = await boot({ vaultPath: vault, create: true });
      const { settings } = await get<{ settings: { revision: number } }>("agent.settings.get", {});
      await get("agent.settings.update", {
        expectedRevision: settings.revision,
        defaultAgent: null,
        agents: {
          claude: { command: cli("claude"), env: { CLAUDE_CONFIG_DIR: claudeProfile } },
          codex: { command: cli("codex"), env: { CODEX_HOME: codexProfile } },
          pi: { enabled: false },
        },
      });
      const [space] = await get<{ id: string; revision: number }[]>("agent.spaces.list", {});
      assert(space);
      const { entries } = await get<{ entries: { provider: "claude" | "codex"; nativeSessionId: string; historyId: string; revision: string; canResume: boolean; canFork: boolean }[] }>("agent.history.list", { spaceId: space.id });
      expect(entries).toHaveLength(2);
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ provider: "claude", nativeSessionId: claudeId, canResume: true, canFork: true }),
          expect.objectContaining({ provider: "codex", nativeSessionId: codexId, canResume: true, canFork: true }),
        ]),
      );
      const select = (provider: "claude" | "codex", action: "resume" | "fork", baseVersion: number) => {
        const entry = entries.find((candidate) => candidate.provider === provider)!;
        return {
          spaceId: space.id,
          spaceRevision: space.revision,
          requestId: randomUUID(),
          provider,
          action,
          nativeSessionId: entry.nativeSessionId,
          historyId: entry.historyId,
          historyRevision: entry.revision,
          baseVersion,
          target: { kind: "tab" },
        };
      };
      writeFileSync(wrongSourceMarker, "");
      await get("agent.history.workspaceLaunch", select("codex", "fork", 0));
      expect(terminals[0]).toMatchObject({ state: "finished", exit_code: 1, stderr: expect.stringContaining("Codex resolved a different history source") });
      expect(readFileSync(rpcLog, "utf8")).not.toContain("thread/fork");
      rmSync(wrongSourceMarker);
      const claudeFork = select("claude", "fork", 1);
      const claude = await get<{ sessionId: string; placement: object }>("agent.history.workspaceLaunch", claudeFork);
      expect(claude.placement).toBeTruthy();
      expect(terminals[1]?.argv.slice(1, 4)).toEqual(["--resume", claudeId, "--fork-session"]);
      const codexFork = select("codex", "fork", 2);
      delayForkReceipt = true;
      const codex = await get<{ sessionId: string; placement: object }>("agent.history.workspaceLaunch", codexFork);
      expect(codex.placement).toBeTruthy();
      assert(forkReceipt);
      const listSessions = () => get<{ id: string; nativeSessionId?: string; cwd: string }[]>("agent.sessions.list", { spaceId: space.id });
      expect((await listSessions()).find(({ id }) => id === codex.sessionId)?.nativeSessionId).toBeUndefined();
      renameSync(`${forkReceipt}.delayed`, forkReceipt);
      const rpcCount = rpc.mock.calls.length;
      expect((await listSessions()).find(({ id }) => id === codex.sessionId)).toMatchObject({ nativeSessionId: codexChild, cwd: work });
      expect(rpc).toHaveBeenCalledTimes(rpcCount);
      const [claudeResume, codexResume] = [select("claude", "resume", 3), select("codex", "resume", 4)];
      const restored: { sessionId: string }[] = [];
      for (const ref of [claudeResume, codexResume]) restored.push(await get<{ sessionId: string }>("agent.history.workspaceLaunch", ref));
      const records = await get<{ id: string; nativeSessionId?: string; cwd: string }[]>("agent.sessions.list", { spaceId: space.id });
      expect(records.find(({ id }) => id === claude.sessionId)).toMatchObject({ nativeSessionId: terminals[1]!.argv.at(-1), cwd: work });
      expect(records.find(({ id }) => id === codex.sessionId)).toMatchObject({ nativeSessionId: codexChild, cwd: work });
      expect(records.find(({ id }) => id === restored[0]?.sessionId)).toMatchObject({ nativeSessionId: claudeId, cwd: work });
      expect(records.find(({ id }) => id === restored[1]?.sessionId)).toMatchObject({ nativeSessionId: codexId, cwd: work });
      expect(terminals.every((terminal) => terminal.cwd === work)).toBe(true);
      expect(readFileSync(codexSource)).toEqual(parent);
      const messages = readFileSync(rpcLog, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { method: string; id?: string });
      expect(messages.filter(({ method }) => method === "thread/fork")).toHaveLength(1);
      expect(messages.filter(({ method }) => method === "cli/resume").map(({ id }) => id)).toEqual([codexChild, codexId]);
      expect(messages.some(({ method }) => method === "turn/start")).toBe(false);
      rmSync(codexSource);
      expect(await get("agent.history.workspaceLaunch", codexFork)).toMatchObject({ sessionId: codex.sessionId });
      expect(await call("agent.history.workspaceLaunch", { ...codexFork, baseVersion: 5 })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(terminals).toHaveLength(5);
    } finally {
      await engine?.shutdown();
      peek.mockRestore();
      ensure.mockRestore();
      listen.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  },
  20_000,
);

type HistoryRow = { nativeSessionId: string; historyId: string; revision: string; title: string };

async function withHistoryFixture(run: (root: string, work: string, other: string, engine: RunningEngine) => Promise<void>) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-history-claims-")));
  const vault = path.join(root, "vault");
  const work = path.join(vault, "work");
  const other = path.join(vault, "other");
  mkdirSync(work, { recursive: true });
  mkdirSync(other, { recursive: true });
  vi.stubEnv("CODEX_HOME", path.join(root, "codex"));
  vi.stubEnv("PI_CODING_AGENT_SESSION_DIR", path.join(root, "pi"));
  const listen = vi.spyOn(kernel, "startEngineServer").mockResolvedValue({ port: 0, close: async () => {} } as kernel.RunningServer);
  const peek = vi.spyOn(HerdrCore.prototype, "peek").mockResolvedValue("absent");
  const reconcile = vi.spyOn(SessionsService.prototype, "reconcile").mockResolvedValue(undefined);
  const detect = vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([
    { id: "codex", displayName: "Codex", installed: true, path: process.execPath, headless: false, detectedAt: "", history: { resume: true, fork: true } },
    { id: "pi", displayName: "Pi", installed: true, path: process.execPath, headless: false, detectedAt: "", history: { resume: true, fork: true } },
  ]);
  let engine: RunningEngine | undefined;
  try {
    engine = await boot({ vaultPath: vault, create: true });
    await run(root, work, other, engine);
  } finally {
    await engine?.shutdown();
    detect.mockRestore();
    reconcile.mockRestore();
    peek.mockRestore();
    listen.mockRestore();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
}

function historyCalls(engine: RunningEngine) {
  const call = (capability: string, input: unknown) => engine.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
  const read = async <T>(capability: string, input: unknown): Promise<T> => {
    const result = await call(capability, input);
    assert(result.ok, JSON.stringify(result));
    return result.data as T;
  };
  return { call, read };
}

function historySession(input: LaunchInput): SessionRecord {
  return {
    id: `sess-${input.requestId}`,
    spaceId: input.spaceId,
    provider: input.provider,
    model: null,
    state: "running",
    requestId: input.requestId,
    terminalId: "t1",
    name: "history fixture",
    cwd: input.cwd!,
    createdAt: new Date().toISOString(),
    ...(input.history && {
      nativeSessionId: input.history.nativeId,
      historyId: input.history.sourceId,
      historyLaunch: { history: input.history, spaceRevision: input.spaceRevision, selection: "fixture", cwd: input.cwd! },
    }),
  };
}

test("历史列表与认领按 Codex rollout 区分同 UUID 的不同 profile", async () => {
  await withHistoryFixture(async (root, work, other, engine) => {
    const selectedDir = path.join(root, "codex", "sessions", "2026", "11", "21");
    const privateDir = path.join(root, "private-codex", "sessions", "2026", "11", "21");
    mkdirSync(selectedDir, { recursive: true });
    mkdirSync(privateDir, { recursive: true });
    const selectedFile = path.join(selectedDir, rollout(codexId));
    const privateFile = path.join(privateDir, rollout(codexId));
    writeFileSync(selectedFile, row({ type: "session_meta", payload: { id: codexId, cwd: work } }));
    writeFileSync(privateFile, row({ type: "session_meta", payload: { id: codexId, cwd: other } }));
    const { call, read } = historyCalls(engine);
    const [space] = await read<{ id: string; revision: number }[]>("agent.spaces.list", {});
    assert(space);
    const scope = { spaceId: space.id, spaceRevision: space.revision, provider: "codex" as const };
    const privateSession = historySession({ ...scope, cwd: other, requestId: randomUUID(), history: { mode: "resume", nativeId: codexId, sourceId: "private-history", file: privateFile } });
    const records = vi.spyOn(SessionsService.prototype, "list").mockReturnValue([privateSession]);
    const launch = vi.spyOn(SessionsService.prototype, "launch").mockImplementation(async (input) => historySession(input));
    try {
      const { entries } = await read<{ entries: HistoryRow[] }>("agent.history.list", scope);
      expect(entries).toEqual([expect.objectContaining({ active: false, possiblyActive: false, canResume: true, canFork: true })]);
      const [selected] = entries;
      assert(selected);
      expect(await read("agent.history.list", { ...scope, filter: "resumable" })).toMatchObject({ entries: [{ historyId: selected.historyId }] });
      const input = { ...scope, action: "resume", nativeSessionId: codexId, historyId: selected.historyId, historyRevision: selected.revision };
      expect(await call("agent.history.resume", { ...input, requestId: randomUUID() })).toMatchObject({ ok: true });
      const [probe] = launch.mock.results;
      const active = (await probe!.value) as SessionRecord;
      records.mockReturnValue([privateSession, { ...active, state: "launching" }]);
      expect(await read("agent.history.list", scope)).toMatchObject({ entries: [{ active: false, possiblyActive: true, canResume: false, canFork: false }] });
      records.mockReturnValue([privateSession, active]);
      expect(await read("agent.history.list", scope)).toMatchObject({ entries: [{ active: true, possiblyActive: false, canResume: false, canFork: false }] });
      expect(await call("agent.history.resume", { ...input, requestId: randomUUID() })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(launch).toHaveBeenCalledTimes(1);
    } finally {
      launch.mockRestore();
      records.mockRestore();
    }
  });
});

test("历史列表与认领允许独立的 Pi 文件并发并拦截同源硬链接", async () => {
  await withHistoryFixture(async (root, work, other, engine) => {
    const pi = path.join(root, "pi");
    mkdirSync(pi);
    for (const [name, cwd] of [
      ["first", work],
      ["second", other],
      ["third", work],
    ] as const) {
      writeFileSync(path.join(pi, `${name}.jsonl`), row({ type: "session", version: 3, id: "same-id", cwd }) + row({ type: "message", message: { role: "user", content: name } }));
    }
    const firstFile = path.join(pi, "first.jsonl");
    const linkedFile = path.join(pi, "linked.jsonl");
    linkSync(firstFile, linkedFile);
    const { dev, ino } = statSync(firstFile, { bigint: true });
    expect(statSync(linkedFile, { bigint: true })).toMatchObject({ dev, ino });
    const { call, read } = historyCalls(engine);
    const [space] = await read<{ id: string; revision: number }[]>("agent.spaces.list", {});
    assert(space);
    const scope = { spaceId: space.id, spaceRevision: space.revision, provider: "pi" };
    const { entries } = await read<{ entries: HistoryRow[] }>("agent.history.list", scope);
    const byTitle = (name: string) => {
      const selected = entries.find(({ title }) => title === name);
      assert(selected, `missing ${name}`);
      return selected;
    };
    const [first, alias, extra] = entries.filter(({ title }) => title === "first");
    assert(first && alias && !extra);
    expect(first.historyId).not.toBe(alias.historyId);
    const resume = (selected: HistoryRow) =>
      call("agent.history.resume", { ...scope, action: "resume", requestId: randomUUID(), nativeSessionId: selected.nativeSessionId, historyId: selected.historyId, historyRevision: selected.revision });
    const gate = createFixtureGate();
    const records = vi.spyOn(SessionsService.prototype, "list").mockReturnValue([]);
    let openingSession: SessionRecord | undefined;
    const launch = vi.spyOn(SessionsService.prototype, "launch").mockImplementation(async (input) => {
      const session = historySession(input);
      if (input.history?.sourceId === first.historyId) {
        openingSession = { ...session, state: "launching" };
        await gate.wait();
      }
      return session;
    });
    const opening = resume(first);
    try {
      await gate.entered;
      expect(await resume(first)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect.soft(await resume(alias), "硬链接共享未落盘的认领").toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      assert(openingSession);
      records.mockReturnValue([openingSession]);
      expect(await resume(byTitle("second"))).toMatchObject({ ok: true });
      expect(await resume(byTitle("third"))).toMatchObject({ ok: true });
      gate.resume();
      expect(await opening).toMatchObject({ ok: true });
      records.mockReturnValue([{ ...openingSession, state: "running" }]);
      expect.soft(await read("agent.history.list", scope), "已登记的原会话占用硬链接").toMatchObject({
        entries: expect.arrayContaining([
          expect.objectContaining({ historyId: first.historyId, active: true, possiblyActive: false }),
          expect.objectContaining({ historyId: alias.historyId, active: false, possiblyActive: true, canResume: false }),
        ]),
      });
      expect.soft(await resume(alias), "已运行的原会话仍占用硬链接").toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(launch).toHaveBeenCalledTimes(3);
    } finally {
      gate.resume();
      await opening;
      launch.mockRestore();
      records.mockRestore();
    }
  });
});
