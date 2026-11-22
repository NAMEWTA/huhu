import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HuhuError, type TaskDto } from "@huhu/contracts";
import { ExposureStore, type CapabilityDefinition, type HuhuApi } from "@huhu/kernel";
import { OperationLog, SemanticRepository, Vault, VaultFiles } from "@huhu/vault";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import type { ApprovedLinuxShell } from "../src/engine/approved-linux-shell.js";
import { Scheduler } from "../src/engine/scheduler.js";
import { AutomationsService } from "../src/engine/service.js";
import { registerTerminalEnvironments } from "../src/engine/terminal-environment.js";

const dirs: string[] = [];
const terminalOwner = "a".repeat(64);
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const exec = (n: number) => ({ spaceId: `space-${n}`, provider: "codex", model: null, effort: null, fast: false });
function task(id: string, over: Partial<TaskDto> = {}): TaskDto {
  return {
    id,
    path: `Tasks/${id}.md`,
    version: "v",
    title: id,
    body: "",
    type: "agent",
    status: "not_started",
    completedAt: null,
    tags: [],
    due: null,
    project: null,
    origin: { kind: "desktop" },
    execution: exec(1),
    reminders: [],
    inputRevision: 1,
    inputHash: `h-${id}`,
    createdAt: "",
    updatedAt: "",
    readOnly: false,
    comments: [],
    references: [],
    problems: [],
    dispatchBlockers: [],
    ...over,
  };
}

interface Call {
  capability: string;
  input: Record<string, unknown>;
  key?: string;
}
function setup(
  opts: {
    tasks?: TaskDto[];
    tasksEnabled?: boolean;
    /** 假 agent-cli：按命令返回会话；output 为命令的“输出”。 */
    terminal?: { exitCode?: number | null; output?: string; stayRunning?: boolean; launchError?: string; lostReply?: Error; unavailable?: () => boolean; releaseUnavailable?: () => boolean; hasEnv?: boolean };
    spaceState?: "ok" | "missing";
    spaceRevision?: () => number;
    now?: () => Date;
  } = {},
) {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-au-"));
  dirs.push(d);
  const root = path.join(d, "v");
  mkdirSync(path.join(root, ".huhu"), { recursive: true });
  const tasks = opts.tasks ?? [];
  const calls: Call[] = [];
  const notes: string[] = [];
  const events: string[] = [];
  const sessions = new Map<string, { id: string; state: string; exitCode: number | null; requestId?: string; hasEnv?: boolean }>();
  const open = (owner = terminalOwner) => {
    const files = new VaultFiles(root);
    const repo = new SemanticRepository(files, new OperationLog(files, path.join(d, "ops")));
    const svc = new AutomationsService({
      repo,
      activationsDir: path.join(d, "act"),
      taskQuery: () =>
        opts.tasksEnabled === false ? undefined : { listAll: () => tasks, listDispatchable: () => tasks.filter((t) => t.type === "agent" && t.status === "not_started"), snapshot: (id) => tasks.find((t) => t.id === id) as TaskDto },
      terminalPollMs: 5,
      spaceState: () => ({ state: opts.spaceState ?? "ok", root: "/work" }),
      cliAvailable: () => true,
      holds: () => false,
      vaultRoot: root,
      terminalOwner: owner,
      call: async (capability, input, key) => {
        const i = input as Record<string, unknown>;
        calls.push({ capability, input: i, ...(key ? { key } : {}) });
        if (!key && !/^(agent\.spaces\.list|agent\.sessions\.(list|output)|tasks\.(list|read))$/.test(capability)) throw new Error("写入类能力必须提供幂等键"); // 与内核 Dispatcher 一致：缺幂等键会被拒绝
        if (capability === "agent.spaces.list") return [{ id: "space-1", revision: opts.spaceRevision?.() ?? 1, root }];
        if (capability === "agent.sessions.launch") {
          if (opts.terminal?.launchError) throw new Error(opts.terminal.launchError);
          sessions.set(`sess-${sessions.size + 1}`, {
            id: `sess-${sessions.size + 1}`,
            state: opts.terminal?.stayRunning ? "running" : "exited",
            exitCode: opts.terminal?.exitCode ?? 0,
            requestId: String(i["requestId"]),
            hasEnv: opts.terminal?.hasEnv ?? false,
          });
          if (opts.terminal?.lostReply) throw opts.terminal.lostReply;
          return { id: `sess-${sessions.size}` };
        }
        if (capability === "agent.sessions.list") {
          if (opts.terminal?.unavailable?.()) throw new Error("temporary disconnect");
          return [...sessions.values()];
        }
        if (capability === "agent.sessions.kill") {
          const x = sessions.get(String(i["id"]));
          if (x) Object.assign(x, { state: "exited", exitCode: null });
          return {};
        }
        if (capability === "agent.sessions.release") {
          if (opts.terminal?.releaseUnavailable?.()) throw new Error("终端释放暂不可用");
          return { ok: true };
        }
        if (capability === "agent.sessions.output") return { text: opts.terminal?.output ?? "", complete: true };
        return {};
      },
      notify: (n) => notes.push(n.title),
      publish: (t) => events.push(t),
      now: opts.now ?? (() => new Date("2026-11-10T12:00:00Z")),
      zone: () => "UTC",
    });
    return { repo, svc };
  };
  return { ...open(), open, root, tasks, calls, notes, events, d, sessions };
}

const every5 = { preset: "every5", cron: "*/5 * * * *", zone: "UTC" };
const terminalAction = { kind: "terminal", command: "echo fixture", shell: "default", spaceId: null } as const;
const terminalSlot = new Date("2026-11-10T12:00:00Z");

async function terminalRule(svc: AutomationsService) {
  const created = await svc.create({ title: "定时终端", trigger: every5, action: terminalAction });
  return svc.setEnabled(created.id, true);
}

function terminalLaunches(calls: Call[]) {
  return calls.filter(({ capability }) => capability === "agent.sessions.launch");
}

type ApprovedLaunchFixture = {
  requestId: string;
  approvedShell: ApprovedLinuxShell;
  use<T>(consumer: (values: ReadonlyMap<string, string>) => Promise<T>, signal: AbortSignal): Promise<T>;
  onPending(completion: Promise<{ id: string }>): void;
};

test.skipIf(process.platform !== "linux")("Linux sh 外部批准固定映像、版本、工作目录和单次启动", async () => {
  const { svc, root, d, sessions, calls } = setup();
  const localRoot = path.join(d, "local");
  const keys = path.join(d, "keys");
  const alternate = path.join(d, "alternate-path");
  for (const dir of [localRoot, keys, alternate]) mkdirSync(dir);
  writeFileSync(path.join(alternate, "sh"), "#!/bin/sh\nexit 42\n", { mode: 0o700 });
  const vault = await Vault.open(root, { create: true });
  const command = 'test -n "$HUHU_RULE_SECRET_FIXTURE" && printf "%s\\n" approved-fixture-ok';
  const variable = "HUHU_RULE_SECRET_FIXTURE";
  const secret = "synthetic-terminal-environment";
  const bindings = new Map<string, CapabilityDefinition>();
  const launch = vi.fn();
  let supplied = false;
  const launchApprovedShell = vi.fn(async (input: ApprovedLaunchFixture, signal: AbortSignal) => {
    await input.use(async (values) => {
      supplied = values.get(variable) === secret;
    }, signal);
    const id = `approved-${sessions.size + 1}`;
    sessions.set(id, { id, state: "exited", exitCode: 0, requestId: input.requestId, hasEnv: true });
    return { id };
  });
  let launcherAvailable = false;
  let spaceRevision = 1;
  const api = {
    vault,
    defineCapability: (entry: CapabilityDefinition) => bindings.set(entry.name, entry),
    service: (name: string) => {
      if (name === "agentCli") return { spaces: { list: () => [{ id: "space-1", revision: spaceRevision, root }] } };
      if (name === "agentProtectedTerminal") return { launch, ...(launcherAvailable && { launchApprovedShell }) };
    },
  } as unknown as HuhuApi;
  registerTerminalEnvironments(api, svc, { vault, localRoot, localVaultInstanceId: "linux-approved-test", protection: new TestProtection(keys) });
  const access = new ExposureStore(vault.files, path.join(vault.stateDir, "plugins.json"));
  const invoke = async <T>(name: string, input: unknown, caller = "desktop"): Promise<T> => {
    const capability = bindings.get(`automations.terminal.${name}`)!;
    const parsed = capability.input.parse(input);
    const result = await capability.handler({ signal: new AbortController().signal, caller, subject: "fixture", requestId: randomUUID() }, parsed);
    return capability.output.parse(result) as T;
  };
  type Review = { target: string; ruleVersion: string; approvalId: string | null };
  type Status = { revision: string; ruleVersion: string };
  const capability = (operation: string) => `automations.terminal.external.${operation}`;
  try {
    await access.initialize([...bindings.keys()]);
    const rule = await svc.create({ title: "Linux 已批准规则", trigger: every5, action: { ...terminalAction, shell: "sh", command } });
    const id = { ruleId: rule.id };
    const review = () => invoke<Review>("approval.review", id);
    const approve = async () => {
      const { target, ruleVersion, approvalId } = await review();
      return invoke<{ approvalId: string }>("approval.approve", { ...id, target, expectedRuleVersion: ruleVersion, expectedApprovalId: approvalId, names: [variable] });
    };
    expect(await review()).toMatchObject({ shell: "sh", command, executable: realpathSync.native("/bin/sh"), unavailableReason: expect.stringContaining("核验 Linux sh") });
    await expect(approve()).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    launcherAvailable = true;
    const before = await review();
    vi.stubEnv("PATH", alternate);
    try {
      expect(await review()).toEqual(before);
    } finally {
      vi.unstubAllEnvs();
    }
    await expect(invoke("external.status", id, "cli")).rejects.toMatchObject({ code: "CAPABILITY_NOT_EXPOSED" });
    await access.setMany(["status", "save", "run"].map((op) => ({ capability: capability(op), exposed: true })));
    await expect(invoke("external.status", id, "cli")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const { approvalId } = await approve();
    const base = { ...id, expectedRuleVersion: rule.version, expectedRevision: null };
    expect(await invoke("external.status", id, "cli")).toMatchObject({ ruleVersion: rule.version, revision: null, states: { [variable]: "unconfigured" } });
    await expect(invoke("external.save", { ...base, changes: [{ name: "PATH", action: "replace", value: alternate }] }, "cli")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const saved = await invoke<Status>("external.save", { ...base, changes: [{ name: variable, action: "replace", value: secret }] }, "cli");
    expect(saved).toMatchObject({ states: { [variable]: "configured" } });
    expect(JSON.stringify(saved)).not.toContain(secret);
    const cleared = await invoke<Status>("external.save", { ...base, expectedRevision: saved.revision, changes: [{ name: variable, action: "clear" }] }, "cli");
    await expect(invoke("external.run", { ...base, expectedRevision: cleared.revision, intentId: randomUUID() }, "cli")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(launchApprovedShell).not.toHaveBeenCalled();
    const restored = await invoke<Status>("external.save", { ...base, expectedRevision: cleared.revision, changes: [{ name: variable, action: "replace", value: secret }] }, "cli");
    const intent = { ...base, expectedRevision: restored.revision, intentId: randomUUID() };
    const execute = (input: unknown = intent, caller = "cli") => invoke<{ runId: string; activationId: string }>("external.run", input, caller);
    await expect(execute({ ...intent, expectedRuleVersion: "obsolete" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(launchApprovedShell).not.toHaveBeenCalled();
    const [first, second] = await Promise.all([execute(), execute()]);
    expect(second).toMatchObject({ runId: first.runId, activationId: first.activationId });
    expect(launchApprovedShell).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        names: [variable],
        use: expect.any(Function),
        approvedDirectory: expect.objectContaining({ path: realpathSync.native(root), identity: expect.any(String) }),
        approvedShell: {
          executable: expect.objectContaining({ path: realpathSync.native("/bin/sh"), identity: expect.any(String), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
          argv: [realpathSync.native("/bin/sh"), "-c", command],
        },
      }),
      expect.any(AbortSignal),
    );
    expect(supplied).toBe(true);
    expect(launchApprovedShell.mock.calls[0]?.[0]).not.toHaveProperty("env");
    expect(launch).not.toHaveBeenCalled();
    await svc.idle();
    const run = svc.runDetail(first.runId);
    expect(run.data["state"]).toBe("succeeded");
    expect(JSON.stringify(run)).not.toContain(secret);

    launcherAvailable = false;
    await expect(execute()).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    launcherAvailable = true;
    await access.set(capability("run"), false);
    await expect(execute()).rejects.toMatchObject({ code: "CAPABILITY_NOT_EXPOSED" });
    await access.set(capability("run"), true);
    await access.set("automations.terminal.approval.review", true);
    const resolvePath = realpathSync.native;
    const unavailableImage = vi.spyOn(realpathSync, "native").mockImplementation((file, options) => {
      if (file === "/bin/sh") throw new Error("simulated system sh image unavailable");
      return resolvePath(file, options);
    });
    try {
      const pending = await review();
      expect(pending).toMatchObject({ approvalId, target: null, shell: "sh", command, unavailableReason: expect.stringContaining("无法核对 Linux 系统 sh") });
      expect(pending).not.toHaveProperty("executable");
      await expect(invoke("approval.review", id, "cli")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
      await expect(invoke("external.status", id, "cli")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
      await expect(execute({ ...intent, intentId: randomUUID() }, "mcp")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
      await expect(invoke("approval.approve", { ...id, target: before.target, expectedRuleVersion: before.ruleVersion, expectedApprovalId: approvalId, names: [variable] })).rejects.toMatchObject({
        code: "PERMISSION_DENIED",
      });
      expect(await invoke("approval.revoke", { ...id, expectedApprovalId: pending.approvalId })).toEqual({ revoked: true });
      expect(await review()).toMatchObject({ approvalId: null, target: null });
    } finally {
      unavailableImage.mockRestore();
    }
    expect(await review()).toMatchObject({ approvalId: null, target: before.target });
    await expect(execute({ ...intent, intentId: randomUUID() }, "mcp")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const restoredApproval = await approve();
    launcherAvailable = false;
    await expect(approve()).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(await invoke("approval.revoke", { ...id, expectedApprovalId: restoredApproval.approvalId })).toEqual({ revoked: true });
    expect(await review()).toMatchObject({ approvalId: null, unavailableReason: expect.stringContaining("核验 Linux sh") });
    launcherAvailable = true;
    await approve();
    spaceRevision++;
    await expect(execute({ ...intent, intentId: randomUUID() })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    spaceRevision--;
    await svc.update(rule.id, rule.version, { action: { ...terminalAction, shell: "sh", command: "printf changed" } });
    await expect(execute({ ...intent, intentId: randomUUID() })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(launchApprovedShell).toHaveBeenCalledTimes(1);

    launcherAvailable = false;
    const ordinary = await svc.create({ title: "普通终端", trigger: every5, action: terminalAction });
    await expect(invoke("approval.review", { ruleId: ordinary.id })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await svc.activateNonAgent(ordinary.id, "manual");
    expect(terminalLaunches(calls)).toHaveLength(1);
    expect(terminalLaunches(calls)[0]?.input).toMatchObject({ shell: "default", command: terminalAction.command });
    const ordinarySh = await svc.create({ title: "普通 sh 终端", trigger: every5, action: { ...terminalAction, shell: "sh" } });
    await svc.activateNonAgent(ordinarySh.id, "manual");
    expect(terminalLaunches(calls)).toHaveLength(2);
    expect(terminalLaunches(calls)[1]?.input).toMatchObject({ shell: "sh", command: terminalAction.command });
  } finally {
    svc.abortAll();
    await svc.idle();
    await vault.close();
  }
});

test.skipIf(process.platform !== "linux").each(["resume", "rotate", "revoke", "principal", "exposure", "cancel"] as const)("Linux 原运行等待宿主时 %s", async (event) => {
  const { svc, root, d, sessions } = setup();
  const keys = path.join(d, "keys");
  const localRoot = path.join(d, "local");
  mkdirSync(keys);
  mkdirSync(localRoot);
  const vault = await Vault.open(root, { create: true });
  const variable = "HUHU_RULE_SECRET_FIXTURE";
  const marker = "synthetic-delayed-rule-value";
  const protection = new TestProtection(keys);
  const read = vi.spyOn(protection, "read");
  const bindings = new Map<string, CapabilityDefinition>();
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const consume = vi.fn(async (values: ReadonlyMap<string, string>) => {
    expect(values.get(variable)).toBe(marker);
  });
  let principal = true;
  const launch = vi.fn(async (input: ApprovedLaunchFixture, signal: AbortSignal) => {
    const id = "same-original-session";
    const completion = ready.then(async () => {
      const result = await input.use(consume, signal).then(
        () => ({ state: "exited", exitCode: 0 }),
        () => ({ state: "failed", exitCode: null }),
      );
      sessions.set(id, { id, requestId: input.requestId, hasEnv: true, ...result });
      return { id };
    });
    input.onPending(completion);
    throw new HuhuError("RUN_UNKNOWN", "fixture cannot yet inspect host");
  });
  const api = {
    vault,
    defineCapability: (entry: CapabilityDefinition) => bindings.set(entry.name, entry),
    service: (name: string) => {
      if (name === "agentCli") return { spaces: { list: () => [{ id: "space-1", revision: 1, root }] } };
      if (name === "agentProtectedTerminal") return { launchApprovedShell: launch };
    },
  } as unknown as HuhuApi;
  registerTerminalEnvironments(api, svc, { vault, localRoot, localVaultInstanceId: "delayed-approved", protection }, (_caller, subject) => principal && subject === "fixture");
  const exposure = new ExposureStore(vault.files, path.join(vault.stateDir, "plugins.json"));
  const invoke = async <T>(name: string, input: unknown, caller = "desktop"): Promise<T> => {
    const cap = bindings.get(`automations.terminal.${name}`)!;
    const result = await cap.handler({ signal: new AbortController().signal, caller, subject: "fixture", requestId: randomUUID() }, cap.input.parse(input));
    return cap.output.parse(result) as T;
  };
  try {
    await exposure.initialize([...bindings.keys()]);
    await exposure.setMany(["save", "run"].map((operation) => ({ capability: `automations.terminal.external.${operation}`, exposed: true })));
    const rule = await svc.create({ title: "延迟领取", trigger: every5, action: { ...terminalAction, shell: "sh" } });
    const request = { ruleId: rule.id, expectedRuleVersion: rule.version };
    const { target } = await invoke<{ target: string }>("approval.review", { ruleId: rule.id });
    const { approvalId } = await invoke<{ approvalId: string }>("approval.approve", { ...request, target, names: [variable], expectedApprovalId: null });
    const { revision } = await invoke<{ revision: string }>("external.save", { ...request, expectedRevision: null, changes: [{ name: variable, action: "replace", value: marker }] }, "cli");
    const intent = { ...request, expectedRevision: revision, intentId: randomUUID() };
    const run = () => invoke<{ runId: string; activationId: string; state: string }>("external.run", intent, "cli");
    read.mockClear();
    const [admitted, retry] = await Promise.all([run(), run()]);
    expect(admitted.state).toBe("unknown");
    expect(retry).toEqual(admitted);
    expect(svc.runDetail(admitted.runId).live).toBe(true);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
    expect(launch.mock.calls[0]?.[0]).not.toHaveProperty("env");

    if (event === "revoke") expect(await invoke("approval.revoke", { ruleId: rule.id, expectedApprovalId: approvalId })).toEqual({ revoked: true });
    if (event === "rotate") {
      await invoke("external.save", { ...request, expectedRevision: revision, changes: [{ name: variable, action: "replace", value: "rotated-synthetic-rule-value" }] }, "cli");
      read.mockClear();
    }
    if (event === "principal") principal = false;
    if (event === "exposure") await exposure.set("automations.terminal.external.run", false);
    if (event === "cancel") expect(svc.cancelRun(admitted.runId)).toBe(true);
    markReady();
    await svc.idle();
    const settled = svc.runDetail(admitted.runId);
    expect(settled).toMatchObject({ live: false, data: { activationId: admitted.activationId, sessionId: "same-original-session", state: event === "resume" ? "succeeded" : event === "cancel" ? "cancelled" : "failed" } });
    expect(consume).toHaveBeenCalledTimes(event === "resume" ? 1 : 0);
    if (event === "resume") {
      expect(read).toHaveBeenCalled();
      const [lease] = consume.mock.calls[0]!;
      expect(lease.size).toBe(0);
      await expect(Promise.resolve().then(() => launch.mock.calls[0]![0].use(consume, launch.mock.calls[0]![1]))).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
      expect((await run()).state).toBe("succeeded");
    } else {
      expect(read).not.toHaveBeenCalled();
    }
    expect(launch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(settled)).not.toContain(marker);
  } finally {
    svc.abortAll();
    markReady();
    await svc.idle();
    await vault.close();
  }
});

/** 一条已启用的“让 Agent 处理任务”规则。 */
async function scanRule(svc: AutomationsService, tags: string[] = [], maxConcurrent = 1): Promise<string> {
  const r = await svc.create({ title: "处理 Agent 任务", trigger: every5, action: { kind: "agent", input: { source: "tasks", tags, maxConcurrent } } });
  return (await svc.setEnabled(r.id, true)).id;
}
const promptAction = { kind: "agent" as const, input: { source: "prompt" as const, spaceId: "space-1", provider: "claude", model: null, effort: null, fast: false } };

describe("规则正文（agent 动作“提示词”输入）", () => {
  test("update 可以改正文；其他动作不接受非空正文；从“提示词”改成别的动作会清空旧提示词；省略 body 保留原文", async () => {
    const { svc } = setup();
    const r = await svc.create({ title: "整理", trigger: { preset: "daily", cron: "30 9 * * *", zone: "UTC" }, action: promptAction, body: "第一版" });
    expect(r.body).toBe("第一版");
    const r2 = await svc.update(r.id, r.version, { title: "整理2" });
    expect(r2.body).toBe("第一版");
    const r3 = await svc.update(r.id, r2.version, {}, "第二版");
    expect(r3.body).toBe("第二版");
    const reminder = { kind: "reminder" as const, mode: "notification" as const, text: "x", taskId: null };
    await expect(svc.update(r.id, r3.version, { action: reminder }, "还想留着提示词")).rejects.toThrow(/提示词/);
    const r4 = await svc.update(r.id, r3.version, { action: reminder });
    expect(r4.body).toBe("");
    await expect(svc.update(r.id, r4.version, {}, "提醒规则不该有正文")).rejects.toThrow(/提示词/);
  });
  test("“任务”输入的规则正文是补充指令，允许保留", async () => {
    const { svc } = setup();
    const r = await svc.create({ title: "扫", trigger: every5, action: { kind: "agent", input: { source: "tasks", tags: [], maxConcurrent: 1 } }, body: "完成后请写总结" });
    expect(r.body).toBe("完成后请写总结");
  });
});

describe("规则", () => {
  test("新 Vault 没有任何内置规则；规则都可以删除；新建默认暂停；可启停", async () => {
    const { svc } = setup();
    expect(svc.rules()).toEqual([]);
    const r = await svc.create({ title: "每天提醒", trigger: { preset: "daily9", cron: "0 9 * * *", zone: "UTC" }, action: { kind: "reminder", mode: "notification", text: "喝水", taskId: null } });
    expect(r.data.enabled).toBe(false);
    expect((await svc.setEnabled(r.id, true)).data.enabled).toBe(true);
    await svc.delete(r.id);
    expect(svc.rules()).toEqual([]);
  });
  test("非法 cron / 时区被拒绝", async () => {
    const { svc } = setup();
    const r = await svc.create({ title: "提醒", trigger: every5, action: { kind: "reminder", mode: "notification", text: "x", taskId: null } });
    await expect(svc.create({ title: "x", trigger: { preset: "custom", cron: "bad", zone: "UTC" }, action: { kind: "reminder", mode: "notification", text: "x", taskId: null } })).rejects.toThrow(/定时设置无效/);
    await expect(svc.update(r.id, r.version, { trigger: { preset: "custom", cron: "0 9 * * *", zone: "Mars/Base" } })).rejects.toThrow();
  });
});

describe("agent 动作：任务输入", () => {
  const four = () => [task("a"), task("b", { execution: exec(2) }), task("h", { type: "human", execution: null }), task("d", { status: "completed" })];

  test("预览：候选 2、跳过 2 并带原因，且不产生任何文件", async () => {
    const { svc, d } = setup({ tasks: four() });
    const id = await scanRule(svc);
    const before = readdirSync(d).sort();
    const p = svc.preview(id);
    expect(p.candidates.map((c) => c.taskId)).toEqual(["a", "b"]);
    expect(p.skipped.map((s) => [s.taskId, s.reason])).toEqual([
      ["h", "not-agent"],
      ["d", "not-open"],
    ]);
    expect(p.next).toHaveLength(3);
    expect(readdirSync(d).sort()).toEqual(before);
    expect(existsSync(path.join(d, "act"))).toBe(false);
  });

  test("台北规则按当地时区预览窗口和入选任务，未排期与逾期可独立调整", async () => {
    const tasks = [
      task("yesterday", { availableAt: "2026-11-09T10:00:00Z", execution: exec(1) }),
      task("today", { availableAt: "2026-11-10T01:00:00Z", execution: exec(2) }),
      task("tomorrow", { availableAt: "2026-11-11T01:00:00Z", execution: exec(3) }),
      task("unscheduled", { availableAt: null, execution: exec(4) }),
    ];
    const { svc, d } = setup({ tasks });
    const trigger = { ...every5, zone: "Asia/Taipei" };
    const coreInput = { source: "tasks" as const, tags: [], maxConcurrent: 1 };
    const stored = await svc.create({
      title: "台北今天任务",
      trigger,
      action: { kind: "agent", input: { ...coreInput, window: { kind: "today" }, includeOverdue: true, includeUnscheduled: false } },
    });
    expect(svc.preview(stored.id).candidates.map(({ taskId }) => taskId)).toEqual(["yesterday", "today"]);
    const rule = await svc.update(stored.id, stored.version, { action: { kind: "agent", input: { ...coreInput, includeOverdue: false, includeUnscheduled: true } } });
    expect(rule.data.action).toMatchObject({ input: { window: { kind: "today" }, includeOverdue: false, includeUnscheduled: true } });
    const before = readdirSync(d).sort();
    const preview = svc.preview(rule.id);
    expect(readdirSync(d).sort()).toEqual(before);
    expect(preview.candidates.map(({ taskId }) => taskId)).toEqual(["today", "unscheduled"]);
    expect(preview.skipped).toMatchObject([
      { taskId: "yesterday", reason: "outside-window" },
      { taskId: "tomorrow", reason: "not-due" },
    ]);
    expect(svc.preview(rule.id).next).toEqual(preview.next);
    expect(svc.rule(rule.id).version).toBe(rule.version);
    expect(svc.lastActivatedFor(rule.id)).toBeNull();
  });

  test("标签筛选：只处理带全部标签的任务；其余带 tag-mismatch", async () => {
    const { svc } = setup({ tasks: [task("a", { tags: ["周报", "接口"] }), task("b", { execution: exec(2), tags: ["周报"] }), task("c", { execution: exec(3) })] });
    const id = await scanRule(svc, ["周报", "接口"]);
    expect(svc.preview(id).skipped.map((s) => [s.taskId, s.reason])).toEqual([
      ["b", "tag-mismatch"],
      ["c", "tag-mismatch"],
    ]);
    expect(svc.preview(id).candidates.map(({ taskId }) => taskId)).toEqual(["a"]);
  });

  test("任务自身有阻塞原因（引用越界、结构错误等）→ 不派发，预览显示原因", async () => {
    const { svc } = setup({ tasks: [task("a", { dispatchBlockers: ["引用越界：../x.md"] })] });
    const id = await scanRule(svc);
    expect(svc.preview(id).skipped[0]).toMatchObject({ taskId: "a", reason: "task-blocked", detail: "引用越界：../x.md" });
    expect(svc.preview(id).candidates).toEqual([]);
  });

  test("tasks 插件停用：扫描跳过（预览标注）；reminder 规则正常通知", async () => {
    const { svc, notes } = setup({ tasksEnabled: false });
    const scanId = await scanRule(svc);
    expect(svc.preview(scanId).tasksDisabled).toBe(true);
    const n = await svc.create({ title: "提醒", trigger: every5, action: { kind: "reminder", mode: "notification", text: "该休息了", taskId: null } });
    await svc.setEnabled(n.id, true);
    expect((await svc.activateNonAgent(n.id, "schedule", new Date("2026-11-10T11:55:00Z"))).summary).toEqual({ state: "succeeded" });
    expect(notes).toEqual(["该休息了"]);
  });

  test("Space 缺失的候选被跳过", async () => {
    const { svc } = setup({ tasks: [task("a")], spaceState: "missing" });
    const id = await scanRule(svc);
    expect(svc.preview(id).skipped[0]?.reason).toBe("missing-space");
  });

  test("激活记录：start+finish 合并为一条，lastActivatedFor 取最近计划时间", async () => {
    const { svc } = setup();
    const { id } = await svc.create({ title: "提醒", trigger: every5, action: { kind: "reminder", mode: "notification", text: "休息", taskId: null } });
    await svc.setEnabled(id, true);
    await svc.activateNonAgent(id, "schedule", new Date("2026-11-10T11:55:00Z"));
    await svc.activateNonAgent(id, "manual");
    const acts = svc.activations();
    expect(acts).toHaveLength(2);
    expect(acts.every((a) => a.finishedAt)).toBe(true);
    expect(svc.lastActivatedFor(id)?.toISOString()).toBe("2026-11-10T11:55:00.000Z");
  });
});

describe("agent 动作：提示词输入 / terminal / reminder", () => {
  test("reminder：通知 / 新建人工任务（引用关联任务）/ 两者都做；建任务失败要提示", async () => {
    const { svc, calls, notes } = setup({ tasks: [task("a")] });
    const mk = async (mode: "notification" | "task" | "both", taskId: string | null) => (await svc.create({ title: "提醒", trigger: every5, action: { kind: "reminder", mode, text: "复盘周报", taskId } })).id;
    expect((await svc.activateNonAgent(await mk("notification", null), "manual")).summary).toEqual({ state: "succeeded" });
    expect(notes).toEqual(["复盘周报"]);
    expect(calls).toEqual([]);
    expect((await svc.activateNonAgent(await mk("both", "a"), "manual")).summary).toEqual({ state: "succeeded" });
    const create = calls.find((c) => c.capability === "tasks.create")!;
    expect(create.input).toMatchObject({ title: "复盘周报", type: "human" });
    expect(String(create.input["body"])).toContain("[[Tasks/a.md]]");
    expect(notes).toEqual(["复盘周报", "复盘周报"]);
    // 建任务失败（tasks 停用等）
    (svc as unknown as { d: { call: unknown } }).d.call = async () => {
      throw new Error("tasks 未启用");
    };
    expect((await svc.activateNonAgent(await mk("task", null), "manual")).summary).toEqual({ state: "failed" });
    expect(notes.at(-1)).toContain("创建任务失败");
  });

  test("terminal：经 agent-cli 的 Herdr 会话运行（launch 带 command / shell / Space），automation-run 记录 sessionId，输出与退出码写入运行记录", async () => {
    const ctx = setup({ terminal: { exitCode: 0, output: "hello-terminal" } });
    const { svc, calls } = ctx;
    const ok = await svc.create({ title: "打招呼", trigger: every5, action: { kind: "terminal", command: "echo hello-terminal", shell: "sh", spaceId: null, envRefs: {} } });
    expect((await svc.activateNonAgent(ok.id, "manual")).summary).toEqual({ state: "succeeded" });
    const launch = calls.find((c) => c.capability === "agent.sessions.launch")!;
    expect(launch.input).toMatchObject({ provider: "shell", command: "echo hello-terminal", shell: "sh", spaceId: "space-1" });
    expect(launch.input).not.toHaveProperty("envRefs");
    const run = svc.runs().find((x) => x.kind === "automation-run")!;
    const d = svc.runDetail(run.id);
    expect(d.body).toContain("hello-terminal");
    expect(d.data).toMatchObject({ sessionId: "sess-1", exitCode: 0, state: "succeeded" });
    // 非零退出码 → failed
    const bad = setup({ terminal: { exitCode: 3 } });
    const r2 = await bad.svc.create({ title: "失败", trigger: every5, action: { kind: "terminal", command: "exit 3", shell: "default", spaceId: null, envRefs: {} } });
    expect((await bad.svc.activateNonAgent(r2.id, "manual")).summary).toEqual({ state: "failed" });
  });

  test("旧环境待重新配置，不创建旧引用、不启动、不改历史规则", async () => {
    const { svc, calls, repo } = setup();
    const action = { kind: "terminal", command: "echo fixture", shell: "default", spaceId: null, envRefs: { FIXTURE: "safe://old-fixture" } } as const;
    await expect(svc.create({ title: "新规则", trigger: every5, action })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const old = await repo.create("automation-rule", { title: "旧规则", enabled: true, action, trigger: every5, createdAt: "2026-11-10T12:00:00Z", updatedAt: "2026-11-10T12:00:00Z" }, "");
    expect(() => svc.activateNonAgent(old.id, "manual")).toThrow("旧规则需要重新配置");
    await expect(svc.setEnabled(old.id, true)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(svc.rule(old.id).data.action).toEqual(action);
    expect(calls).toHaveLength(0);
    expect(svc.runs()).toHaveLength(0);
    const { envRefs: _, ...current } = action;
    const updated = await svc.update(old.id, old.version, { action: current });
    expect(updated.data).toMatchObject({ enabled: false, action: current });
    expect(updated.data.action).not.toHaveProperty("envRefs");
  });

  test("terminal：取消 → 结束终端并记为 cancelled；重启对账：停在 running 的运行按会话真实状态完成", async () => {
    const ctx = setup({ terminal: { stayRunning: true, output: "partial" } });
    const { svc, calls } = ctx;
    const r = await svc.create({ title: "长任务", trigger: every5, action: { kind: "terminal", command: "sleep 100", shell: "default", spaceId: null, envRefs: {} } });
    const p = svc.activateNonAgent(r.id, "manual");
    for (let i = 0; i < 100 && !calls.some((c) => c.capability === "agent.sessions.launch"); i++) await new Promise((x) => setTimeout(x, 5));
    svc.cancel(r.id);
    await p;
    expect(calls.some((c) => c.capability === "agent.sessions.kill")).toBe(true);
    const run = svc.runs().find((x) => x.kind === "automation-run")!;
    expect(svc.runDetail(run.id).data["state"]).toBe("cancelled");
    // 对账：一个停在 running、会话已结束的运行
    const rec = setup({ terminal: { exitCode: 0, output: "done-after-restart" } });
    const rule = await rec.svc.create({ title: "重启对账", trigger: every5, action: { kind: "terminal", command: "echo", shell: "default", spaceId: null, envRefs: {} } });
    const d = rec.svc as unknown as { d: { repo: { create(k: string, d: unknown, b: string): Promise<{ id: string }> } } };
    await rec.svc.activateNonAgent(rule.id, "manual"); // 先产生一个 session（sess-1，已结束）
    const stuck = await d.d.repo.create("automation-run", { ruleId: rule.id, actionKind: "terminal", trigger: "manual", state: "running", startedAt: "2026-11-10T11:00:00Z", sessionId: "sess-1", terminalOwner }, "");
    rec.sessions.get("sess-1")!.requestId = `autorun-${stuck.id}`;
    await rec.svc.reconcileTerminals();
    await rec.svc.idle();
    expect(rec.svc.runDetail(stuck.id).data).toMatchObject({ state: "succeeded", exitCode: 0 });
    expect(rec.svc.runDetail(stuck.id).body).toContain("done-after-restart");
  });

  test("重启对账：规则后来被删除，受保护会话仍会移除；丢失 sessionId 时按 requestId 找回", async () => {
    const ctx = setup({ terminal: { exitCode: 0, output: "token=***", hasEnv: true } });
    const { svc, calls } = ctx;
    const rule = await svc.create({ title: "带密钥", trigger: every5, action: { kind: "terminal", command: "echo", shell: "default", spaceId: null } });
    await svc.activateNonAgent(rule.id, "manual");
    calls.length = 0;
    await svc.delete(rule.id); // 规则没了：对账不能再靠规则推断是否带过密钥
    const repo = (svc as unknown as { d: { repo: { create(k: string, d: unknown, b: string): Promise<{ id: string }> } } }).d.repo;
    const stuck = await repo.create("automation-run", { ruleId: rule.id, actionKind: "terminal", trigger: "manual", state: "running", startedAt: "2026-11-10T11:00:00Z", sessionId: "sess-1", terminalOwner }, "");
    ctx.sessions.get("sess-1")!.requestId = `autorun-${stuck.id}`;
    await svc.reconcileTerminals();
    await svc.idle();
    expect(svc.runDetail(stuck.id).data["state"]).toBe("succeeded");
    expect(calls.some((c) => c.capability === "agent.sessions.release")).toBe(true);
    // sessionId 没写回：运行 id 对应的 requestId（autorun-<id>）能找回会话
    const lost = await repo.create("automation-run", { ruleId: "rule-gone", actionKind: "terminal", trigger: "manual", state: "running", startedAt: "2026-11-10T11:00:00Z", terminalOwner }, "");
    (ctx.svc as unknown as { d: { call: (c: string, i: unknown, k?: string) => Promise<unknown> } }).d.call = async (c) =>
      c === "agent.sessions.list" ? [{ id: "sess-9", requestId: `autorun-${lost.id}`, state: "exited", exitCode: 0, hasEnv: false }] : c === "agent.sessions.output" ? { text: "recovered", complete: true } : {};
    await svc.reconcileTerminals();
    await svc.idle();
    expect(svc.runDetail(lost.id).data).toMatchObject({ state: "succeeded", sessionId: "sess-9" });
    expect(svc.runDetail(lost.id).body).toContain("recovered");
  });
});

test("暂停的终端规则可以手动运行，定时经过时不会创建会话", async () => {
  const { svc, calls } = setup({ terminal: { exitCode: 0 } });
  const rule = await svc.create({ title: "暂停的终端规则", trigger: every5, action: { kind: "terminal", command: "echo local", shell: "default", spaceId: null, envRefs: {} } });
  expect((await svc.activateNonAgent(rule.id, "schedule", new Date("2026-11-10T11:00:00Z"))).summary).toEqual({ state: "paused" });
  expect(calls).toEqual([]);
  expect((await svc.activateNonAgent(rule.id, "manual")).summary).toEqual({ state: "succeeded" });
  expect(calls.filter(({ capability }) => capability === "agent.sessions.launch")).toHaveLength(1);
});

test("受保护终端保留已完成结果和待释放义务，重开仅释放当前 Vault 的原请求", async () => {
  let unavailable = true;
  const { svc, open, calls } = setup({ terminal: { hasEnv: true, output: "原结果", releaseUnavailable: () => unavailable } });
  const rule = await terminalRule(svc);
  await svc.activateNonAgent(rule.id, "manual");
  const run = svc.runs()[0]!;
  const before = svc.runDetail(run.id);
  expect(before.data).toMatchObject({ state: "succeeded", exitCode: 0, finishedAt: expect.any(String), sessionId: "sess-1", terminalReleasePending: true });
  expect(before.body).toContain("原结果");
  expect(calls.filter(({ capability }) => capability === "agent.sessions.release")).toEqual([{ capability: "agent.sessions.release", input: { id: "sess-1", requestId: `autorun-${run.id}` }, key: `autorelease-${run.id}` }]);

  calls.length = 0;
  const foreign = open("b".repeat(64)).svc;
  await foreign.reconcileTerminals();
  svc.abortAll();
  await svc.reconcileTerminals();
  expect(calls).toEqual([]);

  unavailable = false;
  const restarted = open().svc;
  await restarted.reconcileTerminals();
  await restarted.reconcileTerminals();
  const after = restarted.runDetail(run.id);
  expect(after.data).toEqual({ ...before.data, terminalReleasePending: false });
  expect(after.body).toBe(before.body);
  expect(calls).toEqual([{ capability: "agent.sessions.release", input: { id: "sess-1", requestId: `autorun-${run.id}` }, key: `autorelease-${run.id}` }]);
});

test("定时终端在原计划点的运行写入前中断，重启从启用时刻补回该计划点", async () => {
  let now = new Date("2026-11-10T11:56:00Z");
  const { svc, repo, open, calls } = setup({ now: () => now });
  const rule = await terminalRule(svc);
  now = terminalSlot;
  const interruptedWrite = vi.spyOn(repo, "create").mockRejectedValueOnce(new Error("运行持久写入前中断"));
  await expect(svc.activateNonAgent(rule.id, "schedule", terminalSlot)).rejects.toThrow("运行持久写入前中断");
  const restarted = open().svc;
  expect(restarted.activations()).toEqual([]);
  expect(terminalLaunches(calls)).toHaveLength(0);

  const activate = vi.fn((id: string, at: Date) => restarted.activateNonAgent(id, "schedule", at).then(() => undefined));
  const scheduler = new Scheduler({ activate, lastActivatedFor: (id) => restarted.lastActivatedFor(id), now: () => now });
  try {
    scheduler.sync([{ id: rule.id, enabled: true, cron: every5.cron, zone: every5.zone, missedRunGraceMinutes: 30, updatedAt: rule.data.updatedAt }]);
    expect(activate).toHaveBeenCalledExactlyOnceWith(rule.id, terminalSlot, "schedule");
    await activate.mock.results[0]?.value;
  } finally {
    scheduler.stop();
  }
  expect(restarted.runs()).toHaveLength(1);
  expect(restarted.runs()[0]?.id).toBe(interruptedWrite.mock.calls[0]?.[3]);
  expect(restarted.activations()).toEqual([expect.objectContaining({ scheduledFor: "2026-11-10T12:00:00Z", summary: { state: "succeeded" } })]);
  expect(terminalLaunches(calls)).toHaveLength(1);
});

test("运行已经写入且能证明尚未提交时，重启继续原运行和 requestId", async () => {
  const { svc, repo, open, calls, d } = setup();
  const rule = await terminalRule(svc);
  vi.spyOn(repo, "patch").mockRejectedValueOnce(new Error("提交标记写入前中断"));
  await expect(svc.activateNonAgent(rule.id, "schedule", terminalSlot)).rejects.toThrow("提交标记写入前中断");
  expect(terminalLaunches(calls)).toHaveLength(0);
  expect(existsSync(path.join(d, "act"))).toBe(false);
  const restarted = open().svc;
  const [original] = restarted.runs();
  const [activation] = restarted.activations();
  expect(restarted.runDetail(original!.id).data).toMatchObject({ terminalLaunch: { submittedAt: null }, activationId: activation!.activationId });
  expect(restarted.lastActivatedFor(rule.id)).toEqual(terminalSlot);
  await restarted.reconcileTerminals();
  await restarted.idle();
  expect(restarted.runs()).toEqual([expect.objectContaining({ id: original!.id, state: "succeeded" })]);
  expect(restarted.activations()).toEqual([expect.objectContaining({ activationId: activation!.activationId, summary: { state: "succeeded" } })]);
  expect(terminalLaunches(calls)).toEqual([expect.objectContaining({ key: `autorun-${original!.id}`, input: expect.objectContaining({ requestId: `autorun-${original!.id}` }) })]);
});

test.each(["规则", "规则停用", "Space", "受保护配置"])("尚未提交的原运行遇到%s变化时保留待核对状态", async (changed) => {
  let revision = 1;
  const { svc, repo, open, calls, root } = setup({ spaceRevision: () => revision });
  const rule = await terminalRule(svc);
  const file = `.huhu/module-credentials/${createHash("sha256")
    .update(JSON.stringify(["automations"]))
    .digest("hex")}.json`;
  const files = new VaultFiles(root);
  const writeEnvironment = () =>
    files.write(file, Buffer.from(JSON.stringify({ format: 1, entries: [{ entityId: rule.id, revision: randomUUID(), definition: { format: 1, names: ["FIXTURE"], fingerprint: "a".repeat(64) }, configured: [] }] })));
  if (changed === "受保护配置") await writeEnvironment();
  vi.spyOn(repo, "patch").mockRejectedValueOnce(new Error("提交标记写入前中断"));
  await expect(svc.activateNonAgent(rule.id, "schedule", terminalSlot)).rejects.toThrow("提交标记写入前中断");
  const runId = svc.runs()[0]!.id;
  if (changed === "规则") await svc.update(rule.id, rule.version, { action: { ...terminalAction, command: "echo changed" } });
  if (changed === "规则停用") await svc.setEnabled(rule.id, false);
  if (changed === "Space") revision++;
  if (changed === "受保护配置") await writeEnvironment();
  const restarted = open().svc;
  await restarted.reconcileTerminals();
  await restarted.idle();
  await restarted.reconcileTerminals();
  expect(restarted.runs()).toEqual([expect.objectContaining({ id: runId, state: "unknown", live: false })]);
  expect(restarted.runDetail(runId).body).toContain("原计划未提交");
  expect(restarted.activations()).toEqual([expect.objectContaining({ summary: { state: "unknown" } })]);
  expect(terminalLaunches(calls)).toHaveLength(0);
});

test.each([false, true])("确认边界后的中断只核对原请求（Core 已创建终端：%s）", async (coreAccepted) => {
  let disconnected = true;
  const { svc, repo, open, calls, sessions } = setup({ terminal: { unavailable: () => disconnected } });
  const rule = await terminalRule(svc);
  const patch = repo.patch.bind(repo);
  vi.spyOn(repo, "patch").mockImplementation(async (...args) => {
    const [, , changes] = args;
    if (coreAccepted && changes["sessionId"]) {
      svc.abortAll();
      throw new Error("Core 已创建终端，启动确认未写回");
    }
    const persisted = await patch(...args);
    if (!coreAccepted && changes["terminalLaunch"]) svc.abortAll();
    return persisted;
  });
  const first = await svc.activateNonAgent(rule.id, "schedule", terminalSlot);
  const runId = svc.runs()[0]!.id;
  const requestId = `autorun-${runId}`;
  expect(svc.runDetail(runId).data).toMatchObject({ state: "running", sessionId: null, terminalLaunch: { submittedAt: expect.any(String) } });
  expect(terminalLaunches(calls)).toHaveLength(Number(coreAccepted));
  const restarted = open().svc;
  await restarted.reconcileTerminals();
  expect(restarted.runDetail(runId).data["state"]).toBe("unknown");
  disconnected = false;
  sessions.set("other", { id: "other", requestId: `${requestId}-other`, state: "exited", exitCode: 0 });
  await restarted.reconcileTerminals();
  await restarted.idle();
  const state = coreAccepted ? "succeeded" : "unknown";
  expect(restarted.runDetail(runId).data).toMatchObject({ state, sessionId: coreAccepted ? "sess-1" : null });
  expect(await restarted.activateNonAgent(rule.id, "schedule", terminalSlot)).toMatchObject({ activationId: first.activationId, summary: { state } });
  expect(restarted.runs()).toHaveLength(1);
  expect(terminalLaunches(calls)).toHaveLength(Number(coreAccepted));
});

test("历史 NDJSON 的孤立发生和中断半行仍可查询，同一计划点不再启动", async () => {
  const { svc, d, open, calls } = setup();
  const rule = await terminalRule(svc);
  const actDir = path.join(d, "act");
  mkdirSync(actDir);
  const previous = { activationId: "act-legacy", ruleId: rule.id, trigger: "schedule", startedAt: "2026-11-10T12:00:00Z", scheduledFor: "2026-11-10T12:00:00Z" };
  const file = path.join(actDir, "2026-11.ndjson");
  const bytes = `${JSON.stringify(previous)}\n{"activationId":"act-legacy", "summ`;
  writeFileSync(file, bytes);
  const { svc: restarted, repo } = open();
  await restarted.reconcileTerminals();
  expect(restarted.lastActivatedFor(rule.id)).toEqual(terminalSlot);
  const unknown = { ...previous, summary: { state: "unknown" } };
  expect(restarted.activations()).toEqual([unknown]);
  expect(await restarted.activateNonAgent(rule.id, "schedule", terminalSlot)).toEqual(unknown);
  expect(restarted.runs()).toHaveLength(0);
  expect(calls).toEqual([]);
  expect(readFileSync(file, "utf8")).toBe(bytes);

  const finishedAt = "2026-11-10T12:01:00Z";
  await repo.create("automation-run", { activationId: previous.activationId, ruleId: rule.id, actionKind: "terminal", trigger: "schedule", state: "succeeded", finishedAt }, "");
  expect(restarted.activations()).toEqual([{ ...previous, finishedAt, summary: { state: "succeeded" } }]);
  expect(readFileSync(file, "utf8")).toBe(bytes);
});

test("同槽并发共用持久运行，跨服务保留同一个运行和原请求", async () => {
  const { svc, repo, open, calls } = setup();
  const rule = await terminalRule(svc);
  const create = repo.create.bind(repo);
  let entered!: () => void;
  let release!: () => void;
  const entering = new Promise<void>((resolve) => (entered = resolve));
  const releasing = new Promise<void>((resolve) => (release = resolve));
  vi.spyOn(repo, "create").mockImplementationOnce(async (...args) => {
    entered();
    await releasing;
    return create(...args);
  });
  const first = svc.activateNonAgent(rule.id, "schedule", terminalSlot);
  await entering;
  const duplicate = svc.activateNonAgent(rule.id, "schedule", terminalSlot);
  const other = await open().svc.activateNonAgent(rule.id, "schedule", terminalSlot).finally(release);
  const results = await Promise.all([first, duplicate]);
  expect(results).toEqual([other, other]);
  expect(svc.activations()).toEqual([other]);
  const [run] = svc.runs();
  expect(svc.runs()).toHaveLength(1);
  expect(terminalLaunches(calls)).toEqual([expect.objectContaining({ key: `autorun-${run!.id}` })]);
});

test.each([false, true])("其他 Vault 的同一计划点不重启也不认领匹配的会话（已记录提交：%s）", async (submitted) => {
  const { svc, repo, open, calls, sessions, root } = setup();
  const rule = await terminalRule(svc);
  vi.spyOn(repo, "patch").mockRejectedValueOnce(new Error("提交标记写入前中断"));
  await expect(svc.activateNonAgent(rule.id, "schedule", terminalSlot)).rejects.toThrow("提交标记写入前中断");
  const pending = repo.list("automation-run")[0]!;
  const launch = pending.data["terminalLaunch"] as { fingerprint: string };
  const original = submitted ? await repo.patch("automation-run", pending.id, { sessionId: "copied", terminalLaunch: { ...launch, submittedAt: terminalSlot.toISOString() } }, pending.version) : pending;
  const file = path.join(root, original.path);
  const bytes = readFileSync(file);
  sessions.set("copied", { id: "copied", requestId: `autorun-${original.id}`, state: "exited", exitCode: 0 });
  calls.length = 0;
  const copied = open("b".repeat(64)).svc;
  await copied.reconcileTerminals();
  await copied.idle();
  expect(copied.runDetail(original.id).data).toMatchObject({ state: "unknown", sessionId: null });
  expect(copied.runs()).toEqual([expect.objectContaining({ id: original.id, state: "unknown", live: false })]);
  expect(await copied.activateNonAgent(rule.id, "schedule", terminalSlot)).toEqual(copied.activations()[0]);
  expect(calls).toEqual([]);
  expect(readFileSync(file)).toEqual(bytes);
});

test.each([new HuhuError("RUN_UNKNOWN", "终端启动回执未收到"), new HuhuError("INVALID_INPUT", "规则的本机环境不可用", { details: { reason: "operation-failed" } }), Object.assign(new Error("启动连接断开"), { code: "EPIPE" })])(
  "原启动的回执丢失（$message）时只核对原会话，定时发生重交不会再启动",
  async (lostReply) => {
    let disconnected = true;
    const { svc, calls, sessions } = setup({ terminal: { lostReply, output: "原命令已完成", unavailable: () => disconnected } });
    const rule = await svc.create({ title: "原终端规则", trigger: every5, action: { kind: "terminal", command: "echo local", shell: "default", spaceId: null, envRefs: {} } });
    await svc.setEnabled(rule.id, true);
    const slot = new Date("2026-11-10T12:00:00Z");
    const first = await svc.activateNonAgent(rule.id, "schedule", slot);
    expect(first.summary).toEqual({ state: "unknown" });
    expect(first.finishedAt).toBeUndefined();
    const run = svc.runs()[0]!;
    expect(svc.runDetail(run.id).data).toMatchObject({ state: "unknown", sessionId: null, finishedAt: null, terminalOwner });
    await svc.reconcileTerminals();
    expect(svc.runDetail(run.id).data["state"]).toBe("unknown");
    expect(await svc.activateNonAgent(rule.id, "schedule", slot)).toEqual(first);
    disconnected = false;
    sessions.set("unrelated", { id: "unrelated", requestId: "other", state: "running", exitCode: null });
    await svc.reconcileTerminals();
    await svc.idle();
    expect(svc.runDetail(run.id)).toMatchObject({ data: { state: "succeeded", sessionId: "sess-1" } });
    expect(svc.runDetail(run.id).body).toContain("原命令已完成");
    expect(await svc.activateNonAgent(rule.id, "schedule", slot)).toMatchObject({ activationId: first.activationId, summary: { state: "succeeded" }, finishedAt: expect.any(String) });
    expect(calls.filter(({ capability }) => capability === "agent.sessions.launch")).toHaveLength(1);
    expect(calls.filter(({ capability }) => capability === "agent.sessions.kill")).toHaveLength(0);
  },
);
