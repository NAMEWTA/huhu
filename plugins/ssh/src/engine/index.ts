import path from "node:path";
import type { Context } from "@huhu/cordis";
import { bindCapability, type HuhuApi } from "@huhu/kernel";
import { sshCapabilityDescriptors } from "./capabilities.js";
import { HostDirectory } from "./directory.js";
import { HostStore } from "./hosts.js";
import { HostConfigurations, type SshCredentialHost } from "./host-configurations.js";
import { SshManager } from "./manager.js";

export { sshCapabilityDescriptors } from "./capabilities.js";
export { HostStore } from "./hosts.js";
export { SshManager } from "./manager.js";

export function apply(ctx: Context, api: HuhuApi, credentialHost?: SshCredentialHost): { manager: SshManager } {
  const root = path.join(api.vault.stateDir, "ssh");
  const hosts = new HostConfigurations(new HostStore(path.join(root, "hosts")), credentialHost);
  const directory = new HostDirectory(hosts, api.vault.files);
  const manager = new SshManager({
    hosts,
    knownHostsFile: path.join(root, "known_hosts"),
    auditDir: path.join(root, "audit"),
    withManagedAuth: (host, connect) => hosts.withAuthentication(host, connect),
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

  api.defineCapability(bindCapability(sshCapabilityDescriptors.hostsDirectory, (_c, i) => directory.list(i)));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostsOrganize, async (_c, i) => {
      const view = await directory.organize(i);
      api.events.publish("entity.changed", { kind: "ssh-host-directory", id: "directory", op: "updated" });
      return view;
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostsList, async () =>
      (await hosts.list()).map((host) => {
        if (!("configId" in host)) return host;
        const { configId: _internal, ...view } = host;
        return view;
      }),
    ),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostsSave, async (_c, i) => {
      api.vault.files.assertWritable();
      const saved = await hosts.saveLegacy(i);
      api.events.publish("entity.changed", { kind: "ssh-host", id: saved.id, op: i.id ? "updated" : "created" }); // 带外（CLI / MCP）改主机，界面也能刷新
      return saved;
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostsDelete, async (_c, i) => {
      api.vault.files.assertWritable();
      await hosts.deleteLegacy(i.id);
      manager.disconnect(i.id);
      api.events.publish("entity.changed", { kind: "ssh-host", id: i.id, op: "deleted" });
      return { ok: true as const };
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostsConfigure, async ({ signal }, input) => {
      const saved = await hosts.configure(input, signal);
      api.events.publish("entity.changed", { kind: "ssh-host", id: saved.hostId, op: input.hostId ? "updated" : "created" });
      return saved;
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostsCopy, async ({ signal }, input) => {
      const saved = await hosts.copy(input, signal);
      api.events.publish("entity.changed", { kind: "ssh-host", id: saved.hostId, op: "created" });
      return saved;
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostsRemove, async ({ signal }, input) => {
      await hosts.remove(input, signal);
      manager.disconnect(input.hostId);
      api.events.publish("entity.changed", { kind: "ssh-host", id: input.hostId, op: "deleted" });
      return { ok: true as const };
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.connect, ({ signal }, i) => manager.connect(i.hostId, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.disconnect, (_c, i) => (manager.disconnect(i.hostId), { ok: true as const })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.hostKeyDecide, (_c, i) => ({ applied: manager.decide(i.attemptId, i.hop, i.accept) })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.execRun, (_c, i) => manager.exec(i.hostId, i.command, { ...(i.timeoutSec ? { timeoutSec: i.timeoutSec } : {}), ...(i.execId ? { execId: i.execId } : {}) })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.execCancel, (_c, i) => ({ cancelled: manager.cancel(i.execId) })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.auditList, (_c, i) => manager.auditList(i.hostId, i.limit)));
  // SFTP（仅桌面；复用已建立的连接）。覆盖需要 overwrite=true（界面先让用户确认）；上传先写临时文件再改名
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpList, (_c, i) => manager.sftpList(i.hostId, i.path)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpRead, (_c, i) => manager.sftpRead(i.hostId, i.path)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpWrite, (_c, i) => manager.sftpWrite(i.hostId, i.path, i.text, i.overwrite)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpUpload, (c, i) => manager.sftpUpload(i.hostId, i.localPath, i.remotePath, i.overwrite, c.signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpDownload, (c, i) => manager.sftpDownload(i.hostId, i.remotePath, i.localPath, i.overwrite, c.signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpCancel, (_c, i) => ({ cancelled: manager.sftpCancel(i.hostId) })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpMkdir, async (_c, i) => (await manager.sftpMkdir(i.hostId, i.path), { ok: true as const })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpRename, async (_c, i) => (await manager.sftpRename(i.hostId, i.from, i.to, i.overwrite), { ok: true as const })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpDelete, async (_c, i) => (await manager.sftpDelete(i.hostId, i.path), { ok: true as const })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.shellsOpen, (_c, i) => manager.openShell(i.hostId, { cols: i.cols, rows: i.rows })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.shellsList, (_c, i) => manager.listShells(i.hostId)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.shellsClose, (_c, i) => ({ closed: manager.closeShell(i.id) })));
  // /ws/terminal/ssh-<id>：与 Agent 会话共用同一条终端路由
  const demoted = new Map<string, import("ws").WebSocket[]>();
  const controllers = new Map<string, import("ws").WebSocket>(); // 同一个 shell 只有一个视图可输入（ACC-AG-09）
  api.provide("terminalBridge:ssh", async (shellId: string, ws: import("ws").WebSocket, req: { cols: number; rows: number; observe: boolean }) => {
    const holder = controllers.get(shellId);
    const o = { ...req, observe: req.observe || (holder !== undefined && holder.readyState === holder.OPEN) };
    const att = manager.attachShell(shellId, {
      onData: (b) => {
        if (ws.readyState === ws.OPEN) ws.send(b, { binary: true });
      },
      onEnd: () => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "closed", reason: { reason: "exited" } }));
          ws.close(1000, "shell ended");
        }
      },
    });
    if (!att) return false;
    if (!o.observe) controllers.set(shellId, ws);
    else if (!req.observe && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "mode", mode: "observe" }));
      demoted.set(shellId, [...(demoted.get(shellId) ?? []), ws]);
    }
    ws.on("close", () => {
      demoted.set(
        shellId,
        (demoted.get(shellId) ?? []).filter((x) => x !== ws),
      );
      if (controllers.get(shellId) !== ws) return;
      controllers.delete(shellId);
      const next = (demoted.get(shellId) ?? []).find((x) => x.readyState === x.OPEN);
      if (next) next.send(JSON.stringify({ type: "mode", mode: "control-free" }));
    });
    if (!o.observe) att.resize(o.cols, o.rows); // 观察者不能改变 PTY 尺寸
    ws.on("error", () => undefined);
    ws.on("message", (data, isBinary) => {
      if (o.observe) return;
      if (isBinary) return att.write(Buffer.from(data as Buffer));
      try {
        const m = JSON.parse(String(data)) as { type?: string; cols?: number; rows?: number };
        if (m.type === "resize" && Number.isInteger(m.cols) && Number.isInteger(m.rows)) att.resize(m.cols as number, m.rows as number);
      } catch {
        /* 忽略 */
      }
    });
    ws.on("close", () => att.detach()); // 关闭视图只 detach
    return true;
  });
  return { manager };
}
