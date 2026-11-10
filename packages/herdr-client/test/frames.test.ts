import net from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { FrameDecoder, FrameKind, HerdrClient, HerdrError, MAX_PAYLOAD, creditFrame, encodeFrame, resizeFrame } from "../src/index.js";

describe("帧编解码", () => {
  test("往返；任意切分都能还原；多帧粘包", () => {
    const a = encodeFrame({ channel: 7, kind: FrameKind.DATA, payload: Buffer.from("你好") });
    const b = creditFrame(7, 1234);
    const c = resizeFrame(7, 120, 40);
    const all = Buffer.concat([a, b, c]);
    for (const cut of [1, 3, 9, 10, all.length - 1]) {
      const d = new FrameDecoder();
      const frames = [...d.push(all.subarray(0, cut)), ...d.push(all.subarray(cut))];
      expect(frames.map((f) => [f.channel, f.kind])).toEqual([[7, 0], [7, 1], [7, 3]]);
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
    const h = Buffer.alloc(9); h.writeUInt32LE(MAX_PAYLOAD + 1, 5);
    expect(() => d.push(h)).toThrow(RangeError);
    expect(() => encodeFrame({ channel: 0, kind: 0, payload: Buffer.alloc(MAX_PAYLOAD + 1) })).toThrow(RangeError);
  });
});

describe("HerdrClient（假 Core）", () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

  async function fakeCore() {
    const dir = mkdtempSync(path.join(tmpdir(), "huhu-hc-")); dirs.push(dir);
    const sock = path.join(dir, "hc.sock");
    let framed = false;
    const dec = new FrameDecoder();
    const server = net.createServer((s) => {
      let buf = "";
      const reply = (m: unknown) => s.write(framed ? encodeFrame({ channel: 0, kind: FrameKind.DATA, payload: Buffer.from(JSON.stringify(m)) }) : JSON.stringify(m) + "\n");
      const handle = (text: string) => {
        const req = JSON.parse(text) as { id: number; method: string; params: unknown };
        if (req.method === "hello") { reply({ jsonrpc: "2.0", id: req.id, result: { features: ["automatic_input"] } }); framed = true; }
        else if (req.method === "terminal.list") reply({ jsonrpc: "2.0", id: req.id, result: { terminals: [] } });
        else if (req.method === "terminal.get") reply({ jsonrpc: "2.0", id: req.id, error: { code: -32000, message: "no terminal t9", data: { kind: "not_found" } } });
        else if (req.method === "slow") { /* 不回复，测超时 */ }
        else if (req.method === "events") { s.write(JSON.stringify({ jsonrpc: "2.0", method: "event", params: { seq: 1, type: "status", terminal: "t1" } }) + "\n"); reply({ jsonrpc: "2.0", id: req.id, result: {} }); }
      };
      s.on("data", (d) => {
        if (!framed) { buf += d.toString(); let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) handle(l); } }
        else for (const f of dec.push(d)) if (f.channel === 0) handle(f.payload.toString());
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
    c.close(); core.close();
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
