import path from "node:path";
import type { Context } from "@huhu/cordis";
import { errors } from "@huhu/contracts";
import { bindCapability, OperationReceipts, type HuhuApi } from "@huhu/kernel";
import { sshCapabilityDescriptors } from "./capabilities.js";
import { HostDirectory } from "./directory.js";
import { HostStore } from "./hosts.js";
import { HostConfigurations, type SshCredentialHost } from "./host-configurations.js";
import { hostImportConfirm, hostImportPreview } from "./import/capability.js";
import { SshManager } from "./manager.js";
import { WorkspaceTemplates } from "./workspace-templates.js";
import { WorkspaceRuns } from "./workspace-runs.js";
import { FileSessions } from "./file-sessions.js";
import { Transfers } from "./transfers.js";
import { Archives } from "./archives.js";
import { ForwardRules } from "./forward-rules.js";
import { ForwardRuns } from "./forward-runs.js";
import { MonitorPanels } from "./monitor-panels.js";
import { Monitors } from "./monitors.js";
import { readMonitorTool } from "./monitor-tools.js";
import { SshPreferences } from "./preferences.js";
import { readResourceRoute } from "./public-resources.js";
import { PublicSshProbes } from "./public-probes.js";
import { PublicExecJobs, type RetainActivity } from "./public-jobs.js";

export { sshCapabilityDescriptors } from "./capabilities.js";
export { HostStore } from "./hosts.js";
export { SshManager } from "./manager.js";

export function apply(ctx: Context, api: HuhuApi, credentialHost?: SshCredentialHost, execJobs?: { runtimeDir: string; vaultInstance: string; retainActivity?: RetainActivity }): { manager: SshManager } {
  const root = path.join(api.vault.stateDir, "ssh");
  const relativeState = path.relative(api.vault.files.root, root);
  const stateInVault = !path.isAbsolute(relativeState) && relativeState !== ".." && !relativeState.startsWith(`..${path.sep}`);
  const hosts = new HostConfigurations(new HostStore(path.join(root, "hosts")), credentialHost);
  const directory = new HostDirectory(hosts, api.vault.files);
  const templates = new WorkspaceTemplates(api.vault.files, hosts);
  const forwardRules = new ForwardRules(api.vault.files, hosts);
  const monitorPanels = new MonitorPanels(api.vault.files, hosts);
  const preferences = new SshPreferences(api.vault.files);
  const assertHostUnused = (id: string) => {
    templates.assertUnused(id);
    forwardRules.assertUnused(id);
  };
  const manager = new SshManager({
    hosts,
    knownHostsFile: path.join(root, "known_hosts"),
    ...(stateInVault && { knownHostsFiles: api.vault.files }),
    auditDir: path.join(root, "audit"),
    withManagedAuth: (host, connect) => hosts.withAuthentication(host, connect),
    publish: (t, p) => api.events.publish(t, p),
    now: () => new Date(),
    connectionPreferences: () => preferences.runtime().connection,
  });
  const runs = new WorkspaceRuns(api.vault.files, hosts, templates, manager, (id) => api.events.publish("entity.changed", { kind: "ssh-workspace-run", id, op: "updated" }));
  const publicProbes = new PublicSshProbes(api.vault.files, manager);
  const publicJobs = execJobs ? new PublicExecJobs(api.vault.files, publicProbes, new OperationReceipts(path.join(execJobs.runtimeDir, "ssh-exec-intents.ndjson")), execJobs.vaultInstance, execJobs.retainActivity) : undefined;
  const files = new FileSessions(manager);
  const archives = new Archives(files, manager);
  const transfers = new Transfers(
    files,
    manager,
    (id) => api.events.publish("entity.changed", { kind: "ssh-transfer", id, op: "updated" }),
    () => preferences.runtime().transfer.parallel,
  );
  const forwarding = new ForwardRuns(forwardRules, manager, (id) => api.events.publish("entity.changed", { kind: "ssh-forward-run", id, op: "updated" }));
  const monitors = new Monitors(monitorPanels, manager);
  ctx.effect(() => () => {
    publicJobs?.dispose();
    publicProbes.dispose();
    monitors.dispose();
    forwarding.dispose();
    transfers.dispose();
    files.dispose();
    runs.dispose();
    manager.disposeAll();
  });

  api.defineCapability(bindCapability(sshCapabilityDescriptors.settingsGet, () => preferences.get()));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.settingsUpdate, async ({ caller, signal }, input) => {
      const saved = await preferences.update(input, signal);
      // Applying an external default must not dispatch work already queued by the workbench.
      if (input.change.section === "transfer" && (caller === "desktop" || caller.startsWith("plugin:"))) transfers.preferencesChanged();
      return saved;
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.hostsDirectory, (_c, i) => directory.list(i)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.resourcesHostGet, (_c, i) => readResourceRoute(api.vault.files, i.hostId).view));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.resourcesConnectionStart, (context, input) => publicProbes.start(context, input)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.resourcesConnectionGet, (context, input) => publicProbes.read(context, input)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.resourcesConnectionList, (context) => publicProbes.list(context)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.resourcesTrustDecide, (context, input) => publicProbes.decide(context, input)));
  if (publicJobs) {
    api.defineCapability(bindCapability(sshCapabilityDescriptors.jobsPrepare, (context, input) => publicJobs.prepare(context, input)));
    api.defineCapability(bindCapability(sshCapabilityDescriptors.jobsStart, (context, input) => publicJobs.start(context, input)));
    api.defineCapability(bindCapability(sshCapabilityDescriptors.jobsGet, (context, input) => publicJobs.get(context, input.jobId)));
    api.defineCapability(bindCapability(sshCapabilityDescriptors.jobsOutputRead, (context, input) => publicJobs.read(context, input)));
    api.defineCapability(bindCapability(sshCapabilityDescriptors.jobsCancel, (context, input) => publicJobs.cancel(context, input.jobId)));
  }
  api.defineCapability(bindCapability(sshCapabilityDescriptors.monitorSessionOpen, (_c, i) => monitors.open(i)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.monitorToolsRead, ({ signal }, i) => readMonitorTool(manager, i, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.monitorSessionGet, (_c, i) => monitors.get(i.id)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.monitorSessionChange, (_c, i) => monitors.session(i)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.monitorPanelsList, () => monitorPanels.list()));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.monitorPanelsSave, async ({ signal }, i) => {
      const saved = await monitors.save(i, signal);
      api.events.publish("entity.changed", { kind: "ssh-monitor-panel", id: saved.id, op: i.previous ? "updated" : "created" });
      return saved;
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.monitorPanelsDelete, async ({ signal }, i) => {
      const result = await monitors.delete(i, signal);
      api.events.publish("entity.changed", { kind: "ssh-monitor-panel", id: i.id, op: "deleted" });
      return result;
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.monitorPanelsRun, (_c, i) => monitors.dashboard(i.id)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.monitorPanelsChange, ({ signal }, i) => monitors.change(i, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.forwardRulesList, () => forwardRules.list()));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.forwardRulesSave, async ({ signal }, input) => {
      const result = await forwarding.save(input, signal);
      api.events.publish("entity.changed", { kind: "ssh-forward", id: result.id, op: input.previous ? "updated" : "created" });
      return result;
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.forwardRulesDelete, async ({ signal }, input) => {
      const result = await forwarding.delete(input, signal);
      api.events.publish("entity.changed", { kind: "ssh-forward", id: input.id, op: "deleted" });
      return result;
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.forwardRunsList, () => forwarding.list()));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.forwardRunsStart, ({ signal }, input) => forwarding.start(input, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.forwardRunsResume, ({ signal }, input) => forwarding.start(input, signal, true)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.forwardRunsStop, ({ signal }, input) => forwarding.stop(input, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceTemplatesList, () => templates.list()));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceTemplatesSave, ({ signal }, i) => templates.save(i, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceTemplatesDelete, ({ signal }, i) => templates.delete(i, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceRunsList, () => runs.list()));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceRunsStart, ({ signal }, i) => runs.start(i, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceRunsReconnect, ({ signal }, i) => runs.reconnect(i.id, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceRunsClose, ({ signal }, i) => runs.close(i.id, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceRunsSaveTemplate, ({ signal }, i) => runs.saveTemplate(i.id, i.name, signal)));
  api.defineCapability(hostImportPreview(hosts));
  api.defineCapability(hostImportConfirm(hosts, directory, (kind, id) => api.events.publish("entity.changed", { kind, id, op: "updated" })));
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
      await hosts.remove(input, signal, () => assertHostUnused(input.hostId));
      manager.forgetConnection(input.hostId);
      api.events.publish("entity.changed", { kind: "ssh-host", id: input.hostId, op: "deleted" });
      return { ok: true as const };
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.connect, ({ caller, signal }, i) => {
      if (!i.background) return manager.connect(i.hostId, signal);
      if (caller !== "desktop") throw errors.permissionDenied("ssh.connect");
      signal.throwIfAborted();
      return manager.start(i.hostId);
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.connectionStatuses, () => manager.connectionStatuses()));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.disconnect, (_c, i) => (manager.disconnect(i.hostId), { ok: true as const })));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostKeyDecide, (_c, i) => {
      if (i.accept && i.remember !== false) api.vault.files.assertWritable();
      return { applied: manager.decide(i.attemptId, i.hop, i.accept, i.promptId, i.remember) };
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.knownHostsList, () => manager.knownHosts()));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.knownHostsForget, async (_c, key) => {
      api.vault.files.assertWritable();
      await manager.forgetHostKey(key);
      api.events.publish("entity.changed", { kind: "ssh-known-hosts", id: key.fingerprint, op: "deleted" });
      return { ok: true as const };
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.execRun, (_c, i) => manager.exec(i.hostId, i.command, { ...(i.timeoutSec ? { timeoutSec: i.timeoutSec } : {}), ...(i.execId ? { execId: i.execId } : {}) })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.execCancel, (_c, i) => ({ cancelled: manager.cancel(i.execId) })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.auditList, (_c, i) => manager.auditList(i.hostId, i.limit)));
  // SFTP（仅桌面；复用已建立的连接）。覆盖需要 overwrite=true（界面先让用户确认）；上传先写临时文件再改名
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsOpen, (_c, i) => files.open(i)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.archiveSupport, ({ signal }, i) => archives.support(i.fileSessionId, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.archiveRun, ({ signal }, i) => archives.run(i, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferStart, (_c, i) => transfers.start(i)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferStartBatch, ({ signal }, i) => transfers.startBatch(i, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferList, () => transfers.list()));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferDecide, (_c, i) => transfers.decide(i.transferId, i.choice)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferCancel, (_c, i) => transfers.cancel(i.transferId)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferPause, (_c, i) => transfers.pause(i.transferId)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferResume, (_c, i) => transfers.resume(i.transferId)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferRetry, (_c, i) => transfers.retry(i.transferId)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferRecheck, ({ signal }, i) => transfers.recheck(i.transferId, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferOrigin, (_c, i) => transfers.openOrigin(i.transferId)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferClear, () => transfers.clear()));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsList, () => files.list()));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsClose, (_c, i) => (files.close(i.fileSessionId, i.attached), { ok: true as const })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsLocalList, (_c, i) => files.localList(i.fileSessionId, i.parts, i.root)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsSearch, ({ signal }, i) => files.search(i.fileSessionId, i.path, i.query, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsCancelSearch, (_c, i) => ({ cancelled: files.cancelSearch(i.fileSessionId) })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsDocumentOpen, ({ signal }, i) => files.readDocument(i.fileSessionId, i.path, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsDocumentSave, ({ signal }, i) => files.writeDocument(i.fileSessionId, i.path, i.text, i.expectedVersion, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsProperties, ({ signal }, i) => files.properties(i.fileSessionId, i.path, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsDirectory, (_, i) => files.directoryState(i.fileSessionId)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsPrepareDirectory, ({ signal }, i) => files.prepareDirectory(i.fileSessionId, i.path, i.revision, signal)));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsCommitDirectory, ({ signal }, i) => {
      signal.throwIfAborted();
      return { applied: files.commitDirectory(i.fileSessionId, i.follow) };
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsChangeProperties, ({ signal }, i) => files.changeProperties(i.fileSessionId, i.path, i.expectedRevision, i.change, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsCreateEntry, ({ signal }, i) => files.createEntry(i.fileSessionId, i.path, i.entry, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsMoveEntry, ({ signal }, i) => files.moveEntry(i.fileSessionId, i.path, i.expectedRevision, i.destination, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpList, ({ signal }, i) => manager.sftpList(files.source(i), i.path, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpRead, (_c, i) => manager.sftpRead(files.source(i), i.path)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpWrite, (_c, i) => manager.sftpWrite(files.source(i), i.path, i.text, i.overwrite)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpUpload, (c, i) => manager.sftpUpload(files.source(i), i.localPath, i.remotePath, i.overwrite, c.signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpDownload, (c, i) => manager.sftpDownload(files.source(i), i.remotePath, i.localPath, i.overwrite, c.signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpCancel, (_c, i) => ({ cancelled: manager.sftpCancel(files.source(i)) })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpMkdir, async (_c, i) => (await manager.sftpMkdir(files.source(i), i.path), { ok: true as const })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpRename, async (_c, i) => (await manager.sftpRename(files.source(i), i.from, i.to, i.overwrite), { ok: true as const })));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.sftpDelete, async (_c, i) => (await manager.sftpDelete(files.source(i), i.path), { ok: true as const })));
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
