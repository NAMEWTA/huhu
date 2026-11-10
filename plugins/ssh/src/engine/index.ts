import path from "node:path";
import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { HostStore } from "./hosts.js";
import { SshManager } from "./manager.js";

export { HostStore } from "./hosts.js";
export { SshManager } from "./manager.js";

const Auth = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("key"), secretRef: z.string().regex(/^safe:\/\//), passphraseRef: z.string().regex(/^safe:\/\//).optional() }),
  z.object({ kind: z.literal("password"), secretRef: z.string().regex(/^safe:\/\//) }),
  z.object({ kind: z.literal("agent") }),
]);
const Host = z.object({ id: z.string(), name: z.string(), host: z.string(), port: z.number(), user: z.string(), auth: Auth, jumpHostIds: z.array(z.string()), tags: z.array(z.string()), connectTimeoutSec: z.number() });
const Ok = z.object({ ok: z.literal(true) });
const desktop = { exposable: false, defaultExposed: false } as const;

export function apply(ctx: Context, api: HuhuApi): { manager: SshManager } {
  const root = path.join(api.vault.files.root, ".huhu", "ssh");
  const hosts = new HostStore(path.join(root, "hosts"));
  const manager = new SshManager({
    hosts,
    knownHostsFile: path.join(root, "known_hosts"),
    auditDir: path.join(root, "audit"),
    // 秘密只经 SecretUse 取得，且仅限被允许引用的模块（ssh）
    resolveSecret: (ref, purpose) => {
      const su = api.service<{ resolve(ref: string, c: { plugin: string; purpose: string }): string }>("secretUse");
      if (!su) throw Object.assign(new Error("保险箱插件未启用"), { code: "SECRET_REF_INVALID" });
      return su.resolve(ref, { plugin: "ssh", purpose });
    },
    publish: (t, p) => api.events.publish(t, p),
    now: () => new Date(),
  });
  ctx.effect(() => () => manager.disposeAll()); // 插件停用 / Vault 关闭：断开全部连接

  api.defineCapability(def({ name: "ssh.hosts.list", plugin: "ssh", scope: "read", ...desktop, input: z.object({}), output: z.array(Host), handler: () => hosts.list() }));
  api.defineCapability(def({
    name: "ssh.hosts.save", plugin: "ssh", scope: "write", ...desktop,
    input: z.object({ id: z.string().optional(), name: z.string(), host: z.string(), port: z.number().int().default(22), user: z.string(), auth: Auth, jumpHostIds: z.array(z.string()).default([]), tags: z.array(z.string()).default([]), connectTimeoutSec: z.number().default(20) }), output: Host,
    handler: (_c, i) => hosts.save(i as never),
  }));
  api.defineCapability(def({ name: "ssh.hosts.delete", plugin: "ssh", scope: "write", ...desktop, input: z.object({ id: z.string() }), output: Ok, handler: (_c, i) => (manager.disconnect(i.id), hosts.delete(i.id), { ok: true as const }) }));
  api.defineCapability(def({ name: "ssh.connect", plugin: "ssh", scope: "execute", ...desktop, timeoutMs: 5 * 60_000, input: z.object({ hostId: z.string() }), output: z.object({ attemptId: z.string() }), handler: (_c, i) => manager.connect(i.hostId) }));
  api.defineCapability(def({ name: "ssh.disconnect", plugin: "ssh", scope: "execute", ...desktop, input: z.object({ hostId: z.string() }), output: Ok, handler: (_c, i) => (manager.disconnect(i.hostId), { ok: true as const }) }));
  api.defineCapability(def({ name: "ssh.hostKey.decide", plugin: "ssh", scope: "execute", ...desktop, input: z.object({ attemptId: z.string(), hop: z.number().int(), accept: z.boolean() }), output: z.object({ applied: z.boolean() }), handler: (_c, i) => ({ applied: manager.decide(i.attemptId, i.hop, i.accept) }) }));
  api.defineCapability(def({
    name: "ssh.exec.run", plugin: "ssh", scope: "execute", ...desktop, timeoutMs: 60 * 60_000,
    input: z.object({ hostId: z.string(), command: z.string(), timeoutSec: z.number().int().min(1).max(3600).optional(), execId: z.string().optional() }),
    output: z.object({ execId: z.string(), stdout: z.string(), stderr: z.string(), exitCode: z.number().nullable(), ms: z.number(), interrupted: z.boolean() }),
    handler: (_c, i) => manager.exec(i.hostId, i.command, { ...(i.timeoutSec ? { timeoutSec: i.timeoutSec } : {}), ...(i.execId ? { execId: i.execId } : {}) }),
  }));
  api.defineCapability(def({ name: "ssh.exec.cancel", plugin: "ssh", scope: "execute", ...desktop, input: z.object({ execId: z.string() }), output: z.object({ cancelled: z.boolean() }), handler: (_c, i) => ({ cancelled: manager.cancel(i.execId) }) }));
  api.defineCapability(def({
    name: "ssh.audit.list", plugin: "ssh", scope: "read", ...desktop, input: z.object({ hostId: z.string().optional(), limit: z.number().int().min(1).max(1000).default(200) }),
    output: z.array(z.object({ at: z.string(), hostId: z.string(), action: z.string(), result: z.string(), detail: z.string() })),
    handler: (_c, i) => manager.auditList(i.hostId, i.limit),
  }));
  const Shell = z.object({ id: z.string(), hostId: z.string(), name: z.string(), state: z.enum(["running", "ended"]), createdAt: z.string() });
  api.defineCapability(def({ name: "ssh.shells.open", plugin: "ssh", scope: "execute", ...desktop, input: z.object({ hostId: z.string(), cols: z.number().int().min(1).max(500).default(80), rows: z.number().int().min(1).max(500).default(24) }), output: Shell, handler: (_c, i) => manager.openShell(i.hostId, { cols: i.cols, rows: i.rows }) }));
  api.defineCapability(def({ name: "ssh.shells.list", plugin: "ssh", scope: "read", ...desktop, input: z.object({ hostId: z.string().optional() }), output: z.array(Shell), handler: (_c, i) => manager.listShells(i.hostId) }));
  api.defineCapability(def({ name: "ssh.shells.close", plugin: "ssh", scope: "execute", ...desktop, input: z.object({ id: z.string() }), output: z.object({ closed: z.boolean() }), handler: (_c, i) => ({ closed: manager.closeShell(i.id) }) }));
  // /ws/terminal/ssh-<id>：与 Agent 会话共用同一条终端路由
  api.provide("terminalBridge:ssh", async (shellId: string, ws: import("ws").WebSocket, o: { cols: number; rows: number; observe: boolean }) => {
    const att = manager.attachShell(shellId, {
      onData: (b) => { if (ws.readyState === ws.OPEN) ws.send(b, { binary: true }); },
      onEnd: () => { if (ws.readyState === ws.OPEN) { ws.send(JSON.stringify({ type: "closed", reason: { reason: "exited" } })); ws.close(1000, "shell ended"); } },
    });
    if (!att) return false;
    if (!o.observe) att.resize(o.cols, o.rows); // 观察者不能改变 PTY 尺寸
    ws.on("error", () => undefined);
    ws.on("message", (data, isBinary) => {
      if (o.observe) return;
      if (isBinary) return att.write(Buffer.from(data as Buffer));
      try { const m = JSON.parse(String(data)) as { type?: string; cols?: number; rows?: number }; if (m.type === "resize" && Number.isInteger(m.cols) && Number.isInteger(m.rows)) att.resize(m.cols as number, m.rows as number); } catch { /* 忽略 */ }
    });
    ws.on("close", () => att.detach()); // 关闭视图只 detach
    return true;
  });
  return { manager };
}
