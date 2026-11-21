/** 外部扩展以系统用户权限运行。宿主通过已登记命令的 IPC 句柄访问 Engine。 */
export const PLUGIN_HOST_SCRIPT = String.raw`
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
const [, dir, main, dataDir] = process.argv;
const commands = new Map();
const calls = new Map();
const rejectedCalls = new WeakMap();
let activating = true;
const send = (message) => process.send?.(message);
const api = Object.freeze({
  dataDir,
  registerCommand(id, handler) {
    if (!activating || typeof id !== "string" || typeof handler !== "function" || commands.has(id)) throw new Error("无效的命令注册");
    commands.set(id, handler);
  },
});
process.on("message", async (message) => {
  if (message?.type === "child-result") {
    const pending = calls.get(message.callId);
    if (pending?.handle === message.handle) {
      calls.delete(message.callId);
      pending.settle(message.result);
    }
    return;
  }
  if (message?.type === "end") {
    for (const [callId, pending] of calls) {
      if (pending.handle !== message.handle) continue;
      calls.delete(callId);
      pending.settle({ ok: false, error: { code: "PERMISSION_DENIED", message: "委托已结束" } });
    }
    return;
  }
  if (message?.type !== "run") return;
  const { handle, id, args } = message;
  let active = true;
  const context = Object.freeze({
    call(capability, input = {}, step) {
      if (!active) return Promise.reject(new Error("委托已结束"));
      const callId = randomUUID();
      return new Promise((resolve, reject) => {
        calls.set(callId, { handle, settle(result) {
          if (result.ok) resolve(result.data);
          else {
            const error = Object.assign(new Error(result.error.message), { code: result.error.code });
            rejectedCalls.set(error, callId);
            reject(error);
          }
        } });
        send({ type: "child-call", handle, callId, capability, input, step });
      });
    },
  });
  try {
    const handler = commands.get(id);
    if (!handler) throw new Error("命令不存在");
    const result = (await handler(args, context)) ?? null;
    send({ type: "result", handle, ok: true, result });
  } catch (error) {
    send({ type: "result", handle, ok: false, failedCallId: rejectedCalls.get(error) });
  } finally {
    active = false;
  }
});
process.on("disconnect", () => process.exit(0));
try {
  const mod = await import(pathToFileURL(path.join(dir, main)).href);
  if (typeof mod.activate !== "function") throw new Error("扩展没有导出 activate(api)");
  await mod.activate(api);
  activating = false;
  send({ type: "ready", commands: [...commands.keys()] });
} catch (error) {
  send({ type: "failed", error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
  process.disconnect?.();
}
`;
