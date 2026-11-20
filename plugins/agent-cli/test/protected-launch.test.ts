import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { HerdrClient } from "@huhu/herdr-client";
import { filesystemIdentity } from "@huhu/vault";
import { assert, expect, test } from "vitest";
import { ProtectedLaunch } from "../src/engine/protected-launch.js";
import { SessionsService } from "../src/engine/sessions.js";
import { SpaceStore } from "../src/engine/spaces.js";

test.skipIf(process.platform !== "win32")("Windows protected helper 以继承目录核对票据绑定的目录身份", async () => {
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

test.skipIf(process.platform !== "win32")("已准备的目录仍需在 Core 就绪后通过身份核对", async () => {
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
