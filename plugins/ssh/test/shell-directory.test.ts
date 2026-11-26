import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { ShellDirectory } from "../src/engine/shell-directory.js";

function fixture() {
  const tracker = new ShellDirectory();
  const token = tracker.launch("bash").match(/Huhu;([a-f0-9]{48});/)?.[1];
  if (!token) throw new Error("Missing shell nonce");
  const write = (text: string) => tracker.output(Buffer.from(text));
  const report = (path = "/home/test", nonce = token) => `\x1b]633;Huhu;${nonce};P;${Buffer.from(path + "\n").toString("base64")}\x07`;
  const idle = (path?: string) => write(report(path));
  const busy = () => write(`\x1b]633;Huhu;${token};B\x07`);
  const input = (text: string) => tracker.input(Buffer.from(text));
  return { tracker, write, report, idle, busy, input };
}

test("authenticated prompt frames are streamed and reverse paths are quoted once as literal data", () => {
  const { tracker, write, report, idle, busy } = fixture();
  write("\x1b]7;file://host/fake\x07");
  write(report("/forged", "wrong-nonce"));
  expect(tracker.state().state).toBe("unsupported");
  const prompt = report("/real");
  write(prompt.slice(0, 12));
  write(prompt.slice(12));
  const state = tracker.state();
  expect(state).toMatchObject({ state: "ready", cwd: "/real" });
  expect(tracker.command(state.revision, "/newline\nbad")).toBeUndefined();
  expect(tracker.command(state.revision, "/q'$(touch INJECTED)")?.toString()).toBe(" builtin cd -- '/q'\\''$(touch INJECTED)'\r");
  expect(tracker.command(state.revision, "/again")).toBeUndefined();
  busy();
  idle("/q'$(touch INJECTED)");
  expect(tracker.state()).toMatchObject({ state: "ready", cwd: "/q'$(touch INJECTED)" });
});

test("input, foreground and full-screen output invalidate earlier permits without retrying", () => {
  const { tracker, write, idle, busy, input } = fixture();
  idle();
  const original = tracker.state().revision;
  input("read secret");
  idle();
  expect(tracker.state().state).toBe("busy");
  input("\r");
  busy();
  write("password: ");
  expect(tracker.command(original, "/safe")).toBeUndefined();
  write("\x1b[?104");
  write("9h");
  idle();
  expect(tracker.state().state).toBe("fullscreen");
  write("\x1b[?1049l");
  expect(tracker.state().state).toBe("busy");
  idle();
  expect(tracker.state().state).toBe("ready");
  expect(tracker.command(original, "/safe")).toBeUndefined();
  input("echo a\recho b\r");
  busy();
  idle();
  expect(tracker.state().state).toBe("busy");
  busy();
  idle();
  expect(tracker.state().state).toBe("busy");
});

test.runIf(process.platform !== "win32")("launch removes its private startup directory even when the shell writes extra files there", () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-launch-"));
  try {
    const fakeShell = path.join(root, "fake-zsh");
    writeFileSync(fakeShell, '#!/bin/sh\n: > "$ZDOTDIR/.zcompdump"\n', { mode: 0o755 });
    const tmp = path.join(root, "tmp");
    mkdirSync(tmp);
    const result = spawnSync("/bin/sh", ["-c", new ShellDirectory().launch("zsh")], { env: { PATH: "/usr/bin:/bin", HOME: root, TMPDIR: tmp, SHELL: fakeShell }, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(readdirSync(tmp)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
