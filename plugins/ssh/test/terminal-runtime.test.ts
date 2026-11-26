import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { HuhuError } from "@huhu/contracts";
import type { WebSocket } from "ws";
import { expect, test, vi } from "vitest";
import { makeSshTerminalBridge } from "../src/engine/terminal-bridge.js";
import { SshLocalShells } from "../src/engine/local-shell.js";

class ViewSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = this.OPEN;
  bufferedAmount = 0;
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data.toString());
  }
  close() {
    this.readyState = 3;
    this.emit("close");
  }
  terminate() {
    this.close();
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

test("慢终端视图退出时释放控制，其他视图仍收到输出", async () => {
  const views: { onData(buffer: Buffer): void; detach: ReturnType<typeof vi.fn> }[] = [];
  const attach = makeSshTerminalBridge((_id, view) => {
    const detach = vi.fn();
    views.push({ onData: view.onData, detach });
    return { write: vi.fn(), resize: vi.fn(), detach };
  });
  const slow = new ViewSocket();
  const next = new ViewSocket();
  const options = { cols: 80, rows: 20, observe: false };
  await attach("ssh-fixture", slow.asSocket(), options);
  await attach("ssh-fixture", next.asSocket(), options);
  slow.bufferedAmount = 4 * 1024 * 1024;
  for (const view of views) view.onData(Buffer.from("live output"));
  await Promise.resolve();
  expect(views[0]!.detach).toHaveBeenCalledOnce();
  expect(slow.sent).not.toContain("live output");
  expect(views[1]!.detach).not.toHaveBeenCalled();
  expect(next.sent).toContain("live output");
  expect(next.sent).toContainEqual(expect.stringContaining("control-free"));
  next.close();
});

test("原生窗口交接绑定原控制者和 shell，失败保留输入，关闭目标将输入交回", async () => {
  const write = vi.fn();
  const attach = makeSshTerminalBridge((_id, view) => {
    view.onData(Buffer.from("existing history"));
    return { write, resize: vi.fn(), detach: vi.fn() };
  });
  const source = new ViewSocket();
  const target = new ViewSocket();
  const invalid = new ViewSocket();
  const browser = new ViewSocket();
  const id = randomUUID();
  const shellId = "ssh-original";
  const control = { cols: 80, rows: 24, observe: false, allowHandoff: true };
  const stage = { ...control, observe: true };
  const send = (socket: ViewSocket, type: string, id: string) => socket.emit("message", Buffer.from(JSON.stringify({ type, id })), false);
  await attach(shellId, source.asSocket(), control);
  await attach(shellId, invalid.asSocket(), stage);
  await attach(shellId, browser.asSocket(), { ...stage, allowHandoff: false });
  send(source, "prepare-handoff", id);
  expect(source.sent).toContain(JSON.stringify({ type: "handoff-prepared", id }));
  send(invalid, "claim-handoff", randomUUID());
  send(browser, "claim-handoff", id);
  expect(invalid.readyState).toBe(3);
  source.emit("message", Buffer.from("before handoff"), true);
  await attach(shellId, target.asSocket(), stage);
  expect(target.sent).toContain("existing history");
  send(target, "claim-handoff", id);
  expect(source.sent.at(-1)).toContain('"mode":"observe"');
  expect(target.sent.at(-1)).toContain('"mode":"control"');
  source.emit("message", Buffer.from("stale source"), true);
  target.emit("message", Buffer.from("new owner"), true);
  target.close();
  expect(source.sent.at(-1)).toContain('"mode":"control"');
  source.emit("message", Buffer.from("restored"), true);
  expect(write.mock.calls.map(([data]) => data.toString())).toEqual(["before handoff", "new owner", "restored"]);
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

test("Herdr 本地 PTY 保留 argv 并在停止时只回收自身终端", async () => {
  const { createHerdrLocalPty } = await import("../src/engine/local-pty-herdr.js");
  const calls: { method: string; params: object }[] = [];
  const core = {
    endpoint: "fixture",
    peek: async () => null,
    ensure: async () => ({
      async call<T>(method: string, params: object): Promise<T> {
        calls.push({ method, params });
        return (method === "terminal.run" ? { address: "t-test", state: "live" } : {}) as T;
      },
    }),
  };
  const wire: { close?: () => void } = {};
  const write = vi.fn();
  const resize = vi.fn();
  const end = vi.fn();
  const attach = vi.fn(async () => ({
    write,
    resize,
    onData: () => {},
    onClose: (fn: () => void) => {
      wire.close = fn;
    },
    close: () => wire.close?.(),
  }));
  const argv = ["C:/test/wsl.exe", "--distribution", "fixture distro"];
  const signal = new AbortController().signal;
  const pty = await createHerdrLocalPty(core, attach)({ argv, cwd: "/fixture", signal }, { data: () => {}, end });
  expect(calls[0]).toMatchObject({ method: "terminal.run", params: { argv, cwd: "/fixture", keep: false, no_parent: true } });
  expect(attach).toHaveBeenCalledWith("fixture", { terminal: "t-test", cols: 80, rows: 24, signal });
  pty.write(Buffer.from("text"));
  pty.resize(91, 28);
  await Promise.all([pty.stop(), pty.stop()]);
  expect(calls.slice(1)).toEqual([
    { method: "terminal.kill", params: { terminal: "t-test" } },
    { method: "terminal.rm", params: { terminal: "t-test" } },
  ]);
  expect(write).toHaveBeenCalledWith(Buffer.from("text"));
  expect(resize).toHaveBeenCalledWith(91, 28);
  expect(end).toHaveBeenCalledTimes(1);
});

test("本地 PTY 创建回包丢失时从可达 Core 按原启动标签回收", async () => {
  const { createHerdrLocalPty } = await import("../src/engine/local-pty-herdr.js");
  const transportLost = new HuhuError("HERDR_UNAVAILABLE", "fixture lost launch reply");
  const calls: { method: string; params: object }[] = [];
  let launchLabels: Record<string, string> | undefined;
  const core = {
    endpoint: "fixture",
    ensure: async () => ({
      async call<T>(method: string, params: object): Promise<T> {
        if (method === "terminal.run") launchLabels = (params as { labels: Record<string, string> }).labels;
        throw transportLost;
      },
    }),
    peek: async () => ({
      async call<T>(method: string, params: object): Promise<T> {
        calls.push({ method, params });
        if (method !== "terminal.list") return {} as T;
        return {
          terminals: [
            { address: "t-own", state: "live", labels: launchLabels },
            { address: "t-other", state: "live", labels: { "huhu.ssh-local": "other" } },
            { address: "elsewhere/t-peer", state: "live", labels: launchLabels },
          ],
        } as T;
      },
    }),
  };
  const attach = vi.fn();
  const launch = createHerdrLocalPty(core, attach);
  const signal = new AbortController().signal;
  await expect(launch({ argv: ["/bin/sh"], cwd: "/fixture", signal }, { data: vi.fn(), end: vi.fn() })).rejects.toBe(transportLost);
  expect(attach).not.toHaveBeenCalled();
  expect(calls).toEqual([
    { method: "terminal.list", params: { all: true, labels: launchLabels } },
    { method: "terminal.kill", params: { terminal: "t-own" } },
    { method: "terminal.rm", params: { terminal: "t-own" } },
  ]);
});

test("本地 PTY 创建回包丢失且无法对账时报告结果待核对", async () => {
  const { createHerdrLocalPty } = await import("../src/engine/local-pty-herdr.js");
  const core = {
    endpoint: "fixture",
    ensure: async () => ({
      async call<T>(): Promise<T> {
        throw new HuhuError("HERDR_UNAVAILABLE", "fixture lost launch reply");
      },
    }),
    peek: async () => null,
  };
  const attach = vi.fn();
  const launch = createHerdrLocalPty(core, attach);
  const signal = new AbortController().signal;
  await expect(launch({ argv: ["/bin/sh"], cwd: "/fixture", signal }, { data: vi.fn(), end: vi.fn() })).rejects.toMatchObject({
    code: "HERDR_UNAVAILABLE",
    retryable: false,
    details: { outcome: "unknown" },
  });
  expect(attach).not.toHaveBeenCalled();
});
