import net from "node:net";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FrameDecoder, FrameKind, HerdrClient, HerdrError, MAX_PAYLOAD, creditFrame, encodeFrame, resizeFrame, subscribeEvents } from "../src/index.js";

/** 假 Core 的监听地址：Windows 用命名管道（临时目录里的 .sock 文件在 Windows 上不能 listen）。 */
const sockIn = (dir: string, name: string): string => (process.platform === "win32" ? `\\\\.\\pipe\\huhu-${path.basename(dir)}-${name}` : path.join(dir, name));

describe("帧编解码", () => {
  test("往返；任意切分都能还原；多帧粘包", () => {
    const a = encodeFrame({ channel: 7, kind: FrameKind.DATA, payload: Buffer.from("你好") });
    const b = creditFrame(7, 1234);
    const c = resizeFrame(7, 120, 40);
    const all = Buffer.concat([a, b, c]);
    for (const cut of [1, 3, 9, 10, all.length - 1]) {
      const d = new FrameDecoder();
      const frames = [...d.push(all.subarray(0, cut)), ...d.push(all.subarray(cut))];
      expect(frames.map((f) => [f.channel, f.kind])).toEqual([
        [7, 0],
        [7, 1],
        [7, 3],
      ]);
      expect(frames[0]?.payload.toString()).toBe("你好");
      expect(frames[1]?.payload.readUInt32LE(0)).toBe(1234);
      expect([frames[2]?.payload.readUInt16LE(0), frames[2]?.payload.readUInt16LE(2)]).toEqual([120, 40]);
    }
  });
  test("头部布局：channel u32 LE, kind u8, len u32 LE", () => {
    const f = encodeFrame({ channel: 0x01020304, kind: 2, payload: Buffer.from([9, 9]) });
    expect([...f]).toEqual([4, 3, 2, 1, 2, 2, 0, 0, 0, 9, 9]);
  });
  test("超限长度拒绝", () => {
    const d = new FrameDecoder();
    const h = Buffer.alloc(9);
    h.writeUInt32LE(MAX_PAYLOAD + 1, 5);
    expect(() => d.push(h)).toThrow(RangeError);
    expect(() => encodeFrame({ channel: 0, kind: 0, payload: Buffer.alloc(MAX_PAYLOAD + 1) })).toThrow(RangeError);
  });
});

describe("HerdrClient（假 Core）", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  async function fakeCore() {
    const dir = mkdtempSync(path.join(tmpdir(), "huhu-hc-"));
    dirs.push(dir);
    const sock = sockIn(dir, "hc.sock");
    let framed = false;
    const dec = new FrameDecoder();
    const server = net.createServer((s) => {
      let buf = "";
      const reply = (m: unknown) => s.write(framed ? encodeFrame({ channel: 0, kind: FrameKind.DATA, payload: Buffer.from(JSON.stringify(m)) }) : JSON.stringify(m) + "\n");
      const handle = (text: string) => {
        const req = JSON.parse(text) as { id: number; method: string; params: unknown };
        if (req.method === "hello") {
          reply({ jsonrpc: "2.0", id: req.id, result: { features: ["automatic_input"] } });
          framed = true;
        } else if (req.method === "terminal.list") reply({ jsonrpc: "2.0", id: req.id, result: { terminals: [] } });
        else if (req.method === "terminal.get") reply({ jsonrpc: "2.0", id: req.id, error: { code: -32000, message: "no terminal t9", data: { kind: "not_found" } } });
        else if (req.method === "slow") {
          /* 不回复，测超时 */
        } else if (req.method === "events") {
          s.write(JSON.stringify({ jsonrpc: "2.0", method: "event", params: { seq: 1, type: "status", terminal: "t1" } }) + "\n");
          reply({ jsonrpc: "2.0", id: req.id, result: {} });
        }
      };
      s.on("data", (d) => {
        if (!framed) {
          buf += d.toString();
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const l = buf.slice(0, i);
            buf = buf.slice(i + 1);
            if (l.trim()) handle(l);
          }
        } else for (const f of dec.push(d)) if (f.channel === 0) handle(f.payload.toString());
      });
    });
    await new Promise<void>((r) => server.listen(sock, r));
    return { sock, close: () => server.close() };
  }

  test("plain 调用、错误映射、超时、事件通知、framed 切换后继续调用", async () => {
    const core = await fakeCore();
    const events: unknown[] = [];
    const c = new HerdrClient({ endpoint: core.sock, timeoutMs: 300, onEvent: (e) => events.push(e) });
    await c.connect();
    expect(await c.call("terminal.list")).toEqual({ terminals: [] });
    await expect(c.call("terminal.get", { id: "t9" })).rejects.toMatchObject({ name: "HerdrError", kind: "not_found" });
    await expect(c.call("slow")).rejects.toMatchObject({ code: "HERDR_UNAVAILABLE" });
    await c.call("events");
    expect(events).toEqual([{ seq: 1, type: "status", terminal: "t1" }]);
    await c.hello();
    expect(await c.call("terminal.list")).toEqual({ terminals: [] }); // framed 模式
    c.close();
    core.close();
    expect(HerdrError).toBeDefined();
  });
  test("连不上 → HERDR_UNAVAILABLE；断开后挂起的调用被拒绝", async () => {
    await expect(new HerdrClient({ endpoint: "/nonexistent/hc.sock" }).connect()).rejects.toMatchObject({ code: "HERDR_UNAVAILABLE" });
    const core = await fakeCore();
    let closed = 0;
    const c = new HerdrClient({ endpoint: core.sock, timeoutMs: 5000, onClose: () => closed++ });
    await c.connect();
    const p = c.call("slow");
    c.close();
    await expect(p).rejects.toMatchObject({ code: "HERDR_UNAVAILABLE" });
    expect(closed).toBe(1);
    core.close();
  });
});

describe("HerdrClient 字节流", () => {
  function controlledSocket() {
    // Drive data boundaries directly. Two writes to a real socket may be delivered together.
    const socket = new net.Socket();
    const createConnection = vi.spyOn(net, "createConnection").mockReturnValueOnce(socket);
    vi.spyOn(socket, "write").mockReturnValue(true);
    return {
      socket,
      data: (bytes: Buffer) => socket.emit("data", bytes),
      cleanup: () => {
        createConnection.mockRestore();
        socket.destroy();
      },
    };
  }

  const line = (message: object) => Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\r\n");

  test("中文与 Emoji 回执在每一个字节切点以及逐字节交付时一致", async () => {
    const wire = controlledSocket();
    const client = new HerdrClient({ endpoint: "fixture" });
    try {
      const connected = client.connect();
      wire.socket.emit("connect");
      await connected;
      const result = { title: "日报📌" };
      const replyFor = (id: number) => Buffer.from(`{"jsonrpc":"2.0","id":${String(id).padEnd(3)},"result":${JSON.stringify(result)}}\r\n`);
      const bytes = replyFor(1).length;
      for (let cut = 1; cut < bytes; cut++) {
        const pending = client.call("terminal.get");
        const reply = replyFor(cut);
        wire.data(reply.subarray(0, cut));
        wire.data(reply.subarray(cut));
        await expect(pending).resolves.toEqual(result);
      }
      const pending = client.call("terminal.get");
      for (const byte of replyFor(bytes)) wire.data(Buffer.from([byte]));
      await expect(pending).resolves.toEqual(result);
    } finally {
      wire.cleanup();
    }
  });

  test("普通订阅按序处理多行，断线时丢弃未结束行并报告一次", async () => {
    const wire = controlledSocket();
    const events: unknown[] = [];
    const onLost = vi.fn();
    try {
      const subscribed = subscribeEvents("fixture", { onEvent: (event) => events.push(event), onLost });
      wire.socket.emit("connect");
      await Promise.resolve();
      const snapshot = { seq: 40, terminals: [{ title: "日报📌" }] };
      const reply = line({ id: 1, result: snapshot });
      const first = { seq: 41, type: "status", data: "中文📌" };
      const second = { seq: 42, type: "status", data: "收尾🌈" };
      const cut = reply.indexOf(Buffer.from("📌")) + 2;
      wire.data(reply.subarray(0, cut));
      wire.data(
        Buffer.concat([
          reply.subarray(cut),
          Buffer.from("\nnot-json\r\n"),
          line({ method: "event", params: first }),
          line({ method: "event", params: second }),
          line({ method: "event", params: { seq: 43, type: "status" } }).subarray(0, -2),
        ]),
      );
      await expect(subscribed).resolves.toMatchObject({ snapshot });
      const closed = once(wire.socket, "close");
      wire.socket.destroy();
      await closed;
      expect(events).toEqual([first, second]);
      expect(onLost).toHaveBeenCalledExactlyOnceWith("closed");
    } finally {
      wire.cleanup();
    }
  });

  test("未结束行积累超过上限时关闭 socket 并拒绝待定调用", async () => {
    const wire = controlledSocket();
    const client = new HerdrClient({ endpoint: "fixture" });
    try {
      const connected = client.connect();
      wire.socket.emit("connect");
      await connected;
      const pending = expect(client.call("terminal.get")).rejects.toMatchObject({ code: "HERDR_UNAVAILABLE" });
      wire.data(Buffer.alloc(MAX_PAYLOAD, 0x20));
      expect(wire.socket.destroyed).toBe(false);
      wire.data(Buffer.from(" "));
      expect(wire.socket.destroyed).toBe(true);
      await pending;
    } finally {
      wire.cleanup();
    }
  });

  test("无效 UTF-8 不会以替代字符交付给调用者", async () => {
    const wire = controlledSocket();
    const client = new HerdrClient({ endpoint: "fixture" });
    try {
      const connected = client.connect();
      wire.socket.emit("connect");
      await connected;
      const pending = expect(client.call("terminal.get")).rejects.toMatchObject({ code: "HERDR_UNAVAILABLE" });
      wire.data(Buffer.concat([Buffer.from('{"jsonrpc":"2.0","id":1,"result":"'), Buffer.from([0xff]), Buffer.from('"}\n')]));
      await pending;
    } finally {
      wire.cleanup();
    }
  });

  test("hello 的最后一段与二进制帧同块时保持帧原字节", async () => {
    const wire = controlledSocket();
    const client = new HerdrClient({ endpoint: "fixture" });
    const onFrame = vi.fn();
    try {
      const connected = client.connect();
      wire.socket.emit("connect");
      await connected;
      client.onStream(7, onFrame);
      const pending = client.hello();
      const reply = line({ id: 1, result: { name: "中文📌" } });
      const payload = Buffer.from([0xff, 0x0a, 0x00, 0xe4, 0xb8]);
      const frame = encodeFrame({ channel: 7, kind: FrameKind.DATA, payload });
      const cut = reply.indexOf(Buffer.from("📌")) + 2;
      wire.data(reply.subarray(0, cut));
      wire.data(Buffer.concat([reply.subarray(cut), frame.subarray(0, 5)]));
      wire.data(frame.subarray(5));
      await expect(pending).resolves.toEqual({ name: "中文📌" });
      expect(onFrame).toHaveBeenCalledExactlyOnceWith({ channel: 7, kind: FrameKind.DATA, payload });
    } finally {
      wire.cleanup();
    }
  });
});

describe("attachTerminal 审计回归", () => {
  const dirs2: string[] = [];
  afterEach(() => {
    for (const d of dirs2.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  async function core(onAttach: (s: net.Socket) => void) {
    const dir = mkdtempSync(path.join(tmpdir(), "huhu-at-"));
    dirs2.push(dir);
    const sock = sockIn(dir, "c.sock");
    const server = net.createServer((s) => {
      let framed = false;
      let buf = "";
      const dec = new FrameDecoder();
      const reply = (m: unknown) => s.write(framed ? encodeFrame({ channel: 0, kind: FrameKind.DATA, payload: Buffer.from(JSON.stringify(m)) }) : JSON.stringify(m) + "\n");
      const handle = (text: string) => {
        const req = JSON.parse(text) as { id: number; method: string };
        if (req.method === "hello") {
          reply({ jsonrpc: "2.0", id: req.id, result: {} });
          framed = true;
        } else if (req.method === "terminal.attach") {
          onAttach(s);
          void req;
        }
      };
      s.on("error", () => undefined);
      s.on("data", (d) => {
        if (!framed) {
          buf += d.toString();
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const l = buf.slice(0, i);
            buf = buf.slice(i + 1);
            if (l.trim()) handle(l);
          }
        } else for (const f of dec.push(d)) if (f.channel === 0) handle(f.payload.toString());
      });
    });
    await new Promise<void>((r) => server.listen(sock, r));
    return { sock, close: () => server.close() };
  }

  test("attach 回复与首屏输出、CLOSE 在同一个读块里到达：不丢首屏，也不丢结束通知", async () => {
    const { attachTerminal } = await import("../src/index.js");
    const c = await core((s) => {
      const reply = encodeFrame({ channel: 0, kind: FrameKind.DATA, payload: Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { channel: 5 } })) });
      const paint = encodeFrame({ channel: 5, kind: FrameKind.DATA, payload: Buffer.from("FIRST-PAINT") });
      const close = encodeFrame({ channel: 5, kind: FrameKind.CLOSE, payload: Buffer.from(JSON.stringify({ reason: "exited", exit_code: 0 })) });
      s.write(Buffer.concat([reply, paint, close])); // 一次写入 = 一个读块
    });
    const t = await attachTerminal(c.sock, { terminal: "t1", cols: 80, rows: 24 });
    let got = "";
    let reason: unknown = "unset";
    t.onData((b) => {
      got += b.toString();
    });
    t.onClose((r) => {
      reason = r;
    });
    expect(got).toBe("FIRST-PAINT");
    expect(reason).toMatchObject({ reason: "exited" });
    c.close();
  });

  test("attach 被拒绝时关闭 socket（不泄漏）", async () => {
    const { attachTerminal } = await import("../src/index.js");
    let conns = 0;
    let closed = 0;
    const dir = mkdtempSync(path.join(tmpdir(), "huhu-at-"));
    dirs2.push(dir);
    const sock = sockIn(dir, "c.sock");
    const server = net.createServer((s) => {
      conns++;
      s.on("close", () => {
        closed++;
      });
      s.on("error", () => undefined);
      let framed = false;
      const dec = new FrameDecoder();
      let buf = "";
      const reply = (m: unknown) => s.write(framed ? encodeFrame({ channel: 0, kind: FrameKind.DATA, payload: Buffer.from(JSON.stringify(m)) }) : JSON.stringify(m) + "\n");
      const handle = (text: string) => {
        const req = JSON.parse(text) as { id: number; method: string };
        if (req.method === "hello") {
          reply({ jsonrpc: "2.0", id: req.id, result: {} });
          framed = true;
        } else reply({ jsonrpc: "2.0", id: req.id, error: { code: -32000, message: "no terminal", data: { kind: "not_found" } } });
      };
      s.on("data", (d) => {
        if (!framed) {
          buf += d.toString();
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const l = buf.slice(0, i);
            buf = buf.slice(i + 1);
            if (l.trim()) handle(l);
          }
        } else for (const f of dec.push(d)) if (f.channel === 0) handle(f.payload.toString());
      });
    });
    await new Promise<void>((r) => server.listen(sock, r));
    await expect(attachTerminal(sock, { terminal: "t9", cols: 80, rows: 24 })).rejects.toMatchObject({ name: "HerdrError", kind: "not_found" });
    for (let i = 0; i < 50 && closed < conns; i++) await new Promise((r) => setTimeout(r, 20));
    expect(closed).toBe(conns);
    server.close();
  });

  test("背压：canSend 为 false 时不回报 CREDIT，恢复后补报", async () => {
    const { attachTerminal } = await import("../src/index.js");
    const credits: number[] = [];
    const c = await core((s) => {
      const reply = encodeFrame({ channel: 0, kind: FrameKind.DATA, payload: Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { channel: 7 } })) });
      s.write(reply);
      setTimeout(() => s.write(encodeFrame({ channel: 7, kind: FrameKind.DATA, payload: Buffer.alloc(1000) })), 50);
      const dec = new FrameDecoder();
      s.on("data", (d) => {
        for (const f of dec.push(d)) if (f.channel === 7 && f.kind === FrameKind.CREDIT) credits.push(f.payload.readUInt32LE(0));
      });
    });
    let ok = false;
    const t = await attachTerminal(c.sock, { terminal: "t1", cols: 80, rows: 24, canSend: () => ok });
    t.onData(() => undefined);
    await new Promise((r) => setTimeout(r, 300));
    expect(credits).toEqual([]);
    ok = true;
    await new Promise((r) => setTimeout(r, 200));
    expect(credits).toEqual([1000]);
    t.close();
    c.close();
  });
});
