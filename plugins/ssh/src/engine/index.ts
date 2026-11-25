import path from "node:path";
import type { Context } from "@huhu/cordis";
import { errors, HuhuError, isWorkbenchCaller, periodicPlanSourceService, type PeriodicPlanSource } from "@huhu/contracts";
import { bindCapability, OperationReceipts, type CapabilityContext, type HuhuApi } from "@huhu/kernel";
import { ForwardRuleReceipt, MonitorPanelReceipt, sshCapabilityDescriptors, WorkspaceTemplateReceipt } from "./capabilities.js";
import type { WorkspaceTemplate } from "../shared/workspace.js";
import { SaveForward } from "../shared/forwarding.js";
import { PublicHostMutation } from "./auth-profile.js";
import { registerSshAuthentication } from "./authentication-capability.js";
import { registerSshConfigSync } from "./config-sync.js";
import { HostDirectory } from "./directory.js";
import { PublicDirectoryMutation } from "./directory-schema.js";
import { registerSshDraft } from "./draft-connection.js";
import { HostStore } from "./hosts.js";
import { registerHostAuthorities } from "./host-authorities.js";
import { HostConfigurations, hostPackageFile, type SshCredentialHost } from "./host-configurations.js";
import { HostIntents, sealCredentialPatches } from "./host-intents.js";
import { hostImportCapabilities } from "./import/capability.js";
import { registerSshKeys } from "./key-library-capabilities.js";
import { keyLibraryPackageFile } from "./key-library.js";
import { registerSshLocalShells, type LaunchLocalPty } from "./local-shell.js";
import { OutboundProxies, effectiveOutboundProxy, outboundProxyPackageFiles } from "./outbound-proxies.js";
import { registerOutboundProxies } from "./outbound-proxy-capabilities.js";
import { dialOutboundProxy } from "./outbound-proxy-dial.js";
import { SshManager } from "./manager.js";
import { WorkspaceTemplates } from "./workspace-templates.js";
import { WorkspaceRuns } from "./workspace-runs.js";
import { FileSessions } from "./file-sessions.js";
import { Transfers } from "./transfers.js";
import { Archives } from "./archives.js";
import { PublicArchives } from "./public-archives.js";
import { ForwardRules, type ForwardRuleScope } from "./forward-rules.js";
import { ForwardRuns } from "./forward-runs.js";
import { MonitorPanels, type MonitorPanelScope } from "./monitor-panels.js";
import { MonitorPlans, monitorForPlan } from "./monitor-plans.js";
import { Monitors } from "./monitors.js";
import { readMonitorTool } from "./monitor-tools.js";
import { SshPreferences } from "./preferences.js";
import { authorizedResourceRoute, boundSshRoutes, externalSshOwner, PublicHostView, readBoundRoute, readPortableHosts, selectedSshHosts, visibleSshRoutes } from "./public-resources.js";
import { ConnectOwned, DecidePublicProbe, PublicSshProbes } from "./public-probes.js";
import { PublicExecJobs, type RetainActivity } from "./public-jobs.js";
import { assertEntryRevision, PublicFileSessions } from "./public-files.js";
import { PublicForwarding } from "./public-forwarding.js";
import { PublicMonitors } from "./public-monitors.js";
import { PublicShells } from "./public-shells.js";
import { PublicTransfers } from "./public-transfers.js";
import { PublicWorkspaces } from "./public-workspaces.js";
import { registerSshProxyShare } from "./proxy-share.js";
import { registerShortcuts } from "./shortcuts.js";
import { registerSshTerminalBridge } from "./terminal-bridge.js";
import { registerSshRecordings } from "./terminal-recordings.js";
import { registerSshWorkspacePanes } from "./workspace-pane-capability.js";
import * as sftp from "./sftp.js";

export { sshCapabilityDescriptors } from "./capabilities.js";
export { HostStore } from "./hosts.js";
export { SshManager } from "./manager.js";
export { createHerdrLocalPty } from "./local-pty-herdr.js";

export function hasSavedSshHosts(files: HuhuApi["vault"]["files"], ids: readonly string[]): boolean {
  return readPortableHosts(files, new Set(ids)).length === ids.length;
}

export function sshPortablePackageFiles(files: HuhuApi["vault"]["files"]) {
  return [hostPackageFile(files), keyLibraryPackageFile(files), ...outboundProxyPackageFiles(files)];
}

export function apply(ctx: Context, api: HuhuApi, credentialHost?: SshCredentialHost, execJobs?: { runtimeDir: string; vaultInstance: string; retainActivity?: RetainActivity }, launchLocalPty?: LaunchLocalPty): { manager: SshManager } {
  const root = path.join(api.vault.stateDir, "ssh");
  const relativeState = path.relative(api.vault.files.root, root);
  const stateInVault = !path.isAbsolute(relativeState) && relativeState !== ".." && !relativeState.startsWith(`..${path.sep}`);
  const hosts = new HostConfigurations(new HostStore(path.join(root, "hosts")), credentialHost);
  const directory = new HostDirectory(hosts, api.vault.files);
  const visibleHosts = (context: CapabilityContext) => readPortableHosts(api.vault.files, selectedSshHosts(context)).sort((left, right) => left.name.localeCompare(right.name));
  const templates = new WorkspaceTemplates(api.vault.files, hosts);
  const forwardRules = new ForwardRules(api.vault.files, hosts);
  const monitorPanels = new MonitorPanels(api.vault.files, hosts);
  const preferences = new SshPreferences(api.vault.files);
  const outboundProxies = new OutboundProxies(api.vault.files, credentialHost);
  const assertHostUnused = (id: string) => {
    templates.assertUnused(id);
    forwardRules.assertUnused(id);
  };
  const manager = new SshManager({
    hosts,
    knownHostsFile: path.join(root, "known_hosts"),
    ...(stateInVault && { knownHostsFiles: api.vault.files }),
    auditDir: path.join(root, "audit"),
    ...(execJobs && { externalAudit: { directory: path.join(execJobs.runtimeDir, "ssh-audit"), vaultInstance: execJobs.vaultInstance } }),
    withManagedAuth: (host, connect) => hosts.withAuthentication(host, connect),
    publish: (t, p) => api.events.publish(t, p),
    now: () => new Date(),
    connectionPreferences: () => preferences.runtime().connection,
    outbound: {
      resolve: (host) => effectiveOutboundProxy(api.vault.files, host),
      dial: (proxy, target, signal, assertCurrent) => outboundProxies.dial(proxy, target, signal, dialOutboundProxy, assertCurrent),
    },
  });
  const runs = new WorkspaceRuns(api.vault.files, hosts, templates, manager, (id) => api.events.publish("entity.changed", { kind: "ssh-workspace-run", id, op: "updated" }));
  const operations = execJobs && { ...execJobs, receipts: new OperationReceipts(path.join(execJobs.runtimeDir, "ssh-exec-intents.ndjson")) };
  const hostIntents = execJobs && new HostIntents(new OperationReceipts(path.join(execJobs.runtimeDir, "ssh-host-intents.ndjson")), execJobs.vaultInstance);
  const boundHost = (context: CapabilityContext, binding: { hostId: string; routeRevision: string; expectedRevision: string }) => {
    const chain = readBoundRoute(api.vault.files, context, binding);
    const target = chain.at(-1)!;
    if (target.revision !== binding.expectedRevision) throw errors.versionConflict(target.revision);
    return { target, ids: chain.map(({ id }) => id) };
  };
  const configurationRoutes = (context: CapabilityContext, bindings: Parameters<typeof boundSshRoutes>[2]) => {
    const read = () => boundSshRoutes(api.vault.files, context, bindings);
    return {
      authorize: () => [...read().values()].flatMap(({ route }) => route.map(({ hostId }) => hostId)),
      require: (hostIds: readonly string[]) => {
        const routes = read();
        const required = new Set(hostIds);
        if (routes.size !== required.size || [...required].some((id) => !routes.has(id))) throw errors.notFound("当前授权内的 SSH 配置绑定");
        return routes;
      },
    };
  };
  const publicProbes = new PublicSshProbes(api.vault.files, manager, operations, (id) => api.events.publish("entity.changed", { kind: "ssh-external-connection", id, op: "updated" }));
  const publicJobs = operations
    ? new PublicExecJobs(api.vault.files, publicProbes, operations.receipts, operations.vaultInstance, manager, operations.retainActivity, (id) => api.events.publish("entity.changed", { kind: "ssh-exec-job", id, op: "updated" }))
    : undefined;
  const publicShells = new PublicShells(publicProbes, hostIntents, credentialHost, (id) => api.events.publish("entity.changed", { kind: "ssh-external-shell", id, op: "updated" }));
  const publicWorkspaces = new PublicWorkspaces(api.vault.files, publicProbes, publicShells, templates, hostIntents, (id) => api.events.publish("entity.changed", { kind: "ssh-workspace-run", id, op: "updated" }));
  const publicFiles = new PublicFileSessions(manager, publicProbes, publicShells, hostIntents, credentialHost, (id) => {
    publicTransfers.releaseFileSession(id);
    api.events.publish("entity.changed", { kind: "ssh-external-file-session", id, op: "updated" });
  });
  const publicTransfers = new PublicTransfers(publicFiles, manager, hostIntents, (id) => api.events.publish("entity.changed", { kind: "ssh-transfer", id, op: "updated" }));
  const files = new FileSessions(manager);
  const archives = new Archives(files, manager);
  const publicArchives = new PublicArchives(publicFiles);
  const transfers = new Transfers(
    files,
    manager,
    (id) => api.events.publish("entity.changed", { kind: "ssh-transfer", id, op: "updated" }),
    () => preferences.runtime().transfer.parallel,
  );
  const forwarding = new ForwardRuns(forwardRules, manager, (id) => api.events.publish("entity.changed", { kind: "ssh-forward-run", id, op: "updated" }));
  const publicForwarding = new PublicForwarding(api.vault.files, forwardRules, publicProbes, hostIntents, (id) => api.events.publish("entity.changed", { kind: "ssh-forward-run", id, op: "updated" }));
  const monitorPlans = new MonitorPlans(api);
  const monitors = new Monitors(monitorPanels, manager, monitorPlans);
  const samplerLifetime = new AbortController();
  api.provide(periodicPlanSourceService("ssh"), {
    signal: samplerLifetime.signal,
    availability: ({ source }) => monitors.availability(source.object.id),
    run: ({ source }, context) => monitors.sampleDashboard(source.object.id, context),
    suspend: () => monitors.suspendPlans(),
  } satisfies PeriodicPlanSource);
  const publicMonitors = new PublicMonitors(monitorPanels, manager, publicProbes, hostIntents, (id) => api.events.publish("entity.changed", { kind: "ssh-external-monitor", id, op: "updated" }));
  registerSshKeys(api, hosts);
  registerOutboundProxies(api, outboundProxies, hosts);
  registerHostAuthorities(api, hosts, manager);
  registerShortcuts(api);
  registerSshDraft(api, hosts, manager);
  registerSshAuthentication(api, manager);
  registerSshConfigSync(api, hosts);
  const proxyShare = registerSshProxyShare(api, manager);
  registerSshWorkspacePanes(api, runs, publicWorkspaces);
  const recordings = execJobs && registerSshRecordings(api, manager, path.join(execJobs.runtimeDir, "ssh-recordings"));
  const localShells = launchLocalPty && registerSshLocalShells(api, launchLocalPty);
  api.events.subscribe((event) => {
    if (event.type !== "entity.changed" || !("kind" in event.payload)) return;
    if (event.payload.kind === "tool-access") {
      publicJobs?.revokeUnauthorized();
      publicForwarding.revokeUnauthorized();
      publicWorkspaces.revokeUnauthorized();
      publicProbes.revokeUnauthorized();
    }
    if (event.payload.kind === "ssh-host" || event.payload.kind === "ssh-outbound-proxy") publicProbes.revalidateRoutes();
    if (event.payload.kind === "ssh-forward") publicForwarding.revalidateRules();
    if (event.payload.kind === "ssh-monitor-panel") publicMonitors.revalidatePanels();
    if (event.payload.kind === "periodic-plan" && event.payload.id) {
      const id = monitorForPlan(event.payload.id);
      if (id) monitors.applyPlan(id);
    }
  });
  ctx.effect(() => () => {
    samplerLifetime.abort();
    publicJobs?.dispose();
    publicProbes.dispose();
    publicWorkspaces.dispose();
    publicShells.dispose();
    publicTransfers.dispose();
    publicFiles.dispose();
    monitors.dispose();
    publicMonitors.dispose();
    publicForwarding.dispose();
    forwarding.dispose();
    transfers.dispose();
    files.dispose();
    runs.dispose();
    recordings?.dispose();
    proxyShare.dispose();
    manager.disposeAll();
  });
  if (localShells) ctx.effect(() => () => localShells.dispose());

  api.defineCapability(bindCapability(sshCapabilityDescriptors.settingsGet, () => preferences.get()));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.settingsUpdate, async ({ caller, signal }, input) => {
      const saved = await preferences.update(input, signal);
      // Applying an external default must not dispatch work already queued by the workbench.
      if (input.change.section === "transfer" && (caller === "desktop" || caller.startsWith("plugin:"))) transfers.preferencesChanged();
      return saved;
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.hostsDirectory, (context, i) => directory.list(i, isWorkbenchCaller(context.caller) ? undefined : visibleHosts(context))));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.resourcesHostGet, (context, i) => authorizedResourceRoute(api.vault.files, context, i.hostId).view));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.resourcesConnectionStart, (context, input) => publicProbes.start(context, input)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.resourcesConnectionGet, (context, input) => publicProbes.read(context, input)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.resourcesConnectionList, (context) => publicProbes.list(context)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.resourcesTrustDecide, (context, input) => publicProbes.decide(context, input)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.keyboardRespond, (context, input) => publicProbes.respondKeyboard(context, input)));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.jobsList, (context, { hostId }) => {
      if (!publicJobs) return [];
      return isWorkbenchCaller(context.caller) ? publicJobs.workbenchList(hostId) : publicJobs.list(context, hostId);
    }),
  );
  if (publicJobs) {
    api.defineCapability(bindCapability(sshCapabilityDescriptors.jobsPrepare, (context, input) => publicJobs.prepare(context, input)));
    api.defineCapability(bindCapability(sshCapabilityDescriptors.jobsStart, (context, input) => publicJobs.start(context, input)));
    api.defineCapability(bindCapability(sshCapabilityDescriptors.jobsGet, (context, input) => publicJobs.get(context, input.jobId)));
    api.defineCapability(bindCapability(sshCapabilityDescriptors.jobsOutputRead, (context, input) => publicJobs.read(context, input)));
    api.defineCapability(bindCapability(sshCapabilityDescriptors.jobsCancel, (context, input) => (isWorkbenchCaller(context.caller) ? publicJobs.cancelWorkbench(input.jobId) : publicJobs.cancel(context, input.jobId))));
  }
  const desktopMonitor = ({ caller }: CapabilityContext) => {
    if (isWorkbenchCaller(caller) && caller !== "desktop") throw errors.permissionDenied("SSH 监控工作台");
    return caller === "desktop";
  };
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.monitorSessionOpen, (context, input) => {
      if ("attemptId" in input) return publicMonitors.open(context, input);
      if (!desktopMonitor(context)) throw errors.invalidInput("外部 SSH 监控需要本主体的连接和意图");
      return monitors.open(input);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.monitorToolsRead, (context, input) => {
      if ("attemptId" in input) return publicMonitors.tool(context, input);
      if (!desktopMonitor(context)) throw errors.invalidInput("外部 SSH 查询需要本主体的连接和意图");
      return readMonitorTool(manager, input, context.signal);
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.monitorSessionGet, (context, { id }) => (desktopMonitor(context) ? monitors.get(id) : publicMonitors.get(context, id))));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.monitorSessionList, (context) => publicMonitors.list(desktopMonitor(context) ? undefined : context)));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.monitorSessionChange, (context, input) => {
      const { id, action, intentKey } = input;
      const request = input.action === "interval" ? { id, action: input.action, interval: input.interval } : { id, action: input.action };
      if (desktopMonitor(context)) {
        if (action === "close" && publicMonitors.closeWorkbench(id)) return null;
        return monitors.session(request);
      }
      return publicMonitors.change(context, request, intentKey);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.monitorPanelsList, (context) => {
      if (isWorkbenchCaller(context.caller)) return monitorPanels.list().map((panel) => monitorPlans.project(panel));
      const routes = visibleSshRoutes(api.vault.files, context);
      return monitorPanels.list().filter(({ hostIds }) => hostIds.every((id) => routes.has(id)));
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.monitorPanelsSave, (context, { bindings, intentKey, ...input }) => {
      const save = async (scope?: MonitorPanelScope) => {
        const saved = await monitors.save(input, context.signal, scope);
        api.events.publish("entity.changed", { kind: "ssh-monitor-panel", id: saved.id, op: input.previous ? "updated" : "created" });
        return saved;
      };
      if (isWorkbenchCaller(context.caller)) return save();
      if (!hostIntents || !bindings || !intentKey) throw errors.invalidInput("外部保存面板需要主机路由版本和意图键");
      const routes = configurationRoutes(context, bindings);
      routes.authorize();
      return hostIntents.run(context, sshCapabilityDescriptors.monitorPanelsSave.name, {
        hosts: bindings.map(({ hostId }) => hostId),
        intentKey,
        input: { ...input, bindings },
        output: MonitorPanelReceipt,
        authorize: routes.authorize,
        run: async () => {
          const { id, revision } = await save((previous) => {
            if (input.previous && !previous) throw errors.notFound("监控面板");
            if (previous) publicMonitors.assertPanelInactive(previous.id);
            routes.require([...input.hostIds, ...(previous?.hostIds ?? [])]);
          });
          return { id, revision };
        },
      });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.monitorPanelsDelete, (context, { bindings, intentKey, ...input }) => {
      const remove = async (scope?: MonitorPanelScope) => {
        const result = await monitors.delete(input, context.signal, scope);
        api.events.publish("entity.changed", { kind: "ssh-monitor-panel", id: input.id, op: "deleted" });
        return result;
      };
      if (isWorkbenchCaller(context.caller)) return remove();
      if (!hostIntents || !bindings || !intentKey) throw errors.invalidInput("外部删除面板需要主机路由版本和意图键");
      const routes = configurationRoutes(context, bindings);
      routes.authorize();
      return hostIntents.run(context, sshCapabilityDescriptors.monitorPanelsDelete.name, {
        hosts: bindings.map(({ hostId }) => hostId),
        intentKey,
        input: { ...input, bindings },
        output: sshCapabilityDescriptors.monitorPanelsDelete.output,
        authorize: routes.authorize,
        run: () =>
          remove((previous) => {
            if (!previous) throw errors.notFound("监控面板");
            publicMonitors.assertPanelInactive(previous.id);
            routes.require(previous.hostIds);
          }),
      });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.monitorPanelsRun, (context, { id, expectedRevision }) => {
      if (isWorkbenchCaller(context.caller)) return monitors.dashboard(id);
      if (!expectedRevision) throw errors.invalidInput("读取外部监控样本需要面板修订");
      const routes = visibleSshRoutes(api.vault.files, context);
      const panel = monitorPanels.get(id);
      if (!panel || panel.hostIds.some((hostId) => !routes.has(hostId))) throw errors.notFound("监控面板");
      if (panel.revision !== expectedRevision) throw errors.versionConflict(panel.revision);
      return publicMonitors.readPanel(context, { id, expectedRevision });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.monitorPanelsChange, (context, input) => {
      const { id, expectedRevision, intentKey, connections, runId, action } = input;
      const request = input.action === "retry" ? { id, expectedRevision, action: input.action, hostId: input.hostId } : { id, expectedRevision, action: input.action };
      if (desktopMonitor(context)) {
        if (!runId) return monitors.change({ ...request, expectedPlanRevision: input.expectedPlanRevision }, context.signal);
        if (action !== "stop") throw errors.invalidInput("工作台只能停止指定的外部监控运行");
        publicMonitors.closeWorkbenchPanel(runId);
        return null;
      }
      if (runId) throw errors.invalidInput("外部 SSH 监控操作需使用本主体的面板");
      return publicMonitors.panelChange(context, request, intentKey, connections);
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.monitorPanelsExternalList, (context) => publicMonitors.panelsList(desktopMonitor(context) ? undefined : context)));
  const visibleForwardRules = (context: CapabilityContext) => {
    const routes = visibleSshRoutes(api.vault.files, context);
    return forwardRules.list().flatMap((rule) => {
      const route = routes.get(rule.hostId);
      return route?.targetIdentity === rule.boundTarget ? [{ rule, route }] : [];
    });
  };
  api.defineCapability(bindCapability(sshCapabilityDescriptors.forwardRulesList, (context) => (isWorkbenchCaller(context.caller) ? forwardRules.list() : visibleForwardRules(context).map(({ rule }) => rule))));
  const forwardRuleScope = (context: CapabilityContext, bindings: Parameters<typeof boundSshRoutes>[2]) => {
    const routes = configurationRoutes(context, bindings);
    const scope: ForwardRuleScope = ({ id, hostId, boundTarget }) => {
      if (routes.require([hostId]).get(hostId)?.targetIdentity !== boundTarget) throw errors.notFound("当前授权内的 SSH 转发规则");
      publicForwarding.assertInactive(id);
    };
    return { scope, authorize: routes.authorize };
  };
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.forwardRulesSave, (context, { bindings, intentKey, ...request }) => {
      const parsed = SaveForward.safeParse(request);
      if (!parsed.success) throw errors.invalidInput("SSH 转发规则配置无效");
      const input = parsed.data;
      const save = async (scope?: ForwardRuleScope) => {
        const result = await forwarding.save(input, context.signal, scope);
        api.events.publish("entity.changed", { kind: "ssh-forward", id: result.id, op: input.previous ? "updated" : "created" });
        return result;
      };
      if (isWorkbenchCaller(context.caller)) return save();
      if (!hostIntents || !bindings || !intentKey || !input.previous) throw errors.invalidInput("外部编辑需要原转发规则、主机路由版本和意图键");
      const { scope, authorize } = forwardRuleScope(context, bindings);
      authorize();
      return hostIntents.run(context, sshCapabilityDescriptors.forwardRulesSave.name, {
        hosts: bindings.map(({ hostId }) => hostId),
        intentKey,
        input: { ...input, bindings },
        output: ForwardRuleReceipt,
        authorize,
        run: async () => {
          const { id, revision } = await save(scope);
          return { id, revision };
        },
      });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.forwardRulesDelete, (context, { bindings, intentKey, ...input }) => {
      const remove = async (scope?: ForwardRuleScope) => {
        const result = await forwarding.delete(input, context.signal, scope);
        api.events.publish("entity.changed", { kind: "ssh-forward", id: input.id, op: "deleted" });
        return result;
      };
      if (isWorkbenchCaller(context.caller)) return remove();
      if (!hostIntents || !bindings || !intentKey) throw errors.invalidInput("外部删除规则需要主机路由版本和意图键");
      const { scope, authorize } = forwardRuleScope(context, bindings);
      authorize();
      return hostIntents.run(context, sshCapabilityDescriptors.forwardRulesDelete.name, {
        hosts: bindings.map(({ hostId }) => hostId),
        intentKey,
        input: { ...input, bindings },
        output: sshCapabilityDescriptors.forwardRulesDelete.output,
        authorize,
        run: () => remove(scope),
      });
    }),
  );
  const desktopForwarding = ({ caller }: CapabilityContext) => {
    if (isWorkbenchCaller(caller) && caller !== "desktop") throw errors.permissionDenied("SSH 转发工作台");
    return caller === "desktop";
  };
  api.defineCapability(bindCapability(sshCapabilityDescriptors.forwardRunsList, (context) => (desktopForwarding(context) ? [...forwarding.list(), ...publicForwarding.workbenchList()] : publicForwarding.list(context))));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.forwardRunsStart, (context, input) => {
      if (desktopForwarding(context)) return forwarding.start(input, context.signal);
      if (!("attemptId" in input)) throw errors.invalidInput("外部 SSH 转发需要本主体连接和意图");
      return publicForwarding.start(context, input);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.forwardRunsResume, (context, input) => {
      if (desktopForwarding(context)) return forwarding.start(input, context.signal, true);
      if (!("attemptId" in input)) throw errors.invalidInput("恢复外部 SSH 转发需要原运行、新连接和意图");
      return publicForwarding.start(context, input, true);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.forwardRunsStop, (context, input) => {
      if (desktopForwarding(context)) return "runId" in input ? publicForwarding.stopWorkbench(input.runId) : forwarding.stop(input, context.signal);
      if (!("intentKey" in input)) throw errors.invalidInput("停止外部 SSH 转发需要原运行、规则修订和意图");
      return publicForwarding.stop(context, input);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.workspaceTemplatesList, (context) => {
      if (isWorkbenchCaller(context.caller)) return templates.list();
      const routes = visibleSshRoutes(api.vault.files, context);
      return templates
        .list()
        .filter(({ panes }) => panes.every(({ hostId, target }) => routes.get(hostId)?.targetIdentity === target))
        .map((template) => ({ ...template, panes: template.panes.map(({ hostId, target }) => ({ hostId, target })) }));
    }),
  );
  const templateWriteScope = (context: CapabilityContext, bindings: Parameters<typeof boundSshRoutes>[2], hostIds: readonly string[], editing: boolean) => {
    const configuration = configurationRoutes(context, bindings);
    return {
      authorize: configuration.authorize,
      scope: (previous: WorkspaceTemplate | undefined) => {
        if (editing && !previous) throw errors.notFound("SSH 工作区模板");
        const original = previous?.panes ?? [];
        const routes = configuration.require([...hostIds, ...original.map(({ hostId }) => hostId)]);
        if (original.some(({ hostId, target }) => routes.get(hostId)?.targetIdentity !== target)) throw errors.notFound("当前授权内的 SSH 工作区模板绑定");
        return new Map([...routes].map(([id, route]) => [id, route.targetIdentity]));
      },
    };
  };
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.workspaceTemplatesSave, (context, { bindings, intentKey, ...input }) => {
      if (isWorkbenchCaller(context.caller)) return templates.save(input, context.signal);
      if (!hostIntents || !bindings || !intentKey) throw errors.invalidInput("外部保存模板需要主机路由版本和意图键");
      if (input.panes.some(({ loginCommand }) => loginCommand !== undefined) || input.rebindHostIds?.length) throw errors.permissionDenied("SSH 模板登录命令与端点重绑");
      const hostIds = input.panes.map(({ hostId }) => hostId);
      const { authorize, scope } = templateWriteScope(context, bindings, hostIds, input.previous !== undefined);
      authorize();
      return hostIntents.run(context, sshCapabilityDescriptors.workspaceTemplatesSave.name, {
        hosts: bindings.map(({ hostId }) => hostId),
        intentKey,
        input: { ...input, bindings },
        output: WorkspaceTemplateReceipt,
        authorize,
        run: async () => {
          const { id, revision } = await templates.save(input, context.signal, undefined, scope);
          return { id, revision };
        },
      });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.workspaceTemplatesDelete, (context, { bindings, intentKey, ...input }) => {
      if (isWorkbenchCaller(context.caller)) return templates.delete(input, context.signal);
      if (!hostIntents || !bindings || !intentKey) throw errors.invalidInput("外部删除模板需要主机路由版本和意图键");
      const { authorize, scope } = templateWriteScope(context, bindings, [], true);
      authorize();
      return hostIntents.run(context, sshCapabilityDescriptors.workspaceTemplatesDelete.name, {
        hosts: bindings.map(({ hostId }) => hostId),
        intentKey,
        input: { ...input, bindings },
        output: sshCapabilityDescriptors.workspaceTemplatesDelete.output,
        authorize,
        run: () => templates.delete(input, context.signal, scope),
      });
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceRunsList, (context) => (isWorkbenchCaller(context.caller) ? [...runs.list(), ...publicWorkspaces.list()] : publicWorkspaces.list(context))));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.workspaceRunsStart, (context, input) => {
      if ("connections" in input) return publicWorkspaces.start(context, input);
      if (!isWorkbenchCaller(context.caller)) throw errors.invalidInput("外部工作区需要本主体的原连接和意图");
      return runs.start(input, context.signal);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.workspaceRunsReconnect, (context, input) => {
      if ("connections" in input) return publicWorkspaces.reconnect(context, input);
      if (!isWorkbenchCaller(context.caller)) throw errors.invalidInput("外部工作区重连需要运行代次、本主体连接和意图");
      return runs.reconnect(input.id, context.signal);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.workspaceRunsClose, async (context, input) => {
      if (isWorkbenchCaller(context.caller)) {
        if (publicWorkspaces.closeWorkbench(input.id)) return { ok: true as const };
        return runs.close(input.id, context.signal);
      }
      if (!("generation" in input)) throw errors.invalidInput("关闭外部 SSH 工作区需要原运行代次和意图");
      await publicWorkspaces.close(context, input);
      return { ok: true as const };
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.workspaceRunsSaveTemplate, (context, input) => {
      if ("generation" in input) return publicWorkspaces.saveTemplate(context, input);
      if (!isWorkbenchCaller(context.caller)) throw errors.invalidInput("保存外部 SSH 工作区需要原运行代次和意图");
      return runs.saveTemplate(input.id, input.name, context.signal);
    }),
  );
  const [importPreview, importConfirm] = hostImportCapabilities(hosts, directory, api.vault.files, hostIntents, credentialHost, (kind, id) => api.events.publish("entity.changed", { kind, id, op: "updated" }));
  api.defineCapability(importPreview);
  api.defineCapability(importConfirm);
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostsOrganize, async (context, request) => {
      const update = async (scope?: Parameters<HostDirectory["organize"]>[1]) => {
        const view = await directory.organize(request, scope);
        api.events.publish("entity.changed", { kind: "ssh-host-directory", id: "directory", op: "updated" });
        return view;
      };
      if (isWorkbenchCaller(context.caller)) return update();
      const { bindings, intentKey, operation } = request;
      if (!hostIntents || !intentKey || !bindings) throw errors.invalidInput("外部目录操作需要主机路由版本和意图键");
      if (!("hostIds" in operation)) throw errors.permissionDenied("SSH 全库目录操作");
      const targets = new Set(operation.hostIds);
      const boundIds = new Set(bindings.map(({ hostId }) => hostId));
      if (boundIds.size !== bindings.length || boundIds.size !== targets.size || [...targets].some((id) => !boundIds.has(id))) throw errors.invalidInput("需要为每个主机提供原路由版本");
      return hostIntents.run(context, sshCapabilityDescriptors.hostsOrganize.name, {
        hosts: operation.hostIds,
        intentKey,
        input: { expectedVersion: request.expectedVersion, operation, bindings },
        output: PublicDirectoryMutation,
        authorize: () => bindings.flatMap((binding) => readBoundRoute(api.vault.files, context, binding).map(({ id }) => id)),
        run: async (assertCurrent) => {
          const { version } = await update({ visible: () => new Set(visibleHosts(context).map(({ id }) => id)), assertCurrent });
          return { version };
        },
      });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostsList, async (context) => {
      if (!isWorkbenchCaller(context.caller)) return visibleHosts(context).map(({ id, name, host, port, user, tags, revision }) => PublicHostView.parse({ id, name, host, port, user, tags, revision }));
      return (await hosts.list()).map((host) => {
        if (!("configId" in host)) return host;
        const { configId: _internal, ...view } = host;
        return view;
      });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.routesEdit, async ({ caller, signal }, input) => {
      if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(sshCapabilityDescriptors.routesEdit.name);
      const result = await hosts.editRoutes(input, signal);
      for (const id of result.updated) api.events.publish("entity.changed", { kind: "ssh-host", id, op: "updated" });
      return result;
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostsConfigure, async (context, request) => {
      const { intentKey, routeRevision, ...input } = request;
      const save = async (assertCurrent?: () => void) => {
        const saved = await hosts.configure(input, context.signal, assertCurrent);
        api.events.publish("entity.changed", { kind: "ssh-host", id: saved.hostId, op: input.hostId ? "updated" : "created" });
        return saved;
      };
      if (context.caller === "web") {
        if (input.outboundProxy !== undefined) throw errors.permissionDenied("SSH 出站代理选择");
        if (input.credentials.some(({ purpose, action }) => purpose === "identityFile" && action === "replace")) throw errors.permissionDenied("SSH 本机身份文件");
      }
      if (isWorkbenchCaller(context.caller)) return save();
      const { hostId, expectedRevision } = input;
      if (!hostIntents || !intentKey || !routeRevision || !hostId || !expectedRevision) throw errors.invalidInput("外部编辑需要已授权主机、主机版本、路由版本和意图键");
      externalSshOwner(context);
      authorizedResourceRoute(api.vault.files, context, hostId);
      if (input.credentials.some(({ purpose, action }) => purpose === "identityFile" && action === "replace")) throw errors.permissionDenied("SSH 本机身份文件");
      const authorize = () => {
        const { target, ids } = boundHost(context, { hostId, routeRevision, expectedRevision });
        if (
          input.host.trim().toLowerCase() !== target.host.toLowerCase() ||
          input.port !== target.port ||
          input.user.trim() !== target.user ||
          input.authKind !== target.auth.kind ||
          input.jumpHostIds.length !== target.jumpHostIds.length ||
          input.jumpHostIds.some((id, index) => id !== target.jumpHostIds[index])
        )
          throw errors.permissionDenied("SSH 主机地址、跳板及认证类型变更");
        return ids;
      };
      const credentials = await sealCredentialPatches(input.credentials, credentialHost);
      return hostIntents.run(context, sshCapabilityDescriptors.hostsConfigure.name, {
        hosts: [hostId],
        intentKey,
        input: { ...input, routeRevision, credentials },
        output: PublicHostMutation,
        authorize,
        run: save,
      });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostsCopy, async (context, request) => {
      const save = async (assertCurrent?: () => void) => {
        const saved = await hosts.copy(request, context.signal, assertCurrent);
        api.events.publish("entity.changed", { kind: "ssh-host", id: saved.hostId, op: "created" });
        return saved;
      };
      if (isWorkbenchCaller(context.caller)) return save();
      const { hostId, intentKey, routeRevision, expectedRevision } = request;
      if (!hostIntents || !intentKey || !routeRevision) throw errors.invalidInput("外部复制需要主机路由版本和意图键");
      return hostIntents.run(context, sshCapabilityDescriptors.hostsCopy.name, {
        hosts: [hostId],
        intentKey,
        input: request,
        output: PublicHostMutation,
        authorize: () => boundHost(context, { hostId, routeRevision, expectedRevision }).ids,
        run: save,
      });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostsRemove, async (context, input) => {
      const { hostId } = input;
      const workbench = isWorkbenchCaller(context.caller);
      const checkUnused = () => {
        if (workbench) return assertHostUnused(hostId);
        try {
          assertHostUnused(hostId);
        } catch (error) {
          if (!(error instanceof HuhuError) || error.code !== "INVALID_INPUT") throw error;
          throw errors.invalidInput("SSH 主机仍被引用");
        }
        if (monitorPanels.list().some(({ hostIds }) => hostIds.includes(hostId)) || manager.hasWorkbenchConnection(hostId)) throw errors.invalidInput("SSH 主机仍被引用或使用");
      };
      const remove = async (assertCurrent?: () => void) => {
        await hosts.remove(input, context.signal, checkUnused, assertCurrent);
        if (workbench || !manager.hasWorkbenchConnection(hostId)) manager.forgetConnection(hostId);
        api.events.publish("entity.changed", { kind: "ssh-host", id: hostId, op: "deleted" });
        return { ok: true as const };
      };
      if (workbench) return remove();
      const { intentKey, routeRevision, expectedRevision } = input;
      if (!hostIntents || !intentKey || !routeRevision) throw errors.invalidInput("外部移除需要主机路由版本和意图键");
      return hostIntents.run(context, sshCapabilityDescriptors.hostsRemove.name, {
        hosts: [hostId],
        intentKey,
        input,
        output: sshCapabilityDescriptors.hostsRemove.output,
        authorize: () => boundHost(context, { hostId, routeRevision, expectedRevision }).ids,
        run: remove,
      });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.connect, (context, { hostId, background, routeRevision, intentKey }) => {
      const { caller, signal } = context;
      if (!isWorkbenchCaller(caller)) {
        const input = ConnectOwned.safeParse({ hostId, routeRevision, intentKey });
        if (background || !input.success) throw errors.invalidInput("外部连接需要主机路由版本和意图键");
        return publicProbes.connect(context, input.data);
      }
      if (!background) return manager.connect(hostId, signal);
      if (caller !== "desktop") throw errors.permissionDenied("ssh.connect");
      signal.throwIfAborted();
      return manager.start(hostId);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.connectionStatuses, (context) => (isWorkbenchCaller(context.caller) ? [...manager.connectionStatuses(), ...publicProbes.workbenchConnections()] : publicProbes.currentStatuses(context))),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.disconnect, (context, { hostId, attemptId, routeRevision }) => {
      if (isWorkbenchCaller(context.caller)) {
        if (attemptId) publicProbes.closeWorkbench(attemptId, hostId);
        else manager.disconnect(hostId);
        return { ok: true as const };
      }
      if (!attemptId || !routeRevision) throw errors.invalidInput("撤销外部连接核验需要原尝试和路由版本");
      return publicProbes.cancel(context, { hostId, attemptId, routeRevision });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.hostKeyDecide, (context, { remember, ...request }) => {
      if (!isWorkbenchCaller(context.caller)) {
        const input = DecidePublicProbe.safeParse(request);
        if (remember || !input.success) throw errors.invalidInput("外部信任决定需要原核验待答和精确指纹");
        return publicProbes.decide(context, input.data);
      }
      if (request.accept && remember !== false) api.vault.files.assertWritable();
      return { applied: manager.decide(request.attemptId, request.hop, request.accept, request.promptId, remember) };
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.knownHostsList, (context) => {
      if (isWorkbenchCaller(context.caller)) return manager.knownHosts();
      const routes = visibleSshRoutes(api.vault.files, context);
      const addresses = new Set([...routes.values()].map(({ host, port }) => JSON.stringify([host, port])));
      return manager.knownHosts().filter(({ host, port }) => addresses.has(JSON.stringify([host, port])));
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.knownHostsForget, (context, { hostId, routeRevision, intentKey, ...key }) => {
      const forget = async (assertCurrent?: () => void) => {
        api.vault.files.assertWritable();
        await manager.forgetHostKey(key, assertCurrent);
        api.events.publish("entity.changed", { kind: "ssh-known-hosts", id: key.fingerprint, op: "deleted" });
        return { ok: true as const };
      };
      if (isWorkbenchCaller(context.caller)) {
        if (context.caller !== "desktop") throw errors.permissionDenied("SSH 主机信任管理");
        return forget();
      }
      if (!hostIntents || !hostId || !routeRevision || !intentKey) throw errors.invalidInput("外部移除指纹需要原主机、路由修订和意图键");
      return hostIntents.run(context, sshCapabilityDescriptors.knownHostsForget.name, {
        hosts: [hostId],
        intentKey,
        input: { hostId, routeRevision, ...key },
        output: sshCapabilityDescriptors.knownHostsForget.output,
        authorize: () => {
          const chain = readBoundRoute(api.vault.files, context, { hostId, routeRevision });
          const target = chain.at(-1)!;
          if (key.host !== target.host || key.port !== target.port) throw errors.notFound("当前获准主机的原指纹");
          return chain.map(({ id }) => id);
        },
        run: forget,
      });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.execRun, (context, input) => {
      if ("jobId" in input) {
        if (!publicJobs) throw errors.notFound("SSH 作业");
        return publicJobs.start(context, input);
      }
      if (!isWorkbenchCaller(context.caller)) throw errors.invalidInput("外部 SSH 执行需要已准备的自有作业和会话");
      const { hostId, command, timeoutSec, execId } = input;
      return manager.exec(hostId, command, { ...(timeoutSec && { timeoutSec }), ...(execId && { execId }) });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.execCancel, (context, { execId, jobId, hostId, routeRevision }) => {
      if (isWorkbenchCaller(context.caller)) {
        if (execId === undefined) throw errors.invalidInput("缺少 SSH 命令 ID");
        return { cancelled: manager.cancel(execId) };
      }
      if (execId !== undefined || !jobId || !hostId || !routeRevision) throw errors.invalidInput("取消外部 SSH 作业需要作业、主机和路由版本");
      if (!publicJobs) throw errors.notFound("SSH 作业");
      return { cancelled: publicJobs.cancel(context, jobId, { hostId, routeRevision }).requested };
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.auditList, (context, { hostId, limit }) => {
      if (isWorkbenchCaller(context.caller)) return manager.auditList(hostId, limit);
      const owner = externalSshOwner(context);
      const routes = visibleSshRoutes(api.vault.files, context);
      if (hostId !== undefined && !routes.has(hostId)) throw errors.permissionDenied("SSH 主机授权");
      return manager.externalAuditList(owner, routes, hostId, limit);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsOpen, (context, input) => {
      if ("attemptId" in input) return publicFiles.open(context, input);
      if (!isWorkbenchCaller(context.caller)) throw errors.invalidInput("打开外部 SSH 文件会话需要原连接和意图键");
      return files.open(input);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.archiveSupport, (context, { fileSessionId }) => (isWorkbenchCaller(context.caller) ? archives.support(fileSessionId, context.signal) : publicArchives.support(context, fileSessionId))),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.archiveRun, (context, input) => {
      if (isWorkbenchCaller(context.caller)) return archives.run(input, context.signal);
      if (!("intentKey" in input)) throw errors.invalidInput("外部归档需要自有远端会话、原修订、大小上限和意图键");
      return publicArchives.run(context, input);
    }),
  );
  const desktopTransfers = ({ caller }: CapabilityContext) => {
    if (isWorkbenchCaller(caller) && caller !== "desktop") throw errors.permissionDenied("SSH 传输工作台");
    return caller === "desktop";
  };
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferStart, (context, input) => (desktopTransfers(context) ? transfers.start(input) : publicTransfers.start(context, input))));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferStartBatch, (context, input) => (desktopTransfers(context) ? transfers.startBatch(input, context.signal) : publicTransfers.startBatch(context, input))));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.transferList, (context) => {
      if (!desktopTransfers(context)) return publicTransfers.list(context);
      const local = transfers.list();
      const external = publicTransfers.workbenchList();
      return { ...local, jobs: [...local.jobs, ...external.flatMap((queue) => queue.jobs)], batches: [...local.batches, ...external.flatMap((queue) => queue.batches)] };
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferDecide, (context, input) => (desktopTransfers(context) ? transfers.decide(input.transferId, input.choice) : publicTransfers.control(context, "decide", input))));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.transferCancel, (context, input) =>
      desktopTransfers(context) ? (publicTransfers.workbenchCancel(input.transferId) ?? transfers.cancel(input.transferId)) : publicTransfers.control(context, "cancel", input),
    ),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferPause, (context, input) => (desktopTransfers(context) ? transfers.pause(input.transferId) : publicTransfers.control(context, "pause", input))));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferResume, (context, input) => (desktopTransfers(context) ? transfers.resume(input.transferId) : publicTransfers.control(context, "resume", input))));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferRetry, (context, input) => (desktopTransfers(context) ? transfers.retry(input.transferId) : publicTransfers.control(context, "retry", input))));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferRecheck, (context, input) => (desktopTransfers(context) ? transfers.recheck(input.transferId, context.signal) : publicTransfers.control(context, "recheck", input))));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferOrigin, (context, input) => (desktopTransfers(context) ? transfers.openOrigin(input.transferId) : publicTransfers.origin(context, input))));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.transferClear, (context, input) => (desktopTransfers(context) ? transfers.clear() : publicTransfers.clear(context, input.intentKey))));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsList, (context) => (isWorkbenchCaller(context.caller) ? [...files.list(), ...publicFiles.files.list()] : publicFiles.list(context))));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsClose, (context, input) => {
      if (!isWorkbenchCaller(context.caller)) {
        if (input.attached !== undefined) throw errors.invalidInput("外部调用不能关闭工作台分栏");
        return publicFiles.close(context, input);
      }
      if (!publicFiles.closeWorkbench(input.fileSessionId)) files.close(input.fileSessionId, input.attached);
      return { ok: true as const };
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.fileSessionsLocalList, (_c, i) => files.localList(i.fileSessionId, i.parts, i.root)));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsSearch, (context, { fileSessionId, path, query, searchId }) => {
      if (isWorkbenchCaller(context.caller)) return files.search(fileSessionId, path, query, context.signal);
      if (!searchId) throw errors.invalidInput("外部 SSH 搜索需要本主体的搜索 ID");
      return publicFiles.withSftp(context, fileSessionId, (channel, signal) => sftp.searchNames(channel, path, query, signal), { kind: "search", id: searchId });
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsCancelSearch, (context, input) => {
      if (isWorkbenchCaller(context.caller)) return { cancelled: files.cancelSearch(input.fileSessionId) };
      if (!input.searchId) throw errors.invalidInput("取消外部 SSH 搜索需要原搜索 ID");
      return publicFiles.cancelRequest(context, "ssh.fileSessions.cancelSearch", input, "search", input.searchId);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsDocumentOpen, (context, i) => {
      if (isWorkbenchCaller(context.caller)) return files.readDocument(i.fileSessionId, i.path, context.signal);
      return publicFiles.use(context, i.fileSessionId, (owned) => owned.readDocument(i.fileSessionId, i.path, context.signal));
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsDocumentSave, async (context, input) => {
      const { fileSessionId, path, text, expectedVersion } = input;
      if (isWorkbenchCaller(context.caller)) return files.writeDocument(fileSessionId, path, text, expectedVersion, context.signal);
      const capability = sshCapabilityDescriptors.fileSessionsDocumentSave;
      const digest = await publicFiles.seal(context, fileSessionId, capability.name, text);
      return publicFiles.mutate(context, capability.name, input, { path, digest, expectedVersion }, capability.output, (check) =>
        publicFiles.use(context, fileSessionId, (owned) => owned.writeDocument(fileSessionId, path, text, expectedVersion, context.signal, check)),
      );
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsProperties, (context, i) => {
      if (isWorkbenchCaller(context.caller)) return files.properties(i.fileSessionId, i.path, context.signal);
      return publicFiles.use(context, i.fileSessionId, (owned) => owned.properties(i.fileSessionId, i.path, context.signal));
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsDirectory, (context, { fileSessionId }) =>
      isWorkbenchCaller(context.caller) ? files.directoryState(fileSessionId) : publicFiles.use(context, fileSessionId, (owned) => owned.directoryState(fileSessionId)),
    ),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsPrepareDirectory, (context, { fileSessionId, path, revision }) => {
      const prepare = (sessions: FileSessions) => sessions.prepareDirectory(fileSessionId, path, revision, context.signal);
      return isWorkbenchCaller(context.caller) ? prepare(files) : publicFiles.use(context, fileSessionId, prepare);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsCommitDirectory, async (context, input) => {
      const { fileSessionId, follow } = input;
      context.signal.throwIfAborted();
      const commit = async (sessions: FileSessions) => ({ applied: await sessions.commitDirectory(fileSessionId, follow) });
      if (isWorkbenchCaller(context.caller)) return commit(files);
      const { name, output } = sshCapabilityDescriptors.fileSessionsCommitDirectory;
      return publicFiles.mutate(context, name, input, { follow }, output, () => publicFiles.use(context, fileSessionId, commit));
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsChangeProperties, (context, input) => {
      const { fileSessionId, path, expectedRevision, change } = input;
      if (isWorkbenchCaller(context.caller)) return files.changeProperties(fileSessionId, path, expectedRevision, change, context.signal);
      const capability = sshCapabilityDescriptors.fileSessionsChangeProperties;
      return publicFiles.mutate(context, capability.name, input, { path, expectedRevision, change }, capability.output, (check) =>
        publicFiles.use(context, fileSessionId, (owned) => owned.changeProperties(fileSessionId, path, expectedRevision, change, context.signal, check)),
      );
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsCreateEntry, (context, input) => {
      const { fileSessionId, path, entry } = input;
      if (isWorkbenchCaller(context.caller)) return files.createEntry(fileSessionId, path, entry, context.signal);
      const capability = sshCapabilityDescriptors.fileSessionsCreateEntry;
      return publicFiles.mutate(context, capability.name, input, { path, entry }, capability.output, (check) => publicFiles.use(context, fileSessionId, (owned) => owned.createEntry(fileSessionId, path, entry, context.signal, check)));
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.fileSessionsMoveEntry, (context, input) => {
      const { fileSessionId, path, expectedRevision, destination } = input;
      if (isWorkbenchCaller(context.caller)) return files.moveEntry(fileSessionId, path, expectedRevision, destination, context.signal);
      const capability = sshCapabilityDescriptors.fileSessionsMoveEntry;
      return publicFiles.mutate(context, capability.name, input, { path, expectedRevision, destination }, capability.output, (check) =>
        publicFiles.use(context, fileSessionId, (owned) => owned.moveEntry(fileSessionId, path, expectedRevision, destination, context.signal, check)),
      );
    }),
  );
  const ownedFileId = ({ fileSessionId }: { fileSessionId?: string | undefined }) => {
    if (!fileSessionId) throw errors.invalidInput("外部 SFTP 操作需要本主体的文件会话");
    return fileSessionId;
  };
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.sftpList, (context, input) => {
      if (isWorkbenchCaller(context.caller)) return manager.sftpList(files.source(input), input.path, context.signal);
      return publicFiles.withSftp(context, ownedFileId(input), (channel) => sftp.list(channel, input.path));
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.sftpRead, (context, input) => {
      if (isWorkbenchCaller(context.caller)) return manager.sftpRead(files.source(input), input.path);
      return publicFiles.withSftp(context, ownedFileId(input), (channel, signal) => sftp.readText(channel, input.path, signal));
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.sftpWrite, (context, input) => {
      if (isWorkbenchCaller(context.caller)) return manager.sftpWrite(files.source(input), input.path, input.text, input.overwrite);
      return publicFiles.write(context, "ssh.sftp.write", { ...input, fileSessionId: ownedFileId(input) }, input.path, Buffer.from(input.text, "utf8"));
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.sftpUpload, (context, input) => {
      if ("localPath" in input) {
        if (!isWorkbenchCaller(context.caller)) throw errors.invalidInput("外部 SFTP 上传不能访问 Engine 本机路径");
        return manager.sftpUpload(files.source(input), input.localPath, input.remotePath, input.overwrite, context.signal);
      }
      return publicFiles.write(context, "ssh.sftp.upload", input, input.remotePath, Buffer.from(input.dataBase64, "base64"));
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.sftpDownload, (context, input) => {
      if ("localPath" in input) {
        if (!isWorkbenchCaller(context.caller)) throw errors.invalidInput("外部 SFTP 下载不能访问 Engine 本机路径");
        return manager.sftpDownload(files.source(input), input.remotePath, input.localPath, input.overwrite, context.signal);
      }
      return publicFiles.download(context, input);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.sftpCancel, (context, input) => {
      if ("transferId" in input) return publicFiles.cancelTransfer(context, input);
      if (!isWorkbenchCaller(context.caller)) throw errors.invalidInput("外部 SFTP 取消需要原传输 ID");
      return { cancelled: manager.sftpCancel(files.source(input)) };
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.sftpMkdir, async (context, input) => {
      if (!isWorkbenchCaller(context.caller)) {
        const fileSessionId = ownedFileId(input);
        return publicFiles.mutate(context, "ssh.sftp.mkdir", { ...input, fileSessionId }, { path: input.path }, sshCapabilityDescriptors.sftpMkdir.output, async (assertCurrent) => {
          await publicFiles.withSftp(context, fileSessionId, (channel) => sftp.mkdir(channel, input.path, assertCurrent));
          return { ok: true as const };
        });
      }
      await manager.sftpMkdir(files.source(input), input.path);
      return { ok: true as const };
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.sftpRename, async (context, input) => {
      if (!isWorkbenchCaller(context.caller)) {
        const fileSessionId = ownedFileId(input);
        const { from, to, overwrite, expectedRevision, expectedDestinationRevision } = input;
        if (!expectedRevision || (overwrite && !expectedDestinationRevision)) throw errors.invalidInput("外部重命名需要原文件修订，覆盖时还需提供目标修订");
        return publicFiles.mutate(context, "ssh.sftp.rename", { ...input, fileSessionId }, { from, to, overwrite, expectedRevision, expectedDestinationRevision }, sshCapabilityDescriptors.sftpRename.output, async (assertCurrent) => {
          await publicFiles.withSftp(context, fileSessionId, async (channel) => {
            await assertEntryRevision(channel, from, expectedRevision);
            if (expectedDestinationRevision) await assertEntryRevision(channel, to, expectedDestinationRevision);
            await sftp.rename(channel, from, to, overwrite, assertCurrent);
          });
          return { ok: true as const };
        });
      }
      await manager.sftpRename(files.source(input), input.from, input.to, input.overwrite);
      return { ok: true as const };
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.sftpDelete, async (context, input) => {
      if (!isWorkbenchCaller(context.caller)) {
        const fileSessionId = ownedFileId(input);
        const { path, expectedRevision } = input;
        if (!expectedRevision) throw errors.invalidInput("外部删除需要原文件修订");
        return publicFiles.mutate(context, "ssh.sftp.delete", { ...input, fileSessionId }, { path, expectedRevision }, sshCapabilityDescriptors.sftpDelete.output, async (assertCurrent) => {
          await publicFiles.withSftp(context, fileSessionId, async (channel) => {
            await assertEntryRevision(channel, path, expectedRevision);
            await sftp.remove(channel, path, assertCurrent);
          });
          return { ok: true as const };
        });
      }
      await manager.sftpDelete(files.source(input), input.path);
      return { ok: true as const };
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.shellsOpen, (context, input) => {
      if (isWorkbenchCaller(context.caller)) return manager.openShell(input.hostId, { cols: input.cols, rows: input.rows });
      if (!("attemptId" in input)) throw errors.invalidInput("打开外部 SSH 终端需要连接和意图键");
      return publicShells.open(context, input);
    }),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.shellsList, (context, { hostId }) => (isWorkbenchCaller(context.caller) ? [...manager.listShells(hostId), ...publicShells.workbenchList(hostId)] : publicShells.list(context, hostId))),
  );
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.shellsClose, (context, input) => {
      if (isWorkbenchCaller(context.caller)) {
        const id = "id" in input ? input.id : input.shellId;
        return { closed: publicShells.closeWorkbench(id) || manager.closeShell(id) };
      }
      if (!("shellId" in input)) throw errors.invalidInput("关闭外部 SSH 终端需要 shellId 和意图键");
      return publicShells.close(context, input);
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.shellsRead, (context, input) => publicShells.read(context, input)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.shellsWrite, (context, input) => publicShells.write(context, input)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.shellsResize, (context, input) => publicShells.resize(context, input)));
  registerSshTerminalBridge(api, manager, localShells?.attach);
  return { manager };
}
