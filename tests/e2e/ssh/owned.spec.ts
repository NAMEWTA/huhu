import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import type { CapabilityResult } from "../../../packages/contracts/src/capability.js";
import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import type { PublicProbeStatus } from "../../../plugins/ssh/src/engine/public-probes.js";
import type { z } from "zod";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { openApp } from "../helpers/launch.js";
import { desktopCall } from "./workbench.js";

const run = promisify(execFile);
const connect = "ssh.connect";
const get = "ssh.resources.connection.get";
const trust = "ssh.resources.trust.decide";
const open = "ssh.shells.open";
const list = "ssh.shells.list";
const read = "ssh.shells.read";
const write = "ssh.shells.write";
const actions = [connect, get, trust, open, list, read, write];

function accepted<T>(reply: CapabilityResult<unknown>): T {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data as T;
}

for (const entry of ["CLI", "HTTP MCP"]) {
  test(`${entry} isolates SSH terminals and workbench or host revocation can close them`, async () => {
    const password = randomUUID();
    const input: string[] = [];
    let closed = 0;
    const server = await startFakeSsh({ password, onShellInput: (value) => input.push(value), onShellClose: () => closed++ });
    const app = await openApp();
    const { page, vault } = app;
    try {
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
      const { hostId } = await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
        name: "外部终端回环夹具",
        host: "127.0.0.1",
        port: server.port,
        user: "fixture",
        authKind: "password",
        expectedRevision: null,
        credentials: [{ purpose: "password", action: "replace", value: password }],
      });
      const { routeRevision } = await desktopCall<{ routeRevision: string }>(page, "ssh.resources.host.get", { hostId });
      const binding = { hostId, routeRevision };
      await desktopCall(page, "gateway.mcp.update", { enabled: true, transport: "http" });
      const { token } = await desktopCall<{ token: string }>(page, "gateway.tokens.create", { name: "外部终端验收" });
      const endpoint = await page.evaluate(async () => (await (window as unknown as { huhuHost: { engine(): Promise<{ baseUrl: string }> } }).huhuHost.engine()).baseUrl + "/mcp");
      expect(new URL(endpoint).hostname).toBe("127.0.0.1");
      const mcp = (session: string) => async (capability: string, input: unknown = {}): Promise<CapabilityResult<unknown>> => {
        const response = await mcpRequest(endpoint, token, mcpRpc("tools/call", { name: capability.replaceAll(".", "_"), arguments: input }), session);
        expect(response.status).toBe(200);
        const { result } = await response.json();
        return result.isError ? { ok: false, error: JSON.parse(result.content[0].text) } : { ok: true, data: result.structuredContent.data };
      };
      const cli = async (capability: string, input: unknown = {}): Promise<CapabilityResult<unknown>> => {
        const script = path.resolve(import.meta.dirname, "../../../apps/cli/dist/cli.mjs");
        const { stdout } = await run(process.execPath, [script, "call", capability, "--vault", vault, "--json", "--input-json", JSON.stringify(input)]).catch((error: { stdout?: string }) => {
          if (!error.stdout) throw error;
          return { stdout: error.stdout };
        });
        return JSON.parse(stdout);
      };
      const invoke = entry === "CLI" ? cli : mcp(await openMcpSession(endpoint, token));
      const peer = mcp(await openMcpSession(endpoint, token));
      const policy = async (hosts: string[], exposed?: boolean) => {
        const resources = { "ssh.hosts": hosts };
        const changes = exposed === undefined ? [] : actions.map((capability) => ({ capability, exposed }));
        const { revision, catalogRevision } = await desktopCall<{ revision: number; catalogRevision: string }>(page, "gateway.policy.preview", { resources, changes });
        await desktopCall(page, "gateway.policy.update", { resources, changes, expectedRevision: revision, catalogRevision });
      };
      const connectIntent = { ...binding, intentKey: randomUUID() };
      await policy([hostId]);
      expect(await invoke(connect, connectIntent)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
      await policy([hostId], true);
      const { attemptId } = accepted<{ attemptId: string }>(await invoke(connect, connectIntent));
      const status = (async () => accepted<z.infer<typeof PublicProbeStatus>>(await invoke(get, { hostId, attemptId })));
      await expect.poll(async () => (await status()).state).toBe("waiting");
      const pending = await status();
      if (pending.state !== "waiting") throw new Error("未找到回环夹具主机指纹");
      accepted(await invoke(trust, { ...binding, attemptId, ...pending.prompt, accept: true }));
      await expect.poll(async () => (await status()).state).toBe("connected");
      const openIntent = { ...binding, attemptId, intentKey: randomUUID() };
      const opened = await invoke(open, openIntent);
      expect(await invoke(open, openIntent)).toEqual(opened);
      const first = accepted<{ shellId: string }>(opened);
      expect(accepted(await peer(list, { hostId }))).toEqual([]);
      expect(await peer(read, first)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

      await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
      const moduleView = page.getByTestId("ssh-module");
      await expect(moduleView.getByRole("heading", { name: "外部工具连接" })).toBeVisible();
      await moduleView.getByRole("tab", { name: "交互终端", exact: true }).click();
      await expect(moduleView.getByRole("heading", { name: "外部工具终端" })).toBeVisible();
      await moduleView.getByRole("button", { name: new RegExp(first.shellId) }).click();
      await expect.poll(() => closed).toBe(1);

      const fresh = accepted<{ shellId: string }>(await invoke(open, { ...openIntent, intentKey: randomUUID() }));
      const send = { ...fresh, intentKey: randomUUID(), dataBase64: Buffer.from("fixture-only").toString("base64") };
      expect(await invoke(write, send)).toEqual({ ok: true, data: { bytes: 12 } });
      expect(await invoke(write, send)).toEqual({ ok: true, data: { bytes: 12 } });
      await expect.poll(() => input).toEqual(["fixture-only"]);
      await policy([]);
      await expect.poll(() => closed).toBe(2);
      const denied = { ok: false, error: { code: "PERMISSION_DENIED" } };
      expect(await invoke(write, send)).toMatchObject(denied);
      expect(await invoke(read, fresh)).toMatchObject(denied);
      await policy([hostId], false);
      expect(await invoke(open, openIntent)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    } finally {
      await app.close();
      await server.close();
    }
  });
}
