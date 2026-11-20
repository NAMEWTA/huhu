import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HerdrCore } from "@huhu/plugin-agent-cli/engine";
import { machineId } from "@huhu/vault";
import { assert, expect, test, vi } from "vitest";
import { HerdrClient } from "../../../packages/herdr-client/src/index.js";
import { boot, type RunningEngine } from "../src/boot.js";
import { WORKSPACE_DOCUMENT, emptyLayout, splitPane, type WorkspaceView } from "../../../plugins/agent-cli/src/shared/workspace-layout.js";

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
      expect(await call("agent.workspace.save", { spaceId: b.id, baseVersion: 0, layout: { tabs: [] } })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });

      const realCall = HerdrClient.prototype.call;
      let sets = 0;
      const dropped = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, params?: unknown) {
        const result = await realCall.call(this, method, params);
        if (method === "doc.set" && ++sets === 1) throw new Error("fixture discarded the successful Core response");
        return result as T;
      });
      try {
        expect(await data<WorkspaceView>("agent.workspace.save", { spaceId: b.id, baseVersion: 1, layout: { tabs: [] } })).toMatchObject({ version: 2, layout: { tabs: [] } });
        expect(sets).toBe(1);
      } finally {
        dropped.mockRestore();
      }
      expect(await data<WorkspaceView>("agent.workspace.get", { spaceId: a!.id })).toMatchObject({ version: 2, layout: aLayout });

      await engine.shutdown();
      await core.stop();
      engine = await boot({ vaultPath });
      expect(await data<WorkspaceView>("agent.workspace.get", { spaceId: a!.id })).toMatchObject({ version: 2, layout: aLayout });
      expect(await data<WorkspaceView>("agent.workspace.get", { spaceId: b.id })).toMatchObject({ version: 2, layout: { tabs: [] } });
      const client = await core.ensure();
      const document = await client.call<{ version: number; value: unknown }>("doc.get", { name: WORKSPACE_DOCUMENT });
      expect(document).toMatchObject({ version: 2, value: { format: 1, spaces: { [a!.id]: aLayout, [b.id]: { tabs: [] } } } });
      await client.call("doc.set", { name: WORKSPACE_DOCUMENT, version: 2, value: { format: 2, spaces: {} } });
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
