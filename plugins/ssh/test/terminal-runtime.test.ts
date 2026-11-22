import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { expect, test, vi } from "vitest";
import { makeSshTerminalBridge } from "../src/engine/terminal-bridge.js";
import { SshLocalShells } from "../src/engine/local-shell.js";

class ViewSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = this.OPEN;
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data.toString());
  }
  close() {
    this.readyState = 3;
    this.emit("close");
  }
  asSocket() {
    return this as unknown as WebSocket;
  }
}

test("SSH 终端按当前 socket 授予输入和 resize，仅请求控制的后继会自动重挂", async () => {
  const writes: string[] = [];
  const resizes: number[][] = [];
  const attach = makeSshTerminalBridge((_id, view) => {
    view.onData(Buffer.from("回放"));
    return {
      write: (data) => {
        writes.push(data.toString());
      },
      resize: (cols, rows) => {
        resizes.push([cols, rows]);
      },
      detach: () => undefined,
    };
  });
  const original = new ViewSocket();
  const observing = new ViewSocket();
  const successor = new ViewSocket();
  const opts = { cols: 80, rows: 20, observe: false };
  await attach("ssh-fixture", original.asSocket(), opts);
  await attach("ssh-fixture", observing.asSocket(), { ...opts, observe: true });
  await attach("ssh-fixture", successor.asSocket(), opts);
  expect(successor.sent).toContain("回放");
  expect(successor.sent).toContainEqual(expect.stringContaining('"mode":"observe"'));
  original.emit("message", Buffer.from("first"), true);
  successor.emit("message", Buffer.from("forbidden"), true);
  observing.emit("message", Buffer.from('{"type":"resize","cols":93,"rows":33}'), false);
  expect(writes).toEqual(["first"]);
  expect(resizes).toEqual([[80, 20]]);
  original.close();
  expect(observing.sent).not.toContainEqual(expect.stringContaining("control-free"));
  expect(successor.sent).toContainEqual(expect.stringContaining("control-free"));
  successor.close();
  const remount = new ViewSocket();
  await attach("ssh-fixture", remount.asSocket(), opts);
  original.emit("message", Buffer.from("late"), true);
  remount.emit("message", Buffer.from("second"), true);
  remount.emit("message", Buffer.from('{"type":"resize","cols":9999,"rows":0}'), false);
  expect(writes).toEqual(["first", "second"]);
  expect(resizes).toEqual([
    [80, 20],
    [80, 20],
  ]);
});

test("本机终端重连沿用原环境，环境移除后不启动回退进程", async () => {
  const bash = { view: { id: "a".repeat(64), kind: "shell" as const, name: "fixture-bash" }, argv: ["/test-fixture/bash"] };
  const zsh = { view: { id: "b".repeat(64), kind: "shell" as const, name: "fixture-zsh" }, argv: ["/test-fixture/zsh"] };
  let environments = [bash, zsh];
  const launch = vi.fn(async () => ({ write: vi.fn(), resize: vi.fn(), stop: vi.fn() }));
  const service = new SshLocalShells(
    launch,
    () => undefined,
    async () => environments,
  );
  const signal = new AbortController().signal;
  const first = await service.open({ action: "launch", environmentId: bash.view.id }, signal);
  await service.close(first.id);
  environments = [zsh, bash];
  const next = await service.open({ action: "restart", sessionId: first.id }, signal);
  expect(next.environment).toEqual(bash.view);
  expect(launch.mock.calls).toHaveLength(2);
  await service.close(next.id);
  environments = [zsh];
  await expect(service.open({ action: "restart", sessionId: next.id }, signal)).rejects.toThrow(/fixture-bash.*不可用/);
  expect(launch.mock.calls).toHaveLength(2);
});
