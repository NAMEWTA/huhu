import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vitest";

const attaches: { observe: boolean; writes: Buffer[]; resizes: [number, number][] }[] = [];
vi.mock("@huhu/herdr-client", () => ({
  attachTerminal: async (_e: unknown, o: { observe: boolean }) => {
    const rec = { observe: o.observe, writes: [] as Buffer[], resizes: [] as [number, number][] };
    attaches.push(rec);
    return { write: (b: Buffer) => rec.writes.push(b), resize: (c: number, r: number) => rec.resizes.push([c, r]), onData: () => undefined, onClose: () => undefined, close: () => undefined };
  },
}));
const { createTerminalBridge } = await import("../src/engine/terminal-bridge.js");

class FakeWs extends EventEmitter {
  OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  sent: (string | Buffer)[] = [];
  send(d: string | Buffer) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
    this.emit("close");
  }
}
const tick = () => new Promise((r) => setTimeout(r, 10));

describe("终端桥：同一会话只有一个视图可输入（ACC-AG-09）", () => {
  const bridge = createTerminalBridge({ sessions: { list: () => [{ id: "s1", terminalId: "t1" }] } as never, core: { ensure: async () => undefined, endpoint: {} } as never });

  test("第二个视图被降级为观察者：输入与尺寸调整都被忽略，并收到 mode 消息；第一个视图离开后下一个可以接管", async () => {
    attaches.length = 0;
    const a = new FakeWs();
    const b = new FakeWs();
    await bridge("s1", a as never, { cols: 80, rows: 24, observe: false });
    await bridge("s1", b as never, { cols: 100, rows: 30, observe: false });
    expect(attaches.map((x) => x.observe)).toEqual([false, true]);
    expect(b.sent).toContain(JSON.stringify({ type: "mode", mode: "observe" }));
    a.emit("message", Buffer.from("ls\n"), true);
    b.emit("message", Buffer.from("rm -rf /\n"), true);
    b.emit("message", Buffer.from(JSON.stringify({ type: "resize", cols: 10, rows: 10 })), false);
    await tick();
    expect(attaches[0]?.writes.map(String)).toEqual(["ls\n"]);
    expect(attaches[1]?.writes).toEqual([]);
    expect(attaches[1]?.resizes).toEqual([]);

    a.close();
    // 控制者离开：通知被降级的视图重新连接以接管输入（它不会永远只读）
    expect(b.sent).toContain(JSON.stringify({ type: "mode", mode: "control-free" }));
    const c = new FakeWs();
    await bridge("s1", c as never, { cols: 80, rows: 24, observe: false });
    expect(attaches[2]?.observe).toBe(false);
  });
});
