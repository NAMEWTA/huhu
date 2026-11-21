import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { LocalProtectionError, ModuleCredentials } from "@huhu/kernel";
import { exportPackage, importPackage, machineId, VaultFiles } from "@huhu/vault";
import { HerdrCore } from "@huhu/plugin-agent-cli/engine";
import { AutomationsService } from "@huhu/plugin-automations/engine";
import { unzipSync } from "fflate";
import { assert, expect, test, vi } from "vitest";
import { z } from "zod";
import { boot, type RunningEngine } from "../src/boot.js";
import { HerdrClient } from "../../../packages/herdr-client/src/index.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";

const definition = { target: "test.invalid" };

function moduleOwner(engine: RunningEngine) {
  assert(engine.moduleCredentialHost);
  return new ModuleCredentials({
    ...engine.moduleCredentialHost,
    vault: engine.vault,
    pluginId: "test.native.module",
    definition: z.strictObject({ target: z.string() }),
    targets: (value) => ({ password: value.target }),
  });
}

test("系统钥匙串中的模块凭据与 Safe 锁独立，ZIP 恢复到新目录不继承系统密钥", { timeout: 30_000 }, async ({ skip }) => {
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-module-host-"));
  const desktopUserData = path.join(fixture, "user-data");
  const vaultPath = path.join(fixture, "source");
  const restoredPath = path.join(fixture, "restored");
  const archive = path.join(fixture, "vault.zip");
  const marker = `synthetic-module-${randomUUID()}`;
  const keyIds = new Set<string>();
  let source: RunningEngine | undefined;
  let restored: RunningEngine | undefined;
  mkdirSync(desktopUserData);
  mkdirSync(vaultPath);

  async function safe(engine: RunningEngine, capability: string, input: unknown = {}) {
    const result = await engine.dispatcher.call("desktop", { capability, input, requestId: randomUUID() });
    assert(result.ok);
    return result.data;
  }

  try {
    source = await boot({ vaultPath, desktopUserData, create: true });
    assert(source.moduleCredentialHost);
    const { protection } = source.moduleCredentialHost;
    const probeId = `huhu/test/module-credentials/${randomUUID()}`;
    const probeKey = Buffer.alloc(32, 1);
    try {
      await protection.create(probeId, probeKey);
    } catch (error) {
      if (error instanceof LocalProtectionError && error.reason === "unavailable") skip("当前会话的系统钥匙串不可用");
      throw error;
    }
    keyIds.add(probeId);
    await expect(protection.create(probeId, Buffer.alloc(32, 2))).rejects.toMatchObject({ reason: "unavailable" });
    await expect(protection.read(probeId)).resolves.toEqual(probeKey);

    const create = protection.create.bind(protection);
    const created = vi.spyOn(protection, "create").mockImplementation(async (keyId, key) => {
      await create(keyId, key);
      keyIds.add(keyId);
    });
    const vaultId = source.vault.id;
    const { localVaultInstanceId: instanceId } = source.moduleCredentialHost;
    await safe(source, "safe.setup", { password: "fixture-only-test-safe" });
    await safe(source, "safe.lock");
    expect(await safe(source, "safe.status")).toMatchObject({ initialized: true, locked: true });

    const saved = await moduleOwner(source).save({ entityId: "fixture", expectedRevision: null, definition, actions: [{ purpose: "password", action: "replace", value: marker }] });
    expect(created).toHaveBeenCalledTimes(1);
    const keyId = created.mock.calls[0]![0];
    created.mockRestore();
    expect(saved.authState.password).toBe("configured");
    expect(await moduleOwner(source).use("fixture", ["password"], async (_, keys) => keys.get("password") === marker)).toBe(true);

    const manifest = await exportPackage(vaultPath, archive);
    expect(manifest.files.some(({ path: file }) => file.startsWith(".huhu/module-credentials/"))).toBe(true);
    expect(Object.values(unzipSync(readFileSync(archive))).some((bytes) => Buffer.from(bytes).includes(marker))).toBe(false);
    expect(importPackage(archive, restoredPath).vaultId).toBe(vaultId);

    await source.shutdown();
    source = await boot({ vaultPath, desktopUserData });
    expect(source.moduleCredentialHost?.localVaultInstanceId).toBe(instanceId);
    expect(await safe(source, "safe.status")).toMatchObject({ initialized: true, locked: true });
    expect(await moduleOwner(source).use("fixture", ["password"], async (_, keys) => keys.get("password") === marker)).toBe(true);

    restored = await boot({ vaultPath: restoredPath, desktopUserData });
    expect(restored.moduleCredentialHost?.localVaultInstanceId).not.toBe(instanceId);
    expect((await moduleOwner(restored).list())[0]).toMatchObject({ revision: saved.revision, authState: { password: "needs-reconfiguration" } });
    await expect(moduleOwner(restored).use("fixture", ["password"], async () => true)).rejects.toMatchObject({ code: "unbound" });

    const cleared = await moduleOwner(source).save({ entityId: "fixture", expectedRevision: saved.revision, definition, actions: [{ purpose: "password", action: "clear" }] });
    expect(cleared.authState.password).toBe("unconfigured");
    await expect(moduleOwner(source).use("fixture", ["password"], async () => true)).rejects.toMatchObject({ code: "unconfigured" });
    await expect(protection.read(keyId)).resolves.toBeNull();
  } finally {
    try {
      const protection = source?.moduleCredentialHost?.protection;
      if (protection) {
        await Promise.all(
          [...keyIds].map(async (keyId) => {
            await protection.remove(keyId);
            await expect(protection.read(keyId)).resolves.toBeNull();
          }),
        );
      }
    } finally {
      await Promise.all([restored?.shutdown(), source?.shutdown()]);
      rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  }
});

test("本机保护不可用时，取用和重新配置均失败并保留原密文", async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-module-unavailable-"));
  const desktopUserData = path.join(fixture, "user-data");
  const vaultPath = path.join(fixture, "vault");
  mkdirSync(desktopUserData);
  mkdirSync(vaultPath);
  const protection = new TestProtection(desktopUserData);
  let engine: RunningEngine | undefined;
  try {
    engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection, create: true });
    assert(engine.moduleCredentialHost);
    expect(engine.moduleCredentialHost.protection).toBe(protection);
    const owner = moduleOwner(engine);
    const marker = `synthetic-module-${randomUUID()}`;
    const saved = await owner.save({ entityId: "fixture", expectedRevision: null, definition, actions: [{ purpose: "password", action: "replace", value: marker }] });
    const { localRoot } = engine.moduleCredentialHost;
    const ciphertext = () =>
      readdirSync(localRoot, { recursive: true, encoding: "utf8" })
        .filter((file) => file.endsWith(".bin"))
        .map((file) => [file, readFileSync(path.join(localRoot, file))] as const);
    const original = ciphertext();
    expect(original).toHaveLength(1);
    expect(original[0]?.[1].includes(marker)).toBe(false);

    const create = vi.spyOn(protection, "create");
    protection.unavailable = "unavailable";
    await expect(owner.use("fixture", ["password"], async () => true)).rejects.toMatchObject({ code: "unavailable" });
    await expect(owner.save({ entityId: "fixture", expectedRevision: saved.revision, definition, actions: [{ purpose: "password", action: "replace", value: "synthetic-replacement", reconfigure: true }] })).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(create).not.toHaveBeenCalled();
    expect(ciphertext()).toEqual(original);
    expect(await owner.list()).toMatchObject([{ revision: saved.revision, authState: { password: "temporarily-unavailable" } }]);

    protection.unavailable = undefined;
    expect(await owner.use("fixture", ["password"], async (_, keys) => keys.get("password") === marker)).toBe(true);
  } finally {
    await engine?.shutdown();
    rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  }
});

test("Agent 启动环境的受保护变量随本机保存，ZIP 只保留配置", async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-agent-environment-"));
  const vaultPath = path.join(fixture, "vault");
  const desktopUserData = path.join(fixture, "app-data");
  const archive = path.join(fixture, "profiles.zip");
  const restoredPath = path.join(fixture, "restored");
  const protectedValue = `synthetic-agent-value-${randomUUID()}`;
  const variable = "FIXTURE_PROTECTED";
  const publicFields = { name: "测试环境", provider: "codex", ordinary: [{ name: "FIXTURE_ORDINARY", value: "portable-fixture" }], protectedNames: [variable] };
  const prefix = "agent.launch.environments";
  const identity = z.object({ id: z.uuidv4(), revision: z.uuidv4() });
  let source: RunningEngine | undefined;
  let restored: RunningEngine | undefined;
  const call = (engine: RunningEngine, capability: string, input: unknown = {}, caller: Parameters<RunningEngine["dispatcher"]["call"]>[0] = "desktop") =>
    engine.dispatcher.call(caller, { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
  const data = async (...args: Parameters<typeof call>) => {
    const outcome = await call(...args);
    assert(outcome.ok);
    return outcome.data;
  };
  try {
    mkdirSync(vaultPath);
    mkdirSync(desktopUserData);
    source = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: new TestProtection(desktopUserData), create: true });
    const input = { ...publicFields, expectedRevision: null, changes: [{ name: variable, action: "replace", value: protectedValue }] };
    expect(await call(source, `${prefix}.save`, input, "cli")).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect(await call(source, `${prefix}.save`, input, "web:fixture")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    const record = await data(source, `${prefix}.save`, input);
    const { id, revision } = identity.parse(record);
    expect(record).toMatchObject({ ...publicFields, states: { [variable]: "configured" } });
    expect(JSON.stringify(record).includes(protectedValue)).toBe(false);
    await data(source, "safe.setup", { password: "fixture-only-agent-safe" });
    await data(source, "safe.lock");
    expect(await data(source, `${prefix}.list`)).toMatchObject({ profiles: [record] });
    await data(source, "plugins.setEnabled", { id: "safe", enabled: false });
    expect(await data(source, `${prefix}.list`)).toMatchObject({ profiles: [record] });

    await exportPackage(vaultPath, archive);
    const restoredEntries = Object.entries(unzipSync(readFileSync(archive)));
    const bytes = restoredEntries.map(([, entry]) => entry);
    expect(bytes.some((entry) => Buffer.from(entry).includes(protectedValue))).toBe(false);
    expect(restoredEntries.some(([entryPath, entry]) => entryPath.startsWith(".huhu/module-credentials/") && Buffer.from(entry).includes("portable-fixture"))).toBe(true);
    importPackage(archive, restoredPath, { regenerateId: true });
    restored = await boot({ vaultPath: restoredPath, desktopUserData, moduleCredentialProtection: new TestProtection(desktopUserData) });
    expect(await data(restored, `${prefix}.list`)).toMatchObject({ profiles: [{ id, revision, ...publicFields, states: { [variable]: "needs-reconfiguration" } }] });

    const clear = { ...publicFields, id, expectedRevision: revision, protectedNames: [] };
    expect(await call(source, `${prefix}.save`, { ...clear, changes: [] })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const cleared = await data(source, `${prefix}.save`, { ...clear, changes: [{ name: variable, action: "clear" }] });
    expect(cleared).toMatchObject({ id, protectedNames: [], states: {} });
    expect(await call(source, `${prefix}.save`, { ...clear, changes: [{ name: variable, action: "clear" }] })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  } finally {
    try {
      if (source) {
        const list = z.object({ profiles: z.array(identity) }).parse(await data(source, `${prefix}.list`));
        for (const { id, revision } of list.profiles) await data(source, `${prefix}.remove`, { id, expectedRevision: revision });
      }
    } finally {
      await Promise.all([restored?.shutdown(), source?.shutdown()]);
      rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  }
});

const coreBinary = process.env["HUHU_AGENT_LAUNCH_TEST_BIN"];
// Rule approval only accepts Windows PowerShell targets.
test.skipIf(process.platform !== "win32" || process.arch !== "x64")(
  "环境改名仅在配置成功发布后使当前批准失效",
  async () => {
    const fixture = mkdtempSync(path.join(tmpdir(), "huhu-approval-names-"));
    const vaultPath = path.join(fixture, "vault");
    const desktopUserData = path.join(fixture, "app");
    let engine: RunningEngine | undefined;
    const original = "HUHU_RULE_SECRET_ORIGINAL";
    const renamed = "HUHU_RULE_SECRET_RENAMED";
    const env = "automations.terminal.environment";
    const approval = "automations.terminal.approval";
    const status = "automations.terminal.external.status";
    const call = (capability: string, input: unknown, caller: "desktop" | "cli" = "desktop") => engine!.dispatcher.call(caller, { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
    const data = async <T>(capability: string, input: unknown) => {
      const result = await call(capability, input);
      assert(result.ok);
      return result.data as T;
    };
    try {
      mkdirSync(vaultPath);
      mkdirSync(desktopUserData);
      engine = await boot({ vaultPath, desktopUserData, create: true });
      const rule = await data<{ id: string }>("automations.create", {
        title: "批准名称夹具",
        trigger: { preset: "custom", cron: "0 0 1 1 *", zone: "UTC" },
        action: { kind: "terminal", command: "Write-Output 'fixture'", shell: "powershell", spaceId: null },
      });
      const id = { ruleId: rule.id };
      const save = (expectedRevision: string | null, names: string[], removed?: string) => data<{ revision: string }>(`${env}.save`, { ...id, expectedRevision, names, changes: removed ? [{ name: removed, action: "clear" }] : [] });
      const first = await save(null, [original]);
      const definitionDir = path.join(vaultPath, ".huhu", "module-credentials");
      const files = readdirSync(definitionDir);
      expect(files).toHaveLength(1);
      const definitionPath = path.join(definitionDir, files[0]!);
      const originalDefinition = readFileSync(definitionPath);
      const approve = async () => {
        const target = await data<{ ruleVersion: string; target: string; names: string[]; approvalId: string | null }>(`${approval}.review`, id);
        return data<{ approvalId: string }>(`${approval}.approve`, { ...id, expectedRuleVersion: target.ruleVersion, target: target.target, names: target.names, expectedApprovalId: target.approvalId });
      };
      const granted = await approve();
      await data("gateway.update", { capability: status, exposed: true });
      expect(await call(status, id, "cli")).toMatchObject({ ok: true, data: { revision: first.revision } });

      const write = VaultFiles.prototype.write;
      const failure = vi.spyOn(VaultFiles.prototype, "write").mockImplementation(async function (this: VaultFiles, ...args) {
        if (args[0].startsWith(".huhu/module-credentials/")) throw new Error("配置发布被阻止");
        return write.apply(this, args);
      });
      try {
        expect(await call(`${env}.save`, { ...id, expectedRevision: first.revision, names: [renamed], changes: [{ name: original, action: "clear" }] })).toMatchObject({ ok: false });
        expect(failure.mock.calls.some(([file]) => file.startsWith(".huhu/module-credentials/"))).toBe(true);
      } finally {
        failure.mockRestore();
      }
      expect(await call(`${approval}.review`, id)).toMatchObject({ ok: true, data: { names: [original], approvalId: granted.approvalId } });
      expect(await call(status, id, "cli")).toMatchObject({ ok: true, data: { revision: first.revision, states: { [original]: "unconfigured" } } });

      const afterRename = await save(first.revision, [renamed], original);
      expect(await call(status, id, "cli")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      const renamedDefinition = readFileSync(definitionPath);
      await engine.shutdown();
      writeFileSync(definitionPath, originalDefinition);
      engine = await boot({ vaultPath, desktopUserData });
      expect(await call(`${env}.get`, id)).toMatchObject({ ok: true, data: { revision: first.revision, names: [original] } });
      expect(await call(status, id, "cli")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      writeFileSync(definitionPath, renamedDefinition);
      const restored = await save(afterRename.revision, [original], renamed);
      expect(await call(status, id, "cli")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect((await approve()).approvalId).not.toBe(granted.approvalId);
      expect(await call(status, id, "cli")).toMatchObject({ ok: true, data: { revision: restored.revision } });
    } finally {
      await engine?.shutdown();
      rmSync(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    }
  },
  30_000,
);

test.skipIf(process.platform !== "win32" || process.arch !== "x64" || !coreBinary)(
  "Windows 工作台手动与定时规则在凭据 lease 内拒绝同目标轮换后的修订",
  async () => {
    const fixture = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-rule-lease-")));
    const vaultPath = path.join(fixture, "vault");
    const desktopUserData = path.join(fixture, "app");
    let engine: RunningEngine | undefined;
    let ruleId: string | undefined;
    let revision: string | null = null;
    let rotate = false;
    let starts = 0;
    const name = "HUHU_RULE_SECRET_LEASE";
    const observe = vi.spyOn(AutomationsService.prototype, "activateNonAgent");
    const actualCall = HerdrClient.prototype.call;
    const count = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, params?: unknown) {
      if (method === "terminal.run") starts++;
      return (await actualCall.call(this, method, params)) as T;
    });
    const call = async <T>(capability: string, input: unknown = {}) => {
      assert(engine);
      const result = await engine.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
      if (!result.ok) throw new Error(result.error.message);
      return result.data as T;
    };
    const replace = async () => {
      const saved = await call<{ revision: string }>("automations.terminal.environment.save", { ruleId, names: [name], expectedRevision: revision, changes: [{ name, action: "replace", value: `synthetic-lease-${randomUUID()}` }] });
      revision = saved.revision;
    };
    const actualUse = ModuleCredentials.prototype.use;
    const lease = vi.spyOn(ModuleCredentials.prototype, "use").mockImplementation(async function <R>(
      this: ModuleCredentials<unknown>,
      entityId: string,
      purposes: readonly string[],
      operation: (definition: unknown, values: ReadonlyMap<string, string>, revision: string) => Promise<R>,
    ) {
      if (rotate && entityId === ruleId) {
        rotate = false;
        // 已经过 Automations 最后一次外层比对。故意在 ModuleCredentials 捕获 lease 之前提交同一目标的新版本。
        await replace();
      }
      return (await actualUse.call(this, entityId, purposes, operation)) as R;
    });
    try {
      vi.stubEnv("HUHU_HERDR_BIN", coreBinary!);
      mkdirSync(vaultPath);
      mkdirSync(desktopUserData);
      engine = await boot({ vaultPath, desktopUserData, create: true });
      const rule = await call<{ id: string }>("automations.create", {
        title: "本机凭据修订竞态夹具",
        trigger: { preset: "custom", cron: "0 0 1 1 *", zone: "UTC" },
        action: { kind: "terminal", command: "if (-not $env:HUHU_RULE_SECRET_LEASE) { exit 7 }; Write-Output 'lease-ok'", shell: "powershell", spaceId: null },
      });
      ruleId = rule.id;
      await replace();
      const initial = revision;
      rotate = true;
      const manual = await call<{ activationId: string; summary: { state: string } }>("automations.runNow", { id: rule.id });
      expect(manual.summary.state).toBe("failed");
      expect(revision).not.toBe(initial);
      expect(starts).toBe(0);
      const service = observe.mock.contexts[0] as AutomationsService | undefined;
      assert(service);

      await call("automations.setEnabled", { id: rule.id, enabled: true });
      const slot = new Date();
      const beforeSchedule = revision;
      rotate = true;
      const scheduled = await service.activateNonAgent(rule.id, "schedule", slot);
      expect(scheduled.summary).toEqual({ state: "failed" });
      expect(revision).not.toBe(beforeSchedule);
      expect(await service.activateNonAgent(rule.id, "schedule", slot)).toEqual(scheduled);
      await service.reconcileTerminals();
      await service.idle();
      expect(starts).toBe(0);
      expect(service.runs()).toHaveLength(2);

      expect((await call<{ summary: { state: string } }>("automations.runNow", { id: rule.id })).summary.state).toBe("succeeded");
      expect(starts).toBe(1);
    } finally {
      try {
        if (engine && revision && ruleId) await call("automations.terminal.environment.save", { ruleId, names: [name], expectedRevision: revision, changes: [{ name, action: "clear" }] });
      } finally {
        await engine?.shutdown();
        lease.mockRestore();
        count.mockRestore();
        observe.mockRestore();
        vi.unstubAllEnvs();
        if (path.dirname(fixture) === realpathSync(tmpdir()) && path.basename(fixture).startsWith("huhu-rule-lease-")) rmSync(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
      }
    }
  },
  60_000,
);

test.skipIf(process.platform !== "win32" || process.arch !== "x64" || !coreBinary)(
  "Windows 自动化用同一请求只启动一次，本机规则环境不进入 Core 或 ZIP",
  async () => {
    const fixture = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-rule-environment-")));
    const vaultPath = path.join(fixture, "vault");
    const desktopUserData = path.join(fixture, "app-data");
    const restoredPath = path.join(fixture, "restored");
    const archive = path.join(fixture, "rules.zip");
    const privateValue = `fixture-terminal-value-${randomUUID()}`;
    const name = "HUHU_TEST_PROTECTED";
    const requestId = randomUUID();
    let source: RunningEngine | undefined;
    let restored: RunningEngine | undefined;
    let core: HerdrCore | undefined;
    let ruleId: string | undefined;
    let revision: string | undefined;
    const starts: unknown[] = [];
    let releaseAvailable = false;
    let released = 0;
    const actualCall = HerdrClient.prototype.call;
    const probe = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, params?: unknown) {
      if (method === "terminal.rm" && !releaseAvailable) throw new Error("释放暂不可用");
      const result = (await actualCall.call(this, method, params)) as T;
      if (method === "terminal.rm" && released++ === 0) throw new Error("关闭终端后丢失释放回包");
      if (method === "terminal.run") {
        starts.push(params);
        if (starts.length === 1) throw new Error("合成 Core 启动回包丢失");
      }
      return result;
    });
    const action = (engine: RunningEngine, capability: string, input: unknown = {}, key = randomUUID()) => engine.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: key });
    const data = async <T>(...args: Parameters<typeof action>): Promise<T> => {
      const reply = await action(...args);
      if (!reply.ok) throw new Error(reply.error.message);
      return reply.data as T;
    };
    try {
      vi.stubEnv("HUHU_HERDR_BIN", coreBinary!);
      mkdirSync(vaultPath);
      mkdirSync(desktopUserData);
      source = await boot({ vaultPath, desktopUserData, create: true });
      core = new HerdrCore({ bin: coreBinary!, vaultId: source.vault.id, machineId: machineId(), runtimeDir: path.join(source.vault.runtimeDir, "herdr") });
      await data(source, "safe.setup", { password: "only-a-synthetic-password" });
      await data(source, "safe.lock");
      const command =
        "if (-not $env:HUHU_TEST_PROTECTED) { exit 7 }; [Console]::Write('env-received:'); [Console]::Write($env:HUHU_TEST_PROTECTED.Substring(0, 4)); Start-Sleep -Milliseconds 30; [Console]::WriteLine($env:HUHU_TEST_PROTECTED.Substring(4))";
      const rule = await data<{ id: string; version: string }>(source, "automations.create", {
        title: "受保护的测试规则",
        trigger: { preset: "every15", cron: "*/15 * * * *", zone: "UTC" },
        action: { kind: "terminal", command, shell: "powershell", spaceId: null },
      });
      ruleId = rule.id;
      const prefix = "automations.terminal.environment";
      const entry = await data<{ revision: string }>(source, `${prefix}.save`, { ruleId, expectedRevision: null, names: [name], changes: [{ name, action: "replace", value: privateValue }] });
      revision = entry.revision;
      expect(entry).toMatchObject({ names: [name], states: { [name]: "configured" } });
      expect(JSON.stringify(entry)).not.toContain(privateValue);
      const run = () => data(source!, "automations.runNow", { id: ruleId }, requestId);
      const [first, replay] = await Promise.all([run(), run()]);
      expect(first).toEqual(replay);
      expect(first).toMatchObject({ summary: { state: "succeeded" } });
      expect(starts).toHaveLength(1);
      expect(starts[0]).toMatchObject({ env: { ELECTRON_RUN_AS_NODE: "1" }, argv: ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", expect.any(String)] });
      expect(JSON.stringify(starts)).not.toContain(privateValue);
      const {
        argv: [executable, ...previousArgs],
      } = starts[0] as { argv: string[] };
      const relay = Buffer.from(previousArgs.at(-1)!, "base64").toString("utf16le");
      const configuration = /::FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(relay)?.[1];
      expect(configuration).toBeDefined();
      const helperArgs = JSON.parse(Buffer.from(configuration!, "base64").toString("utf8"));
      expect(helperArgs).toEqual([expect.any(String), expect.stringContaining("protected-launch-helper.cjs"), expect.stringMatching(/^\d+$/), expect.stringMatching(/^[a-f0-9]{64}$/)]);
      expect(relay).not.toContain(privateValue);
      expect(JSON.stringify(helperArgs)).not.toContain(privateValue);
      await expect(promisify(execFile)(executable!, previousArgs, { windowsHide: true })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("受保护的终端命令未能启动") });
      const [row] = await data<{ id: string; state: string }[]>(source, "automations.runs.list");
      const detail = await data<{ body: string; data: { sessionId: string; terminalReleasePending: boolean } }>(source, "automations.runs.read", { runId: row!.id });
      expect(detail.body).toContain("env-received:***");
      expect(JSON.stringify(detail)).not.toContain(privateValue);
      expect(detail.data).toMatchObject({ state: "succeeded", exitCode: 0, terminalReleasePending: true });
      expect(await action(source, "agent.sessions.release", { id: detail.data.sessionId, requestId: randomUUID() })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(JSON.stringify(await data(source, "agent.sessions.list", {}))).not.toContain(privateValue);
      await source.shutdown();
      releaseAvailable = true;
      source = await boot({ vaultPath, desktopUserData });
      await vi.waitFor(
        async () => {
          const reopened = await data<{ body: string; data: { terminalReleasePending: boolean } }>(source!, "automations.runs.read", { runId: row!.id });
          expect(reopened.data).toMatchObject({ state: "succeeded", exitCode: 0, terminalReleasePending: false });
          expect(reopened.body).toBe(detail.body);
        },
        { timeout: 13_000, interval: 300 },
      );
      expect(starts).toHaveLength(1);
      expect(released).toBe(1);

      await exportPackage(vaultPath, archive);
      expect(Object.values(unzipSync(readFileSync(archive))).some((bytes) => Buffer.from(bytes).includes(privateValue))).toBe(false);
      importPackage(archive, restoredPath);
      restored = await boot({ vaultPath: restoredPath, desktopUserData });
      expect(await data(restored, `${prefix}.get`, { ruleId })).toMatchObject({ names: [name], states: { [name]: "needs-reconfiguration" } });
      expect(await data(restored, "automations.runNow", { id: ruleId })).toMatchObject({ summary: { state: "failed" } });
      expect(starts).toHaveLength(1);
      await data(source, "automations.update", {
        id: ruleId,
        expectedVersion: rule.version,
        patch: { action: { kind: "terminal", command: "Write-Output '新的规则目标'", shell: "powershell", spaceId: null } },
      });
      expect(await data(source, `${prefix}.get`, { ruleId })).toMatchObject({ targetChanged: true });
      expect(await data(source, "automations.runNow", { id: ruleId })).toMatchObject({ summary: { state: "failed" } });
      expect(starts).toHaveLength(1);
    } finally {
      try {
        if (source && ruleId && revision) await data(source, "automations.terminal.environment.save", { ruleId, expectedRevision: revision, names: [], changes: [{ name, action: "clear" }] });
      } finally {
        await Promise.allSettled([restored?.shutdown(), source?.shutdown()]);
        await core?.stop();
        probe.mockRestore();
        vi.unstubAllEnvs();
        if (path.dirname(fixture) === realpathSync(tmpdir()) && path.basename(fixture).startsWith("huhu-rule-environment-")) rmSync(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
      }
    }
  },
  60_000,
);
