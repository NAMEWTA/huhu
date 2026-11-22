import { EventEmitter } from "node:events";
import { HuhuError } from "@huhu/contracts";
import type { WebSocket } from "ws";
import { expect, test, vi } from "vitest";
import { makeSshTerminalBridge } from "../src/engine/terminal-bridge.js";
import { SshLocalShells } from "../src/engine/local-shell.js";
import type { SshHandoffEvent, SshHandoffRequest } from "../src/shared/terminal-handoff.js";

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
  text(payload: object) {
    this.emit("message", Buffer.from(JSON.stringify(payload)), false);
  }
  input(text: string) {
    this.emit("message", Buffer.from(text), true);
  }
  events<T extends SshHandoffEvent["type"] | "mode">(type: T) {
    type Mode = { type: "mode"; mode: "control" | "observe" | "control-free" };
    return this.sent.flatMap((text) => {
      if (!text.startsWith("{")) return [];
      const event = JSON.parse(text) as SshHandoffEvent | Mode;
      return event.type === type ? [event as Extract<SshHandoffEvent | Mode, { type: T }>] : [];
    });
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

const fixtureShell = "ssh-handoff-fixture";

function handoffFixture() {
  const writes: string[] = [];
  const resizes: number[][] = [];
  const listeners: Array<Parameters<Parameters<typeof makeSshTerminalBridge>[0]>[1]> = [];
  const attacher = vi.fn((id: string, view: (typeof listeners)[number]) => {
    listeners.push(view);
    view.onData(Buffer.from(`回放 ${id}`));
    return {
      write: (data: Buffer) => {
        writes.push(data.toString());
      },
      resize: (cols: number, rows: number) => {
        resizes.push([cols, rows]);
      },
      detach: vi.fn(),
    };
  });
  const bridge = makeSshTerminalBridge(attacher);
  async function open({ shellId = fixtureShell, observe = false, desktopHandoff = true, cols = 80, rows = 24 } = {}) {
    const socket = new ViewSocket();
    expect(await bridge(shellId, socket.asSocket(), { observe, desktopHandoff, cols, rows })).toBe(true);
    return socket;
  }
  return { open, attacher, writes, resizes, listeners };
}

function prepare(source: ViewSocket, operationId = "window-move") {
  source.text({ type: "handoff.prepare", operationId } satisfies SshHandoffRequest);
  const result = source.events("handoff.prepared").at(-1);
  expect(result).toMatchObject({ operationId, ticket: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/u), expiresAt: expect.any(Number) });
  return result!;
}

test("桌面交接在原附着上比较交换控制，目标最新尺寸只接管一次", async () => {
  const { open, writes, resizes, attacher, listeners } = handoffFixture();
  const source = await open();
  const queued = await open();
  const target = await open({ observe: true, cols: 95, rows: 28 });
  expect(target.sent.slice(0, 2)).toEqual([`回放 ${fixtureShell}`, '{"type":"mode","mode":"observe"}']);
  const prepared = prepare(source);
  const { ticket, operationId } = prepared;
  expect(prepared.targetMode).toBe("control");
  expect(prepare(source, operationId)).toEqual(prepared);

  source.text({ type: "handoff.commit", ticket });
  expect(source.events("handoff.failed").at(-1)).toMatchObject({ reason: "target-required" });
  target.text({ type: "handoff.claim", ticket, cols: 110, rows: 32 });
  target.text({ type: "handoff.claim", ticket, cols: 115, rows: 34 });
  expect(source.events("handoff.claimed")).toEqual([{ type: "handoff.claimed", operationId, ticket, targetMode: "observe" }]);
  expect(target.events("handoff.claimed")).toHaveLength(2);
  target.text({ type: "resize", cols: 123, rows: 37 });
  target.input("目标提交前");
  queued.input("第三方排队中");
  source.input("源提交前");
  expect(writes).toEqual(["源提交前"]);
  expect(resizes).toEqual([[80, 24]]);

  source.text({ type: "handoff.commit", ticket });
  expect(source.events("mode").map(({ mode }) => mode)).toEqual(["control", "observe"]);
  expect(target.events("mode").map(({ mode }) => mode)).toEqual(["observe", "control"]);
  const committed = { type: "handoff.committed", operationId, ticket, sourceMode: "observe", targetMode: "control" };
  expect(source.events("handoff.committed")).toEqual([committed]);
  expect(target.events("handoff.committed")).toEqual([committed]);
  source.text({ type: "handoff.commit", ticket });
  expect(source.events("handoff.committed")).toEqual([committed, committed]);
  expect(target.events("handoff.committed")).toEqual([committed]);

  source.input("源迟到");
  source.text({ type: "resize", cols: 500, rows: 200 });
  target.input("目标提交后");
  target.text({ type: "resize", cols: 999, rows: 400 });
  queued.input("排队者迟到");
  expect(writes).toEqual(["源提交前", "目标提交后"]);
  expect(resizes).toEqual([
    [80, 24],
    [123, 37],
    [500, 300],
  ]);
  expect(attacher.mock.calls.map(([id]) => id)).toEqual([fixtureShell, fixtureShell, fixtureShell]);
  source.close();
  expect(attacher.mock.results[0]?.value.detach).toHaveBeenCalledOnce();
  expect(queued.events("mode").map(({ mode }) => mode)).toEqual(["observe"]);
  listeners[2]!.onData(Buffer.from("同一 shell 实时输出"));
  expect(target.sent).toContain("同一 shell 实时输出");
  target.close();
  expect(queued.events("mode").map(({ mode }) => mode)).toEqual(["observe", "control-free"]);
  queued.close();
});

test.each([true, false])("观察源交接维持原控制，显式观察模式为 %s", async (observe) => {
  const { open, writes, resizes } = handoffFixture();
  const holder = await open();
  const source = await open({ observe });
  const ordinaryWaiter = await open();
  const target = await open({ observe: true });
  const { ticket, targetMode } = prepare(source);
  expect(targetMode).toBe("observe");
  target.text({ type: "handoff.claim", ticket });
  source.text({ type: "handoff.commit", ticket });
  expect(target.events("handoff.committed")).toEqual([expect.objectContaining({ targetMode: "observe", sourceMode: "observe" })]);
  expect(target.events("mode").map(({ mode }) => mode)).toEqual(["observe", "observe"]);
  source.input("仍然观察");
  target.input("目标仍观察");
  holder.input("原控制者保持输入");
  expect(writes).toEqual(["原控制者保持输入"]);
  expect(resizes).toEqual([[80, 24]]);
  holder.close();
  expect(source.events("mode").map(({ mode }) => mode)).toEqual(["observe", "observe"]);
  expect(target.events("mode").at(-1)?.mode).toBe("observe");
  expect(ordinaryWaiter.events("mode").at(-1)?.mode).toBe("control-free");
  source.close();
  ordinaryWaiter.close();
  target.close();
});

test("凭证绑定同一 shell、批准的桌面视图及唯一观察候选", async () => {
  const { open, writes, resizes } = handoffFixture();
  const source = await open();
  const target = await open({ observe: true });
  const secondTarget = await open({ observe: true });
  const queued = await open();
  const otherShell = await open({ shellId: "ssh-other", observe: true });
  const web = await open({ desktopHandoff: false, observe: true });
  const local = await open({ shellId: "ssh-local-fixture", observe: true });
  const publicTool = await open({ shellId: "ssh-external-fixture", observe: true });
  const { ticket } = prepare(source);
  for (const unavailable of [web, local, publicTool]) {
    unavailable.text({ type: "handoff.claim", ticket, desktopHandoff: true });
    unavailable.text({ type: "handoff.prepare", operationId: "spoof", desktopHandoff: true });
    expect(unavailable.events("handoff.failed").map(({ reason }) => reason)).toEqual(["not-allowed", "not-allowed"]);
    expect(unavailable.events("handoff.prepared")).toEqual([]);
  }
  otherShell.text({ type: "handoff.claim", ticket });
  expect(otherShell.events("handoff.failed").at(-1)?.reason).toBe("invalid-ticket");
  queued.text({ type: "handoff.claim", ticket });
  expect(queued.events("handoff.failed").at(-1)?.reason).toBe("wrong-role");
  target.text({ type: "handoff.claim", ticket, cols: 99 });
  expect(target.events("handoff.failed").at(-1)?.reason).toBe("malformed");
  target.text({ type: "handoff.claim", ticket });
  secondTarget.text({ type: "handoff.claim", ticket });
  expect(secondTarget.events("handoff.failed").at(-1)?.reason).toBe("busy");
  secondTarget.text({ type: "handoff.prepare", operationId: "competing" });
  expect(secondTarget.events("handoff.failed").at(-1)?.reason).toBe("busy");
  target.text({ type: "handoff.commit", ticket });
  expect(target.events("handoff.failed").at(-1)?.reason).toBe("wrong-role");
  secondTarget.text({ type: "handoff.cancel", ticket });
  expect(secondTarget.events("handoff.failed").at(-1)?.reason).toBe("wrong-role");
  target.input("目标准备中");
  source.input("源仍输入");
  expect(writes).toEqual(["源仍输入"]);
  expect(resizes).toEqual([[80, 24]]);
  for (const socket of [source, target, secondTarget, queued, otherShell, web, local, publicTool]) socket.close();
});

test.each(["target-closed", "cancelled", "target-backpressure"] as const)("目标交接失败时由源保留控制，原因为 %s", async (reason) => {
  const { open, writes, resizes } = handoffFixture();
  const source = await open();
  const target = await open({ observe: true });
  const queued = await open();
  const { ticket, operationId } = prepare(source);
  target.text({ type: "handoff.claim", ticket });
  if (reason === "target-closed") target.close();
  if (reason === "cancelled") target.text({ type: "handoff.cancel", ticket });
  if (reason === "target-backpressure") {
    target.bufferedAmount = 4 * 1024 * 1024 - 32;
    source.text({ type: "handoff.commit", ticket });
    await Promise.resolve();
  }
  const cancelled = { type: "handoff.cancelled", operationId, ticket, reason };
  expect(source.events("handoff.cancelled")).toEqual([cancelled]);
  source.text({ type: "handoff.commit", ticket });
  source.text({ type: "handoff.prepare", operationId });
  expect(source.events("handoff.cancelled")).toEqual([cancelled, cancelled, cancelled]);
  expect(queued.events("mode").at(-1)?.mode).toBe("observe");
  source.input("原控制者仍输入");
  target.input("无权输入");
  expect(writes).toEqual(["原控制者仍输入"]);
  expect(resizes).toEqual([[80, 24]]);
  source.close();
  if (target.readyState === target.OPEN) target.close();
  queued.close();
});

test("源可以在目标附着前取消，迟到认领不会获权", async () => {
  const { open, writes, resizes } = handoffFixture();
  const source = await open();
  const { ticket } = prepare(source);
  source.text({ type: "handoff.cancel", ticket });
  expect(source.events("handoff.cancelled").at(-1)).toMatchObject({ ticket, reason: "cancelled" });
  const late = await open({ observe: true });
  late.text({ type: "handoff.claim", ticket });
  expect(late.events("handoff.failed").at(-1)?.reason).toBe("invalid-ticket");
  expect(late.events("mode").map(({ mode }) => mode)).toEqual(["observe"]);
  late.input("迟到目标");
  source.input("保持原控制");
  expect(writes).toEqual(["保持原控制"]);
  expect(resizes).toEqual([[80, 24]]);
  source.close();
  late.close();
});

test("源关闭释放原等待队列，shell 退出撤销待定交接", async () => {
  const { open, listeners, writes, resizes } = handoffFixture();
  const source = await open();
  const target = await open({ observe: true });
  const queued = await open();
  const { ticket } = prepare(source);
  target.text({ type: "handoff.claim", ticket });
  source.close();
  expect(target.events("handoff.cancelled").at(-1)).toMatchObject({ reason: "source-closed" });
  expect(target.events("mode").at(-1)?.mode).toBe("observe");
  expect(queued.events("mode").at(-1)?.mode).toBe("control-free");
  const remount = await open();
  const another = prepare(remount, "next-move");
  target.text({ type: "handoff.claim", ticket: another.ticket });
  listeners.at(-1)!.onEnd();
  expect(target.events("handoff.cancelled").at(-1)).toMatchObject({ ticket: another.ticket, reason: "shell-ended" });
  expect(remount.sent).toContain('{"type":"closed","reason":{"reason":"exited"}}');
  remount.text({ type: "handoff.commit", ticket: another.ticket });
  target.input("不能写给结束的 shell");
  expect(writes).toEqual([]);
  expect(resizes).toEqual([
    [80, 24],
    [80, 24],
  ]);
  target.close();
  queued.close();
});

test("过期交接和成功回执有明确期限，目标关闭后旧提交只对账", async () => {
  vi.useFakeTimers();
  try {
    const { open, writes, resizes } = handoffFixture();
    const source = await open();
    const target = await open({ observe: true });
    const expired = prepare(source, "expiring");
    target.text({ type: "handoff.claim", ticket: expired.ticket });
    vi.advanceTimersByTime(30_000);
    expect(source.events("handoff.cancelled").at(-1)).toMatchObject({ ticket: expired.ticket, reason: "expired" });
    expect(target.events("handoff.cancelled").at(-1)).toMatchObject({ ticket: expired.ticket, reason: "expired" });
    target.text({ type: "handoff.claim", ticket: expired.ticket });
    expect(target.events("handoff.failed").at(-1)?.reason).toBe("invalid-ticket");
    expect(vi.getTimerCount()).toBe(1); // Only the source's most recent receipt remains.
    source.input("过期后仍由源控制");

    const next = prepare(source, "new-attempt");
    target.text({ type: "handoff.claim", ticket: next.ticket });
    source.text({ type: "handoff.commit", ticket: next.ticket });
    const committed = source.events("handoff.committed").at(-1);
    target.close();
    const incumbent = await open();
    source.text({ type: "handoff.commit", ticket: next.ticket });
    expect(source.events("handoff.committed")).toEqual([committed, committed]);
    incumbent.input("新现任不受旧提交影响");
    source.input("旧源提交不会取回控制");
    expect(writes).toEqual(["过期后仍由源控制", "新现任不受旧提交影响"]);
    expect(resizes).toEqual([
      [80, 24],
      [80, 24],
      [80, 24],
    ]);
    vi.advanceTimersByTime(30_000);
    expect(vi.getTimerCount()).toBe(0);
    source.text({ type: "handoff.commit", ticket: next.ticket });
    expect(source.events("handoff.failed").at(-1)?.reason).toBe("invalid-ticket");
    incumbent.close();
    source.close();
  } finally {
    vi.useRealTimers();
  }
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
