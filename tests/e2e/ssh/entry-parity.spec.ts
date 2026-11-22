import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import type { CapabilityResult } from "../../../packages/contracts/src/capability.js";
import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import type { PublicProbeStatus } from "../../../plugins/ssh/src/engine/public-probes.js";
import type { ResourceHost } from "../../../plugins/ssh/src/engine/public-resources.js";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { openApp } from "../helpers/launch.js";
import { desktopCall } from "./workbench.js";

type Probe = ReturnType<typeof PublicProbeStatus.parse>;
type Invoke = (capability: string, input: object) => Promise<CapabilityResult<unknown>>;
const run = promisify(execFile);
const tools = [
  "ssh.hosts.configure",
  "ssh.resources.host.get",
  "ssh.connect",
  "ssh.resources.connection.get",
  "ssh.resources.trust.decide",
  "ssh.disconnect",
  "ssh.jobs.prepare",
  "ssh.jobs.get",
  "ssh.jobs.start",
  "ssh.jobs.output.read",
  "ssh.fileSessions.open",
  "ssh.sftp.upload",
  "ssh.sftp.download",
];

function data<T>(result: CapabilityResult<unknown>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.data as T;
}

for (const entry of ["CLI", "HTTP MCP"]) {
  test(`${entry} updates SSH authentication, approves trust, reads job output and transfers bytes`, async () => {
    test.setTimeout(90_000);
    const password = randomUUID();
    let commands = 0;
    const server = await startFakeSsh({
      password,
      onExec: (command) => {
        if (command !== "echo parity") return undefined;
        commands++;
        return { stdout: "结果\n" };
      },
    });
    const app = await openApp();
    const { page, vault } = app;
    try {
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
      const target = { name: "SSH 入口一致性", host: "127.0.0.1", port: server.port, user: "fixture", authKind: "password", jumpHostIds: [] };
      const original = await desktopCall<{ hostId: string; revision: string }>(page, "ssh.hosts.configure", {
        ...target,
        expectedRevision: null,
        credentials: [{ purpose: "password", action: "replace", value: "synthetic-previous" }],
      });
      const { hostId } = original;
      const policy = async (hostIds: string[], expose: boolean) => {
        const changes = tools.map((capability) => ({ capability, exposed: expose }));
        const resources = { "ssh.hosts": hostIds };
        const { revision, catalogRevision } = await desktopCall<{ revision: number; catalogRevision: string }>(page, "gateway.policy.preview", { resources, changes });
        await desktopCall(page, "gateway.policy.update", { resources, changes, expectedRevision: revision, catalogRevision });
      };
      let invoke: Invoke;
      if (entry === "CLI") {
        const script = path.resolve(import.meta.dirname, "../../../apps/cli/dist/cli.mjs");
        invoke = async (capability, input) => {
          const argv = [script, "call", capability, "--vault", vault, "--json", "--input-json", JSON.stringify(input)];
          const { stdout } = await run(process.execPath, argv).catch((failure: { stdout?: string }) => {
            if (!failure.stdout) throw failure;
            return { stdout: failure.stdout };
          });
          return JSON.parse(stdout);
        };
      } else {
        await desktopCall(page, "gateway.mcp.update", { enabled: true, transport: "http" });
        const { token } = await desktopCall<{ token: string }>(page, "gateway.tokens.create", { name: "SSH parity fixture" });
        const endpoint = await page.evaluate(async () => (await (window as unknown as { huhuHost: { engine(): Promise<{ baseUrl: string }> } }).huhuHost.engine()).baseUrl + "/mcp");
        expect(new URL(endpoint).hostname).toBe("127.0.0.1");
        const session = await openMcpSession(endpoint, token);
        invoke = async (capability, input) => {
          const response = await mcpRequest(endpoint, token, mcpRpc("tools/call", { name: capability.replaceAll(".", "_"), arguments: input }), session);
          expect(response.status).toBe(200);
          const { result } = await response.json();
          return result.isError ? { ok: false, error: JSON.parse(result.content[0].text) } : { ok: true, data: result.structuredContent.data };
        };
      }
      await policy([hostId], true);
      const before = data<ResourceHost>(await invoke("ssh.resources.host.get", { hostId }));
      const edit = { ...target, hostId, routeRevision: before.routeRevision, intentKey: randomUUID(), expectedRevision: original.revision, credentials: [{ action: "replace", purpose: "password", value: password }] };
      const saved = await invoke("ssh.hosts.configure", edit);
      expect(saved).toMatchObject({ ok: true, data: { hostId, revision: expect.any(String) } });
      expect(await invoke("ssh.hosts.configure", edit)).toEqual(saved);
      const route = data<ResourceHost>(await invoke("ssh.resources.host.get", { hostId }));
      const binding = { hostId, routeRevision: route.routeRevision };
      expect(route.revision).not.toBe(original.revision);
      async function trust(attemptId: string) {
        let current: Probe | undefined;
        await expect
          .poll(async () => {
            current = data<Probe>(await invoke("ssh.resources.connection.get", { hostId, attemptId }));
            return current.state;
          })
          .toBe("waiting");
        if (current?.state !== "waiting") throw new Error("Missing loopback SSH trust prompt");
        const answer = { ...binding, attemptId, ...current.prompt, accept: true };
        expect(await invoke("ssh.resources.trust.decide", answer)).toMatchObject({ ok: true, data: { applied: true } });
        expect(await invoke("ssh.resources.trust.decide", answer)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      }
      const { attemptId } = data<{ attemptId: string }>(await invoke("ssh.connect", { ...binding, intentKey: randomUUID() }));
      await trust(attemptId);
      await expect.poll(async () => data<Probe>(await invoke("ssh.resources.connection.get", { hostId, attemptId })).state).toBe("connected");
      const { fileSessionId } = data<{ fileSessionId: string }>(await invoke("ssh.fileSessions.open", { ...binding, attemptId, intentKey: randomUUID() }));
      const bytes = { fileSessionId, remotePath: "/home/test/entry-parity.bin", transferId: randomUUID(), intentKey: randomUUID(), dataBase64: "AQID" };
      expect(await invoke("ssh.sftp.upload", bytes)).toMatchObject({ ok: true, data: { size: 3 } });
      expect(await invoke("ssh.sftp.upload", bytes)).toMatchObject({ ok: true, data: { size: 3 } });
      const download = { fileSessionId, remotePath: bytes.remotePath, transferId: randomUUID() };
      expect(await invoke("ssh.sftp.download", download)).toMatchObject({ ok: true, data: { dataBase64: "AQID", eof: true } });

      const makeJob = { ...binding, command: "echo parity", intentKey: randomUUID() };
      const job = await invoke("ssh.jobs.prepare", makeJob);
      expect(await invoke("ssh.jobs.prepare", makeJob)).toEqual(job);
      const { jobId } = data<{ jobId: string }>(job);
      const jobStatus = async () => data<{ state: string; attemptId: string | null; sessionId: string | null }>(await invoke("ssh.jobs.get", { jobId }));
      await expect.poll(async () => Boolean((await jobStatus()).attemptId)).toBe(true);
      await trust((await jobStatus()).attemptId!);
      await expect.poll(async () => (await jobStatus()).state).toBe("ready");
      const start = { ...binding, jobId, sessionId: (await jobStatus()).sessionId! };
      expect(await invoke("ssh.jobs.start", start)).toMatchObject({ ok: true, data: { jobId } });
      expect(await invoke("ssh.jobs.start", start)).toMatchObject({ ok: true, data: { jobId } });
      await expect.poll(async () => (await jobStatus()).state).toBe("exited");
      expect(commands).toBe(1);
      const output = { jobId, stream: "stdout", cursor: 0 };
      expect(await invoke("ssh.jobs.output.read", output)).toMatchObject({ ok: true, data: { text: "结果\n", nextCursor: 7 } });
      expect(await invoke("ssh.disconnect", { ...binding, attemptId })).toMatchObject({ ok: true });
      await policy([], true);
      expect(await invoke("ssh.jobs.output.read", output)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      await policy([], false);
      expect(await invoke("ssh.sftp.download", download)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    } finally {
      await app.close();
      await server.close();
    }
  });
}
