import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HerdrCore, workspacePackageSnapshot } from "@huhu/plugin-agent-cli/engine";
import * as kernel from "@huhu/kernel";
import { HuhuError } from "@huhu/contracts";
import { machineId, Vault } from "@huhu/vault";
import { unzipSync, zipSync } from "fflate";
import { assert, expect, test, vi } from "vitest";
import { HerdrClient } from "../../../packages/herdr-client/src/index.js";
import { importPackageTo } from "../../desktop/src/main/vault-session.js";
import { boot, type RunningEngine } from "../src/boot.js";
import { WORKSPACE_DOCUMENT, emptyLayout, leaves, placeSession, splitPane, type SpaceLayout, type WorkspaceLaunchView, type WorkspaceView } from "../../../plugins/agent-cli/src/shared/workspace-layout.js";

const coreBinary = process.env["HUHU_AGENT_LAUNCH_TEST_BIN"];

test("桌面数据包恢复已保存分栏且不恢复终端身份或启动目标 Core", async () => {
  const fixture = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-workspace-backup-")));
  const source = path.join(fixture, "source");
  const destination = path.join(fixture, "restored");
  const external = path.join(fixture, "external");
  const archive = path.join(fixture, "layout.zip");
  mkdirSync(source);
  mkdirSync(external);
  let engine: RunningEngine | undefined;
  const call = (capability: string, input: unknown) => engine!.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
  const data = async <T>(capability: string, input: unknown) => {
    const reply = await call(capability, input);
    assert(reply.ok, JSON.stringify(reply));
    return reply.data as T;
  };
  const listen = vi.spyOn(kernel, "startEngineServer").mockResolvedValue({ port: 0, close: async () => {} } as kernel.RunningServer);
  const ensure = vi.spyOn(HerdrCore.prototype, "ensure").mockRejectedValue(new Error("fixture prohibits Core startup"));
  const stopped: string[] = [];
  const stop = vi.spyOn(HerdrCore.prototype, "stop").mockImplementation(async function (this: HerdrCore) {
    stopped.push(this.endpoint);
  });
  const peek = vi.spyOn(HerdrCore.prototype, "peek").mockResolvedValue("absent");
  try {
    engine = await boot({ vaultPath: source, create: true });
    const [space] = await data<{ id: string }[]>("agent.spaces.list", {});
    assert(space);
    const outside = await data<{ id: string }>("agent.spaces.save", { name: "外部", root: external });
    const layout: SpaceLayout = {
      tabs: [
        {
          id: "source-tab",
          pane: { kind: "split", id: "source-edge", axis: "columns", ratio: 0.35, first: { kind: "leaf", id: "source-leaf", sessionId: "source-session-secret" }, second: { kind: "leaf", id: "source-empty", sessionId: null } },
        },
      ],
    };
    const sourceEndpoint = new HerdrCore({ bin: "unused", vaultId: engine.vault.id, machineId: machineId(), runtimeDir: path.join(engine.vault.runtimeDir, "herdr") }).endpoint;
    const rpc = vi.fn(async (method: string) => {
      if (method !== "doc.get") throw new Error(`Unexpected Core call: ${method}`);
      return { version: 9, value: { format: 1, spaces: { [space.id]: layout, [outside.id]: { tabs: [] } } } };
    });
    peek.mockImplementation(async function (this: HerdrCore) {
      return this.endpoint === sourceEndpoint ? ({ call: rpc } as unknown as HerdrClient) : "absent";
    });
    await data("vault.exportPackage", { dest: archive });
    await data("vault.importPackage", { zipPath: archive, targetDir: destination });
    const contents = unzipSync(readFileSync(archive));
    const snapshot = contents[".huhu/agent-cli/workspace-layout.snapshot.json"];
    expect(snapshot, "package should contain the layout projection").toBeDefined();
    expect(Buffer.from(snapshot!).toString()).not.toContain("source-session-secret");
    expect(Object.keys(contents).some((name) => name.startsWith(".huhu/runtime/"))).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);

    const snapshotPath = ".huhu/agent-cli/workspace-layout.snapshot.json";
    const badZip = path.join(fixture, "invalid.zip");
    const invalid = Buffer.from(JSON.stringify({ format: 1, spaces: { [space.id]: layout } }));
    const manifest = JSON.parse(Buffer.from(contents["huhu-package.json"]!).toString()) as { files: { path: string; sha256: string; size: number }[] };
    const invalidEntry = manifest.files.find(({ path: filename }) => filename === snapshotPath)!;
    invalidEntry.size = invalid.length;
    invalidEntry.sha256 = createHash("sha256").update(invalid).digest("hex");
    writeFileSync(badZip, zipSync({ ...contents, [snapshotPath]: invalid, "huhu-package.json": Buffer.from(JSON.stringify(manifest)) }));
    const badTarget = path.join(fixture, "invalid-target");
    expect(await call("vault.importPackage", { zipPath: badZip, targetDir: badTarget })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(importPackageTo(badZip, badTarget)).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(existsSync(badTarget)).toBe(false);

    await data("plugins.setEnabled", { id: "agent-cli", enabled: false });
    const disabledZip = path.join(fixture, "disabled.zip");
    await data("vault.exportPackage", { dest: disabledZip });
    expect(unzipSync(readFileSync(disabledZip))[snapshotPath]).toEqual(snapshot);
    const callsAfterDisabledExport = rpc.mock.calls.length;
    await data("gateway.update", { capability: "vault.exportPackage", exposed: true });
    const exported = await engine.dispatcher.call("cli", { capability: "vault.exportPackage", input: { packageId: randomUUID() }, requestId: randomUUID(), intentKey: randomUUID() });
    assert(exported.ok, JSON.stringify(exported));
    const filtered = unzipSync(readFileSync((exported.data as { path: string }).path));
    expect(filtered[snapshotPath]).toBeUndefined();
    expect(Object.keys(filtered).some((name) => name.startsWith(".huhu/agent-cli/spaces/"))).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(callsAfterDisabledExport);
    expect(stopped).not.toContain(sourceEndpoint);

    await engine.shutdown();
    engine = await boot({ vaultPath: destination });
    const restored = await data<WorkspaceView>("agent.workspace.get", { spaceId: space.id });
    expect(restored.version).toBe(0);
    expect(restored.layout.tabs[0]?.pane).toMatchObject({ kind: "split", axis: "columns", ratio: 0.35 });
    expect(leaves(restored.layout.tabs[0]!.pane)).toMatchObject([{ sessionId: null, unbound: true }, { sessionId: null }]);
    expect(await data<WorkspaceView>("agent.workspace.get", { spaceId: outside.id })).toMatchObject({ version: 0, layout: { tabs: [] } });
    expect(await data("agent.spaces.list", {})).toEqual(expect.arrayContaining([expect.objectContaining({ id: outside.id, binding: { status: "needs-binding", reason: "external" } })]));
    expect(existsSync(path.join(engine.vault.runtimeDir, "herdr"))).toBe(false);
    expect(ensure).not.toHaveBeenCalled();
    const restoredEndpoint = new HerdrCore({ bin: "unused", vaultId: engine.vault.id, machineId: machineId(), runtimeDir: path.join(engine.vault.runtimeDir, "herdr") }).endpoint;
    expect(stopped).not.toContain(restoredEndpoint);

    let accepted = { version: 0, value: null as unknown };
    let failCas = true;
    const restoredRpc = vi.fn(async (method: string, input: { version: number; value: unknown }) => {
      if (method === "doc.get") return accepted;
      expect(method).toBe("doc.set");
      expect(input.version).toBe(accepted.version);
      if (failCas) throw new Error("fixture rejects the first CAS without saving");
      accepted = { version: accepted.version + 1, value: input.value };
      return { version: accepted.version };
    });
    const restoredClient = { call: restoredRpc } as unknown as HerdrClient;
    ensure.mockResolvedValue(restoredClient);
    peek.mockImplementation(async function (this: HerdrCore) {
      return this.endpoint === restoredEndpoint ? restoredClient : "absent";
    });
    const injection = { tabs: [{ id: "foreign-tab", pane: { kind: "leaf", id: "foreign-leaf", sessionId: "other-space-session" } }] };
    expect(await call("agent.workspace.save", { spaceId: space.id, baseVersion: 0, layout: injection })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const edit = { spaceId: space.id, baseVersion: 0, layout: { tabs: [] } };
    expect(await call("agent.workspace.save", edit)).toMatchObject({ ok: false, error: { code: "HERDR_UNAVAILABLE" } });
    expect(await data("agent.workspace.get", { spaceId: space.id })).toEqual(restored);
    failCas = false;
    expect(await data("agent.workspace.save", edit)).toMatchObject({ version: 1, layout: { tabs: [] } });
    expect(accepted.value).toMatchObject({ revisions: { [space.id]: 1, [outside.id]: 0 }, spaces: { [space.id]: { tabs: [] }, [outside.id]: { tabs: [] } } });
  } finally {
    await engine?.shutdown();
    [listen, ensure, stop, peek].forEach((mock) => mock.mockRestore());
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("冷导出只停止私有 Core，取消和连接无法核对后仍可重试", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-workspace-cold-")));
  const vault = await Vault.open(root, { create: true });
  const spaceId = "space-fixture";
  const catalog = path.join(vault.stateDir, "agent-cli", "spaces");
  const docs = path.join(vault.runtimeDir, "herdr", "state", "herdr-core", "huhu");
  const accepted = { version: 3, value: { format: 1, spaces: { [spaceId]: emptyLayout(spaceId) } } };
  const sourceState = JSON.stringify({ [WORKSPACE_DOCUMENT]: accepted, "other-doc": { version: 1, value: "private-fixture" } });
  const sourceFile = path.join(docs, "docs.json");
  const sourceEndpoint = new HerdrCore({ bin: "unused", vaultId: vault.id, machineId: machineId(), runtimeDir: path.join(vault.runtimeDir, "herdr") }).endpoint;
  const controller = new AbortController();
  const spawned: string[] = [];
  const stopped: string[] = [];
  const mockRpc = vi.fn(async () => accepted);
  const peek = vi.spyOn(HerdrCore.prototype, "peek").mockResolvedValue(null);
  const ensure = vi.spyOn(HerdrCore.prototype, "ensure").mockImplementation(async function (this: HerdrCore) {
    spawned.push(this.endpoint);
    if (spawned.length === 1) controller.abort();
    return { call: mockRpc } as unknown as HerdrClient;
  });
  const stop = vi.spyOn(HerdrCore.prototype, "stop").mockImplementation(async function (this: HerdrCore) {
    stopped.push(this.endpoint);
  });
  try {
    mkdirSync(catalog, { recursive: true });
    mkdirSync(docs, { recursive: true });
    writeFileSync(path.join(catalog, `${spaceId}.json`), JSON.stringify({ format: 2, id: spaceId, name: "Fixture", createdAt: "2026-11-21", revision: 1, directory: { kind: "vault" } }));
    writeFileSync(sourceFile, sourceState);
    await expect(workspacePackageSnapshot(vault, new AbortController().signal)).rejects.toMatchObject({ code: "HERDR_UNAVAILABLE", retryable: true });
    expect(ensure).not.toHaveBeenCalled();
    peek.mockResolvedValue("absent");
    await expect(workspacePackageSnapshot(vault, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(mockRpc).not.toHaveBeenCalled();
    const retried = await workspacePackageSnapshot(vault, new AbortController().signal);
    expect(retried?.bytes.toString()).toContain(spaceId);
    expect(retried?.bytes.toString()).not.toContain("private-fixture");
    expect(mockRpc).toHaveBeenCalledExactlyOnceWith("doc.get", { name: WORKSPACE_DOCUMENT }, expect.any(AbortSignal));
    expect(spawned).toHaveLength(2);
    expect(new Set(spawned).size).toBe(2);
    expect(stopped).toEqual(spawned);
    expect(stopped).not.toContain(sourceEndpoint);
    expect(readFileSync(sourceFile, "utf8")).toBe(sourceState);
    const unknown = new HuhuError("HERDR_UNAVAILABLE", "fixture stop unknown", { retryable: false, details: { outcome: "unknown" } });
    stop.mockRejectedValue(unknown);
    for (const cancel of [false, true]) {
      const signal = new AbortController();
      let ownedRuntime = "";
      ensure.mockImplementation(async function (this: HerdrCore) {
        ownedRuntime = (this as unknown as { o: { runtimeDir: string } }).o.runtimeDir;
        if (cancel) signal.abort();
        return { call: mockRpc } as unknown as HerdrClient;
      });
      try {
        const result = await workspacePackageSnapshot(vault, signal.signal).catch((error: unknown) => error);
        expect(result).toMatchObject({ code: "HERDR_UNAVAILABLE", retryable: false, details: { outcome: "unknown", cleanup: { runtimeDir: ownedRuntime } } });
        expect(existsSync(ownedRuntime)).toBe(true);
      } finally {
        // ensure is mocked: this fixture never spawned a process in its captured directory.
        if (ownedRuntime) rmSync(ownedRuntime, { recursive: true, force: true });
      }
    }
  } finally {
    [peek, ensure, stop].forEach((mock) => mock.mockRestore());
    await vault.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("当前标签填入空叶子，或向右分割并保留原会话", () => {
  const base: SpaceLayout = { tabs: [{ id: "current", pane: { kind: "leaf", id: "focus", sessionId: null, unbound: true } }, ...emptyLayout("other").tabs] };
  const target = { kind: "leaf", tab: "current", leaf: "focus" } as const;
  const filled = placeSession(base, target, "original-session", "first")!;
  expect(filled).toMatchObject({ tab: "current", leaf: "focus" });
  expect(filled.layout.tabs[0]?.pane).toEqual({ kind: "leaf", id: "focus", sessionId: "original-session" });
  expect(placeSession(filled.layout, target, "new-session", "second")).toBeNull();
  const beside = placeSession(filled.layout, { ...target, direction: "right" }, "new-session", "second")!;
  expect(beside.layout.tabs).toHaveLength(2);
  expect(beside.layout.tabs[1]).toBe(base.tabs[1]);
  expect(beside.layout.tabs[0]?.pane).toMatchObject({ kind: "split", axis: "columns", first: filled.layout.tabs[0]?.pane, second: { sessionId: "new-session" } });
  expect(placeSession(beside.layout, { ...target, tab: "closed" }, "new-session", "second")).toBeNull();
});

test.skipIf(!coreBinary)(
  "真实 Core 的热导出与冷导出均恢复纯布局，原运行状态留在源 Vault",
  async () => {
    const fixture = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-workspace-package-")));
    const vaultPath = path.join(fixture, "source");
    const destination = path.join(fixture, "restored");
    const external = path.join(fixture, "external");
    const archive = path.join(fixture, "spaces.zip");
    const coldArchive = path.join(fixture, "spaces-cold.zip");
    const socketDirectory = path.join(fixture, "sockets");
    mkdirSync(vaultPath);
    mkdirSync(external);
    mkdirSync(socketDirectory, { mode: 0o700 });
    vi.stubEnv("HUHU_HERDR_BIN", coreBinary!);
    vi.stubEnv("XDG_RUNTIME_DIR", socketDirectory);
    let engine: RunningEngine | undefined;
    let core: HerdrCore | undefined;
    const call = (capability: string, input: unknown) => engine!.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
    const data = async <T>(capability: string, input: unknown): Promise<T> => {
      const reply = await call(capability, input);
      assert(reply.ok, JSON.stringify(reply));
      return reply.data as T;
    };
    try {
      engine = await boot({ vaultPath, create: true });
      core = new HerdrCore({ bin: coreBinary!, vaultId: engine.vault.id, machineId: machineId(), runtimeDir: path.join(engine.vault.runtimeDir, "herdr") });
      const spaces = () => data<{ id: string; root: string; revision: number; binding: unknown }[]>("agent.spaces.list", {});
      const [source] = await spaces();
      assert(source);
      const outside = await data<{ id: string }>("agent.spaces.save", { name: "外部工作目录", root: external });
      expect(await data<WorkspaceView>("agent.workspace.save", { spaceId: source.id, baseVersion: 0, layout: { tabs: [] } })).toMatchObject({ version: 1 });
      const receipts = path.join(engine.vault.stateDir, "agent-cli", "launch-requests");
      mkdirSync(receipts, { recursive: true });
      writeFileSync(path.join(receipts, "fixture.json"), "{}");
      const sourceClient = await core.ensure();
      const sourceTerminal = await sourceClient.call<{ address: string }>("terminal.run", { argv: ["/bin/sh"], cwd: vaultPath, name: "source-layout-fixture", no_parent: true, keep: false });
      const sourceDocument = await sourceClient.call("doc.get", { name: WORKSPACE_DOCUMENT });
      expect(sourceDocument).toMatchObject({ version: 1, value: { spaces: { [source.id]: { tabs: [] } } } });
      await data("vault.exportPackage", { dest: archive });
      const launcherTarget = path.join(fixture, "launcher-restored");
      expect(importPackageTo(archive, launcherTarget)).toBeNull();
      const sourceId = engine.vault.id;
      await engine.shutdown();
      engine = undefined;
      const sourceEndpoint = core.endpoint;
      const verifyIsolatedCopy = async (target: string, via: "Launcher" | "设置页", imported?: { vaultId: string; importerId: string }) => {
        let copy: RunningEngine | undefined;
        let copyCore: HerdrCore | undefined;
        let copySaveAttempted = false;
        try {
          copy = await boot({ vaultPath: target });
          expect.soft(copy.vault.id, `${via}副本不能使用源 Vault ID`).not.toBe(sourceId);
          if (imported) {
            expect(copy.vault.id).toBe(imported.vaultId);
            expect(copy.vault.id).not.toBe(imported.importerId);
          }
          copyCore = new HerdrCore({ bin: coreBinary!, vaultId: copy.vault.id, machineId: machineId(), runtimeDir: path.join(copy.vault.runtimeDir, "herdr") });
          expect.soft(copyCore.endpoint, `${via}副本不能连接源 Core`).not.toBe(sourceEndpoint);
          const request = (capability: string, input: unknown) => copy!.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
          expect(await request("agent.workspace.get", { spaceId: source.id }), `${via}副本应从自己的版本 0 开始`).toMatchObject({ ok: true, data: { version: 0, layout: { tabs: [] } } });
          expect(await request("agent.core.status", {})).toMatchObject({ ok: true, data: { state: "idle" } });
          expect(existsSync(path.join(copy.vault.runtimeDir, "herdr"))).toBe(false);
          expect(await request("agent.spaces.list", {})).toMatchObject({
            ok: true,
            data: expect.arrayContaining([
              expect.objectContaining({ id: source.id, root: target, binding: { status: "bound" } }),
              expect.objectContaining({ id: outside.id, root: "", binding: { status: "needs-binding", reason: "external" } }),
            ]),
          });
          expect(copyCore.endpoint).not.toBe(sourceEndpoint);
          const updatedLayout = emptyLayout(source.id);
          copySaveAttempted = true;
          expect(await request("agent.workspace.save", { spaceId: source.id, baseVersion: 0, layout: updatedLayout })).toMatchObject({ ok: true, data: { version: 1, layout: updatedLayout } });
          expect(await sourceClient.call("doc.get", { name: WORKSPACE_DOCUMENT })).toEqual(sourceDocument);
          expect(await sourceClient.call("terminal.get", { terminal: sourceTerminal.address })).toMatchObject({ address: sourceTerminal.address, state: "live" });
        } finally {
          await copy?.shutdown();
          if (copySaveAttempted && copyCore && copyCore.endpoint !== sourceEndpoint) await copyCore.stop();
        }
      };
      await verifyIsolatedCopy(launcherTarget, "Launcher");

      const settingsTarget = path.join(fixture, "settings-restored");
      const importerPath = path.join(fixture, "other-vault");
      mkdirSync(importerPath);
      const importer = await boot({ vaultPath: importerPath, create: true });
      let imported: { vaultId: string; importerId: string };
      try {
        expect(importer.vault.id).not.toBe(sourceId);
        expect(await sourceClient.call("terminal.get", { terminal: sourceTerminal.address })).toMatchObject({ state: "live" });
        const reply = await importer.dispatcher.call("desktop", { capability: "vault.importPackage", input: { zipPath: archive, targetDir: settingsTarget }, requestId: randomUUID(), idempotencyKey: randomUUID() });
        assert(reply.ok, JSON.stringify(reply));
        imported = { vaultId: (reply.data as { vaultId: string }).vaultId, importerId: importer.vault.id };
      } finally {
        await importer.shutdown();
      }
      await verifyIsolatedCopy(settingsTarget, "设置页", imported);
      await core.stop();
      await expect.poll(() => core!.peek()).toBe("absent");
      engine = await boot({ vaultPath });
      await data("vault.exportPackage", { dest: coldArchive });
      await expect.poll(() => core!.peek()).toBe("absent");
      const snapshot = ".huhu/agent-cli/workspace-layout.snapshot.json";
      expect(unzipSync(readFileSync(coldArchive))[snapshot]).toEqual(unzipSync(readFileSync(archive))[snapshot]);
      await data("vault.importPackage", { zipPath: coldArchive, targetDir: destination });
      await engine.shutdown();

      engine = await boot({ vaultPath: destination });
      expect(await spaces()).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: source.id, root: destination, binding: { status: "bound" } }), expect.objectContaining({ id: outside.id, root: "", binding: { status: "needs-binding", reason: "external" } })]),
      );
      const newCoreDir = path.join(engine.vault.runtimeDir, "herdr");
      expect(await data("agent.core.status", {})).toMatchObject({ state: "idle" });
      expect(await data<WorkspaceView>("agent.workspace.get", { spaceId: source.id })).toMatchObject({ version: 0, layout: { tabs: [] } });
      expect(await data<WorkspaceView>("agent.workspace.get", { spaceId: outside.id })).toMatchObject({ version: 0, layout: emptyLayout(outside.id) });
      const pendingSpace = (await spaces()).find((space) => space.id === outside.id)!;
      expect(await call("agent.workspace.launch", { spaceId: outside.id, spaceRevision: pendingSpace.revision, provider: "shell", requestId: randomUUID(), baseVersion: 0, target: { kind: "tab" } })).toMatchObject({
        ok: false,
        error: { code: "SPACE_INVALID" },
      });
      expect(existsSync(newCoreDir)).toBe(false);
      expect(existsSync(path.join(engine.vault.stateDir, "agent-cli", "launch-requests"))).toBe(false);

      await engine.shutdown();
      engine = await boot({ vaultPath });
      expect(await data<WorkspaceView>("agent.workspace.get", { spaceId: source.id })).toMatchObject({ version: 1, layout: { tabs: [] } });
      expect((await spaces()).find((space) => space.id === outside.id)?.root).toBe(external);
    } finally {
      await engine?.shutdown();
      await core?.stop();
      vi.unstubAllEnvs();
      rmSync(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  },
  45000,
);

test.skipIf(!coreBinary)(
  "Core 工作区按 Space 持久化，旧版本拒绝覆盖，丢回包只核对原版本",
  async () => {
    const fixture = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-workspace-doc-")));
    const vaultPath = path.join(fixture, "vault");
    const other = path.join(fixture, "other");
    mkdirSync(vaultPath);
    mkdirSync(other);
    vi.stubEnv("HUHU_HERDR_BIN", coreBinary!);
    let engine: RunningEngine | undefined;
    let core: HerdrCore | undefined;
    const call = (capability: string, input: unknown, caller: "desktop" | "cli" = "desktop") => engine!.dispatcher.call(caller, { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
    const data = async <T>(capability: string, input: unknown): Promise<T> => {
      const reply = await call(capability, input);
      assert(reply.ok, JSON.stringify(reply));
      return reply.data as T;
    };
    try {
      engine = await boot({ vaultPath, create: true });
      const mid = machineId();
      core = new HerdrCore({ bin: coreBinary!, vaultId: engine.vault.id, machineId: mid, runtimeDir: path.join(engine.vault.runtimeDir, "herdr") });
      const [a] = await data<{ id: string }[]>("agent.spaces.list", {});
      const b = await data<{ id: string }>("agent.spaces.save", { name: "隔离目录", root: other });
      const openedA = await data<WorkspaceView>("agent.workspace.get", { spaceId: a!.id });
      const openedB = await data<WorkspaceView>("agent.workspace.get", { spaceId: b.id });
      expect(openedA).toMatchObject({ version: 0, layout: emptyLayout(a!.id), writable: true });
      expect(openedB).toMatchObject({ version: 0, layout: emptyLayout(b.id), writable: true });
      expect(await call("agent.workspace.get", { spaceId: a!.id }, "cli")).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });

      const initial = openedA.layout.tabs[0]!;
      const aLayout = { tabs: [{ ...initial, pane: splitPane(initial.pane, initial.pane.id, "left", "edge-a", { kind: "leaf", id: "left-a", sessionId: null }) }] };
      const confirmed = await data<WorkspaceView>("agent.workspace.save", { spaceId: a!.id, baseVersion: 0, layout: aLayout });
      expect(confirmed).toMatchObject({ version: 1, layout: aLayout });
      expect(await call("agent.workspace.save", { spaceId: a!.id, baseVersion: 0, layout: { tabs: [] } })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect(await data<WorkspaceView>("agent.workspace.get", { spaceId: b.id })).toMatchObject({ version: 0, layout: openedB.layout });

      const realCall = HerdrClient.prototype.call;
      let sets = 0;
      const dropped = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, params?: unknown) {
        const result = await realCall.call(this, method, params);
        if (method === "doc.set" && ++sets === 1) throw new Error("fixture discarded the successful Core response");
        return result as T;
      });
      try {
        expect(await data<WorkspaceView>("agent.workspace.save", { spaceId: b.id, baseVersion: 0, layout: { tabs: [] } })).toMatchObject({ version: 1, layout: { tabs: [] } });
        expect(sets).toBe(1);
      } finally {
        dropped.mockRestore();
      }
      expect(await data<WorkspaceView>("agent.workspace.get", { spaceId: a!.id })).toMatchObject({ version: 1, layout: aLayout });

      await engine.shutdown();
      await core.stop();
      let subscribed = false;
      const observed = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, params?: unknown) {
        const result = await realCall.call(this, method, params);
        if (method === "events.subscribe") subscribed = true;
        return result as T;
      });
      try {
        engine = await boot({ vaultPath });
        await data<WorkspaceView>("agent.workspace.get", { spaceId: a!.id });
        await expect.poll(() => subscribed, { timeout: 5000 }).toBe(true);
      } finally {
        observed.mockRestore();
      }
      expect(await data<WorkspaceView>("agent.workspace.get", { spaceId: a!.id })).toMatchObject({ version: 1, layout: aLayout });
      expect(await data<WorkspaceView>("agent.workspace.get", { spaceId: b.id })).toMatchObject({ version: 1, layout: { tabs: [] } });
      const client = await core.ensure();
      const document = await client.call<{ version: number; value: unknown }>("doc.get", { name: WORKSPACE_DOCUMENT });
      expect(document).toMatchObject({ version: 2, value: { format: 1, revisions: { [a!.id]: 1, [b.id]: 1 }, spaces: { [a!.id]: aLayout, [b.id]: { tabs: [] } } } });
      let changes = 0;
      const unsubscribe = engine.events.subscribe((event) => {
        if (event.type === "entity.changed" && (event.payload as { kind?: string }).kind === "agent-workspace") changes++;
      });
      try {
        await client.call("doc.set", { name: WORKSPACE_DOCUMENT, version: 2, value: { format: 2, spaces: {} } });
        await expect.poll(() => changes, { timeout: 5000 }).toBeGreaterThan(0);
      } finally {
        unsubscribe();
      }
      expect(await call("agent.workspace.get", { spaceId: a!.id })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(await call("agent.workspace.save", { spaceId: a!.id, baseVersion: 3, layout: { tabs: [] } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(await client.call("doc.get", { name: WORKSPACE_DOCUMENT })).toEqual({ version: 3, value: { format: 2, spaces: {} } });
    } finally {
      await engine?.shutdown();
      await core?.stop();
      vi.unstubAllEnvs();
      rmSync(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  },
  60_000,
);

test.skipIf(!coreBinary)(
  "真实 Core 在旧分栏版本下既不会启动，也不会终止已收起的会话",
  async () => {
    const fixture = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-workspace-guard-")));
    vi.stubEnv("HUHU_HERDR_BIN", coreBinary!);
    let engine: RunningEngine | undefined;
    let core: HerdrCore | undefined;
    const call = (capability: string, input: unknown) => engine!.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
    const data = async <T>(capability: string, input: unknown): Promise<T> => {
      const reply = await call(capability, input);
      assert(reply.ok, JSON.stringify(reply));
      return reply.data as T;
    };
    try {
      engine = await boot({ vaultPath: fixture, create: true });
      core = new HerdrCore({ bin: coreBinary!, vaultId: engine.vault.id, machineId: machineId(), runtimeDir: path.join(engine.vault.runtimeDir, "herdr") });
      const [space] = await data<{ id: string; revision: number }[]>("agent.spaces.list", {});
      assert(space);
      const opened = await data<WorkspaceView>("agent.workspace.get", { spaceId: space.id });
      const [tab] = opened.layout.tabs;
      assert(tab);
      const originalLaunch = {
        spaceId: space.id,
        spaceRevision: space.revision,
        baseVersion: 0,
        requestId: randomUUID(),
        target: { kind: "leaf", tab: tab.id, leaf: tab.pane.id },
        provider: "shell",
      };
      const otherWindow = await data<WorkspaceView>("agent.workspace.close", { spaceId: space.id, baseVersion: 0, tab: tab.id, leaf: tab.pane.id, sessionId: null, terminate: false });
      expect(otherWindow.layout.tabs).toEqual([]);
      expect(await call("agent.workspace.launch", originalLaunch)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect(await data<unknown[]>("agent.sessions.list", { spaceId: space.id })).toEqual([]);

      const intended = { ...originalLaunch, baseVersion: 1, target: { kind: "tab" } };
      const start = await data<WorkspaceLaunchView>("agent.workspace.launch", intended);
      assert(start.placement);
      expect(start.workspace.version).toBe(2);
      const replay = await data<WorkspaceLaunchView>("agent.workspace.launch", intended);
      expect(replay).toEqual(start);
      expect(await call("agent.workspace.launch", { ...intended, baseVersion: 2 })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
      const close = { spaceId: space.id, baseVersion: 2, ...start.placement, sessionId: start.sessionId };
      const parked = await data<WorkspaceView>("agent.workspace.close", { ...close, terminate: false });
      expect(parked).toMatchObject({ version: 3, layout: { tabs: [] } });
      expect(await call("agent.workspace.close", { ...close, terminate: true })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect(await data<WorkspaceLaunchView>("agent.workspace.launch", intended)).toEqual({ sessionId: start.sessionId, workspace: parked, placement: null });
      expect(await data<unknown[]>("agent.sessions.list", { spaceId: space.id })).toMatchObject([{ id: start.sessionId, state: "running" }]);
      const priorTerminal = await data<{ terminalId: string }>("agent.sessions.recover", { id: start.sessionId });
      expect(priorTerminal).toMatchObject({ id: start.sessionId, requestId: intended.requestId, state: "running" });
      expect(priorTerminal.terminalId).toBeTruthy();
      expect(await data<unknown[]>("agent.sessions.list", { spaceId: space.id })).toHaveLength(1);
      const otherDir = path.join(fixture, "second-space");
      mkdirSync(otherDir);
      const other = await data<{ id: string }>("agent.spaces.save", { name: "第二工作区", root: otherDir });
      const second = await data<WorkspaceLaunchView>("agent.workspace.launch", { ...intended, baseVersion: 3, requestId: randomUUID() });
      assert(second.placement);
      const client = await core.ensure();
      const actual = HerdrClient.prototype.call;
      let changed = false;
      const injected = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, params?: unknown) {
        if (method === "terminal.kill" && !changed) {
          changed = true;
          const document = (await actual.call(client, "doc.get", { name: WORKSPACE_DOCUMENT })) as {
            version: number;
            value: { format: 1; spaces: Record<string, WorkspaceView["layout"]>; revisions: Record<string, number> };
          };
          const value = {
            ...document.value,
            spaces: { ...document.value.spaces, [other.id]: { tabs: [] } },
            revisions: { ...document.value.revisions, [other.id]: 1 },
          };
          await actual.call(client, "doc.set", { name: WORKSPACE_DOCUMENT, version: document.version, value });
        }
        return (await actual.call(this, method, params)) as T;
      });
      try {
        const closed = await data<WorkspaceView>("agent.workspace.close", {
          spaceId: space.id,
          baseVersion: 4,
          ...second.placement,
          sessionId: second.sessionId,
          terminate: true,
        });
        expect(changed).toBe(true);
        expect(closed).toMatchObject({ version: 5, layout: { tabs: [] } });
        expect(await data<WorkspaceView>("agent.workspace.get", { spaceId: other.id })).toMatchObject({ version: 1, layout: { tabs: [] } });
      } finally {
        injected.mockRestore();
      }
      await data("agent.sessions.kill", { id: start.sessionId });
    } finally {
      await engine?.shutdown();
      await core?.stop();
      vi.unstubAllEnvs();
      rmSync(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  },
  60_000,
);
