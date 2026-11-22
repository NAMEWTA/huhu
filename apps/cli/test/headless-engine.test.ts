import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { CapabilityResultSchema } from "@huhu/contracts";
import { boot, type RunningEngine } from "@huhu/engine";
import { assert, expect, test, vi } from "vitest";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { connect } from "../src/connect.js";
import { run } from "../src/main.js";

const engineEntry = process.env["HUHU_ENGINE_ENTRY"] ?? path.resolve(import.meta.dirname, "../../engine/src/main.ts");
const bundledCli = process.env["HUHU_CLI_TEST_BUNDLE"];
const cliEntry = bundledCli ? [bundledCli] : [createRequire(import.meta.url).resolve("tsx/cli"), path.resolve(import.meta.dirname, "../src/bin.ts")];
const idleMs = 1500;
const jobTools = ["ssh.resources.host.get", "ssh.resources.connection.get", "ssh.resources.trust.decide", "ssh.jobs.prepare", "ssh.jobs.start", "ssh.jobs.get", "ssh.jobs.output.read"];
const secretService = process.platform === "linux" && process.env["HUHU_HEADLESS_SECRET_SERVICE_TEST"] === "1";

test.skipIf(!secretService).each([false, true])("CLI 自启动复用桌面 SSH 密码并完成静默 Exec（锁定 Safe：%s）", { timeout: 45_000 }, async (locked) => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-cli-headless-"));
  const vaultPath = path.join(root, "vault");
  const config = path.join(root, "config");
  const userData = path.join(config, "@huhu", "desktop");
  mkdirSync(vaultPath);
  mkdirSync(userData, { recursive: true, mode: 0o700 });
  const password = `synthetic-ssh-${randomUUID()}`;
  const commands: string[] = [];
  const auth: string[] = [];
  let finishExec!: () => void;
  const execFinished = new Promise<void>((resolve) => {
    finishExec = resolve;
  });
  const ssh = await startFakeSsh({
    password,
    onAuth: (_user, method) => auth.push(method),
    onInteractiveExec: (command, channel) => {
      commands.push(command);
      void execFinished.then(() => {
        if (!channel.writable) return;
        channel.write("headless fixture finished\n");
        channel.exit(0);
        channel.end();
      });
      return true;
    },
  });
  let desktop: RunningEngine | undefined;
  let descriptor: string | undefined;
  const keys: string[] = [];
  let protection: NonNullable<RunningEngine["moduleCredentialHost"]>["protection"] | undefined;
  const desktopCall = async <T>(capability: string, input: unknown = {}) => {
    const reply = await desktop!.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
    assert(reply.ok, reply.ok ? undefined : reply.error.code);
    return reply.data as T;
  };
  const cli = async (capability: string, input: unknown) => {
    const output: string[] = [];
    const exit = await run(["call", capability, "--vault", vaultPath, "--json", "--input-json", JSON.stringify(input)], {
      out: (line) => output.push(line),
      err: (line) => {
        throw new Error(line);
      },
    });
    const reply = CapabilityResultSchema.parse(JSON.parse(output.join("")));
    expect(exit).toBe(reply.ok ? 0 : 1);
    return reply;
  };
  const data = async <T>(capability: string, input: unknown) => {
    const reply = await cli(capability, input);
    assert(reply.ok, reply.ok ? undefined : reply.error.code);
    return reply.data as T;
  };
  const processId = () => (JSON.parse(readFileSync(descriptor!, "utf8")) as { pid: number }).pid;
  try {
    vi.stubEnv("XDG_CONFIG_HOME", config);
    vi.stubEnv("HUHU_ENGINE_ENTRY", engineEntry);
    vi.stubEnv("HUHU_DESKTOP_USER_DATA", undefined);
    desktop = await boot({ vaultPath, create: true, desktopUserData: userData });
    descriptor = desktop.descriptorPath;
    protection = desktop.moduleCredentialHost?.protection;
    assert(protection);
    const create = protection.create.bind(protection);
    vi.spyOn(protection, "create").mockImplementation(async (id, value) => {
      await create(id, value);
      keys.push(id);
    });
    if (locked) {
      await desktopCall("safe.setup", { password: "fixture-only-safe-password" });
      await desktopCall("safe.lock");
      expect(await desktopCall("safe.status")).toMatchObject({ initialized: true, locked: true });
    }
    const { hostId } = await desktopCall<{ hostId: string }>("ssh.hosts.configure", {
      name: "headless fixture",
      host: "127.0.0.1",
      port: ssh.port,
      user: "fixture",
      authKind: "password",
      expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: password }],
    });
    for (const capability of jobTools) await desktopCall("gateway.update", { capability, exposed: true });
    const resources = { "ssh.hosts": [hostId] };
    const preview = await desktopCall<{ revision: number; catalogRevision: string }>("gateway.policy.preview", { resources });
    await desktopCall("gateway.policy.update", { resources, expectedRevision: preview.revision, catalogRevision: preview.catalogRevision });
    const { routeRevision } = await data<{ routeRevision: string }>("ssh.resources.host.get", { hostId });
    expect(processId()).toBe(process.pid);
    await desktop.shutdown();
    desktop = undefined;
    expect(existsSync(descriptor)).toBe(false);

    if (locked) {
      await connect(vaultPath, { idleExitMs: idleMs });
    } else {
      const { stdout } = await promisify(execFile)(process.execPath, [...cliEntry, "call", "ssh.resources.host.get", "--vault", vaultPath, "--json", "--input-json", JSON.stringify({ hostId })], { timeout: 20_000 });
      expect(CapabilityResultSchema.parse(JSON.parse(stdout))).toMatchObject({ ok: true, data: { hostId, routeRevision } });
    }
    const pid = await data<{ routeRevision: string }>("ssh.resources.host.get", { hostId }).then(() => processId());
    expect(pid).not.toBe(process.pid);
    const admission = { hostId, routeRevision, command: "synthetic-headless-exec", timeoutSec: 20, intentKey: randomUUID() };
    await expect(cli("ssh.jobs.prepare", { ...admission, desktopUserData: root })).resolves.toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const job = await data<{ jobId: string }>("ssh.jobs.prepare", admission);
    const status = () => data<{ state: string; reason: string | null; attemptId: string; sessionId: string | null }>("ssh.jobs.get", job);
    const { attemptId } = await status();
    const connection = await vi.waitFor(
      async () => {
        const view = await data<{ state: string; prompt: object }>("ssh.resources.connection.get", { hostId, attemptId });
        expect(view.state).toBe("waiting");
        return view;
      },
      { timeout: 5000 },
    );
    expect(await data("ssh.resources.trust.decide", { hostId, routeRevision, attemptId, ...connection.prompt, accept: true })).toEqual({ applied: true });
    const ready = await vi.waitFor(
      async () => {
        const view = await status();
        expect(view.state, `SSH job status: ${view.reason}`).toBe("ready");
        return view;
      },
      { timeout: 5000 },
    );
    await data("ssh.jobs.start", { hostId, routeRevision, ...job, sessionId: ready.sessionId });
    await vi.waitFor(async () => expect(await status()).toMatchObject({ state: "running" }));
    if (locked) {
      // No CLI/HTTP activity while the remote fixture withholds all output and exit.
      await delay(idleMs * 2 + 250);
      expect(existsSync(descriptor)).toBe(true);
      expect(processId()).toBe(pid);
      expect(ssh.closed()).toBe(0);
    }
    finishExec();
    if (locked) {
      await vi.waitFor(() => expect(ssh.closed()).toBe(1));
      await delay(1100);
      expect(processId()).toBe(pid);
    }
    await vi.waitFor(async () => expect(await status()).toMatchObject({ state: "exited", exitCode: 0 }));
    expect(await data("ssh.jobs.output.read", { ...job, stream: "stdout" })).toMatchObject({ text: "headless fixture finished\n" });
    expect(commands).toEqual([admission.command]);
    expect(auth.filter((method) => method === "password")).toHaveLength(1);
    if (locked) {
      await delay(idleMs / 2);
      expect(processId()).toBe(pid);
      await vi.waitFor(() => expect(existsSync(descriptor!)).toBe(false), { timeout: 5000 });
    } else {
      process.kill(pid, "SIGTERM");
      await vi.waitFor(() => expect(existsSync(descriptor!)).toBe(false), { timeout: 5000 });
    }
  } finally {
    finishExec();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await desktop?.shutdown();
    if (descriptor && existsSync(descriptor)) {
      const pid = processId();
      if (pid !== process.pid) process.kill(pid, "SIGTERM");
      await vi.waitFor(() => expect(existsSync(descriptor!)).toBe(false), { timeout: 5000 });
    }
    for (const id of keys) await protection?.remove(id);
    await ssh.close();
    rmSync(root, { recursive: true, force: true });
  }
});
