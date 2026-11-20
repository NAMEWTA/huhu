import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HerdrCore } from "@huhu/plugin-agent-cli/engine";
import { machineId } from "@huhu/vault";
import { assert, expect, test, vi } from "vitest";
import { HerdrClient } from "../../../packages/herdr-client/src/index.js";
import { boot, type RunningEngine } from "../src/boot.js";
import { WORKSPACE_DOCUMENT, emptyLayout, splitPane, type WorkspaceLaunchView, type WorkspaceView } from "../../../plugins/agent-cli/src/shared/workspace-layout.js";

const coreBinary = process.env["HUHU_AGENT_LAUNCH_TEST_BIN"];

test.skipIf(process.platform !== "win32" || !coreBinary)(
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

test.skipIf(process.platform !== "win32" || !coreBinary)(
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
