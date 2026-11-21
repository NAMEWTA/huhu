import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { HerdrClient } from "@huhu/herdr-client";
import { filesystemIdentity } from "@huhu/vault";
import { assert, expect, test, vi } from "vitest";
import { HerdrCore } from "../src/engine/herdr-core.js";
import { ProtectedLaunch } from "../src/engine/protected-launch.js";
import { SessionsService } from "../src/engine/sessions.js";
import { SpaceStore } from "../src/engine/spaces.js";
import { fixtureCoreCli } from "./fixtures/core-cli.js";

const coreBin = process.env["HUHU_AGENT_LAUNCH_TEST_BIN"];

test("Protected helper 以继承目录核对票据绑定的目录身份", async () => {
  const fixture = realpathSync.native(mkdtempSync(path.join(tmpdir(), "huhu-approved-cwd-")));
  const cwd = path.join(fixture, "approved");
  const broker = new ProtectedLaunch(process.execPath, path.resolve(import.meta.dirname, "../src/engine/protected-launch-helper.cjs"));
  const run = promisify(execFile);
  try {
    mkdirSync(cwd);
    const stat = statSync(cwd, { bigint: true });
    const identity = filesystemIdentity(stat);
    assert(identity);
    const proof = { path: realpathSync.native(cwd), identity, birthtimeNs: String(stat.birthtimeNs) };
    const port = await broker.listen();
    const issue = () => broker.issue(port, [process.execPath, "-e", "process.stdout.write(process.cwd())"], { HUHU_RULE_SECRET_FIXTURE: "synthetic-value" }, proof);
    const launch = ([exe, ...argv]: string[]) => {
      assert(exe);
      return run(exe, argv, { cwd, windowsHide: true });
    };
    const valid = await launch(issue().argv);
    expect(valid.stdout).toBe(proof.path);
    expect(valid.stderr).not.toContain("工作目录已变化");

    const stale = issue();
    renameSync(cwd, path.join(fixture, "previous"));
    mkdirSync(cwd);
    expect(realpathSync.native(cwd)).toBe(proof.path);
    expect(filesystemIdentity(statSync(cwd, { bigint: true }))).not.toBe(proof.identity);
    await expect(launch(stale.argv)).rejects.toMatchObject({ code: 1, stdout: "", stderr: expect.stringContaining("工作目录已变化，命令未启动") });
  } finally {
    broker.close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("已准备的目录仍需在 Core 就绪后通过身份核对", async () => {
  const fixture = realpathSync.native(mkdtempSync(path.join(tmpdir(), "huhu-approved-submit-")));
  const cwd = path.join(fixture, "approved");
  const broker = new ProtectedLaunch(process.execPath, path.resolve(import.meta.dirname, "../src/engine/protected-launch-helper.cjs"));
  try {
    mkdirSync(cwd);
    const stat = statSync(cwd, { bigint: true });
    const identity = filesystemIdentity(stat);
    assert(identity);
    const spaces = new SpaceStore(path.join(fixture, "spaces"), "fixture-owner");
    const space = spaces.save({ name: "批准工作目录", root: cwd });
    const calls: string[] = [];
    const client = {
      call: async (method: string) => {
        calls.push(method);
        return { core: { id: "fixture-core" }, generation: 1 };
      },
    } as unknown as HerdrClient;
    const sessions = new SessionsService({
      dir: path.join(fixture, "sessions"),
      vaultId: "fixture-vault",
      spaces,
      protectedLaunch: broker,
      core: async () => {
        renameSync(cwd, path.join(fixture, "previous"));
        mkdirSync(cwd);
        return client;
      },
      resolve: async () => {
        throw new Error("应使用终端规则");
      },
      now: () => new Date(),
    });
    await expect(
      sessions.launch({
        spaceId: space.id,
        spaceRevision: space.revision,
        provider: "shell",
        shell: "powershell",
        command: "Write-Output 'fixture'",
        requestId: "fixture-approved-directory",
        env: { HUHU_RULE_SECRET_FIXTURE: "synthetic-value" },
        approvedDirectory: { path: cwd, identity, birthtimeNs: String(stat.birthtimeNs) },
      }),
    ).rejects.toMatchObject({ code: "SPACE_INVALID", details: { reason: "approved_directory_changed" } });
    expect(sessions.list()[0]).toMatchObject({ requestId: "fixture-approved-directory", state: "failed", terminalId: null });
    expect(calls).toEqual(["hello"]);
  } finally {
    broker.close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32" || !coreBin)(
  "POSIX Core 受保护规则仅向原终端交付一次，限制继承环境并遮蔽回显",
  async () => {
    const fixture = realpathSync.native(mkdtempSync(path.join(tmpdir(), "huhu-rule-posix-")));
    const helper = path.resolve(import.meta.dirname, "../src/engine/protected-launch-helper.cjs");
    const broker = new ProtectedLaunch(process.execPath, helper);
    const vaultId = "vault-" + randomUUID();
    const machineId = "fixture-owner";
    const runtimeDir = path.join(fixture, "runtime");
    const core = new HerdrCore({ bin: coreBin!, vaultId, machineId, runtimeDir });
    const marker = "protected-fixture-" + randomUUID();
    try {
      vi.stubEnv("HUHU_RULE_AMBIENT_FIXTURE", "ambient-fixture");
      const env = { ...process.env, HC_SESSION: "huhu", HC_SOCKET: core.endpoint, XDG_STATE_HOME: path.join(runtimeDir, "state"), XDG_CONFIG_HOME: path.join(runtimeDir, "config") };
      const cli = fixtureCoreCli(coreBin!, env);
      const wait = (address: string) => promisify(execFile)(coreBin!, ["wait", address, "--timeout", "5", "--json"], { env, timeout: 7_000 });
      const spaces = new SpaceStore(path.join(fixture, "spaces"), machineId);
      const space = spaces.save({ name: "规则工作目录", root: fixture });
      const stat = statSync(fixture, { bigint: true });
      const identity = filesystemIdentity(stat);
      assert(identity);
      const sessions = new SessionsService({
        dir: path.join(fixture, "sessions"),
        vaultId,
        spaces,
        protectedLaunch: broker,
        core: () => core.ensure(),
        resolve: async () => {
          throw new Error("应使用终端规则");
        },
        now: () => new Date(),
      });
      const input = {
        spaceId: space.id,
        spaceRevision: space.revision,
        provider: "shell",
        shell: "sh",
        command: 'test -z "${HUHU_RULE_AMBIENT_FIXTURE+x}" && test -n "$HUHU_RULE_SECRET_FIXTURE" || exit 7; printf "%s\\n" "$HUHU_RULE_SECRET_FIXTURE" >&2; printf "%s\\n" protected-fixture-ok; pwd',
        requestId: randomUUID(),
        env: { HUHU_RULE_SECRET_FIXTURE: marker },
        approvedDirectory: { path: fixture, identity, birthtimeNs: String(stat.birthtimeNs) },
      } as const;
      const original = await sessions.launch(input);
      assert(original.terminalId);
      expect((await wait(original.terminalId)).stdout).toContain('"exit_code":0');
      const output = cli("read", "--lines", "25", original.terminalId).stdout;
      expect(output).toContain("protected-fixture-ok");
      expect(output).toContain("***");
      expect(output).toContain(fixture);
      expect(output).not.toContain(marker);
      const terminal = cli("get", original.terminalId).stdout;
      expect(terminal).not.toContain(marker);
      expect(terminal).not.toContain("HUHU_RULE_SECRET_FIXTURE");
      const { argv } = JSON.parse(terminal) as { argv: string[] };
      const client = await core.ensure();
      const replay = await client.call<{ address: string }>("terminal.run", { argv, cwd: fixture });
      expect((await wait(replay.address)).stdout).toContain('"exit_code":1');
      expect(await sessions.launch(input)).toMatchObject({ id: original.id, terminalId: original.terminalId });
    } finally {
      broker.close();
      await core.stop();
      vi.unstubAllEnvs();
      rmSync(fixture, { recursive: true, force: true });
    }
  },
  15_000,
);
