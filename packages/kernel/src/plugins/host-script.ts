/**
 * 外部扩展宿主进程脚本（内嵌为字符串：不依赖打包后的文件位置；用 node / ELECTRON_RUN_AS_NODE 运行）。
 * 参数：<插件目录> <main 相对路径> <Engine 基址> <插件令牌> <数据目录>
 * 扩展拿到的 api：call(capability, input)（以 plugin:<id> 身份经 HTTP 调用 Engine，授权在 Dispatcher 判定）、
 * registerCommand(id, title, handler)、dataDir。扩展以用户的系统权限运行（安装前已提示）。
 */
export const PLUGIN_HOST_SCRIPT = String.raw`
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
const [, dir, main, baseUrl, token, dataDir] = process.argv;
const commands = new Map();
const send = (m) => { try { process.send && process.send(m); } catch {} };
const api = {
  dataDir,
  async call(capability, input = {}, opts = {}) {
    const res = await fetch(baseUrl + "/api/v1/call", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: opts.idempotencyKey || randomUUID() }),
    });
    const body = await res.json();
    if (body && body.ok) return body.data;
    const err = new Error((body && body.error && body.error.message) || "调用失败");
    err.code = body && body.error && body.error.code;
    throw err;
  },
  registerCommand(id, title, handler) {
    commands.set(id, handler);
    send({ type: "command", id, title });
  },
};
process.on("message", async (m) => {
  if (!m || m.type !== "run") return;
  const h = commands.get(m.id);
  if (!h) return send({ type: "result", reqId: m.reqId, ok: false, error: "命令不存在：" + m.id });
  try {
    send({ type: "result", reqId: m.reqId, ok: true, result: (await h(m.args || {})) ?? null });
  } catch (e) {
    send({ type: "result", reqId: m.reqId, ok: false, error: e && e.message ? e.message : String(e), code: e && e.code });
  }
});
process.on("disconnect", () => process.exit(0));
try {
  const mod = await import(pathToFileURL(path.join(dir, main)).href);
  if (typeof mod.activate !== "function") throw new Error("扩展没有导出 activate(api)");
  await mod.activate(api);
  send({ type: "ready" });
} catch (e) {
  send({ type: "failed", error: e && e.message ? e.message : String(e) });
  process.exit(1);
}
`;
