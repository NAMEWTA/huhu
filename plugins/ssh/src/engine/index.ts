import path from "node:path";
import type { Context } from "@huhu/cordis";
import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, OperationReceipts, type CapabilityContext, type HuhuApi } from "@huhu/kernel";
import { MonitorPanelReceipt, sshCapabilityDescriptors, WorkspaceTemplateReceipt } from "./capabilities.js";
import type { WorkspaceTemplate } from "../shared/workspace.js";
import { PublicHostMutation } from "./auth-profile.js";
import { HostDirectory } from "./directory.js";
import { PublicDirectoryMutation } from "./directory-schema.js";
import { HostStore } from "./hosts.js";
import { HostConfigurations, type SshCredentialHost } from "./host-configurations.js";
import { HostIntents, sealCredentialPatches } from "./host-intents.js";
import { hostImportConfirm, hostImportPreview } from "./import/capability.js";
import { SshManager } from "./manager.js";
import { WorkspaceTemplates } from "./workspace-templates.js";
import { WorkspaceRuns } from "./workspace-runs.js";
import { FileSessions } from "./file-sessions.js";
import { Transfers } from "./transfers.js";
import { Archives } from "./archives.js";
import { ForwardRules } from "./forward-rules.js";
import { ForwardRuns } from "./forward-runs.js";
import { MonitorPanels, type MonitorPanelScope } from "./monitor-panels.js";
import { Monitors } from "./monitors.js";
import { readMonitorTool } from "./monitor-tools.js";
import { SshPreferences } from "./preferences.js";
import { authorizedResourceRoute, boundSshRoutes, externalSshOwner, PublicHostView, readBoundRoute, readPortableHosts, selectedSshHosts, visibleSshRoutes } from "./public-resources.js";
import { DecidePublicProbe, PublicSshProbes, StartPublicProbeIntent } from "./public-probes.js";
import { PublicExecJobs, type RetainActivity } from "./public-jobs.js";

export { sshCapabilityDescriptors } from "./capabilities.js";
export { HostStore } from "./hosts.js";
export { SshManager } from "./manager.js";

export function hasSavedSshHosts(files: HuhuApi["vault"]["files"], ids: readonly string[]): boolean {
  return readPortableHosts(files, new Set(ids)).length === ids.length;
}

export function apply(ctx: Context, api: HuhuApi, credentialHost?: SshCredentialHost, execJobs?: { runtimeDir: string; vaultInstance: string; retainActivity?: RetainActivity }): { manager: SshManager } {
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
  const publicProbes = new PublicSshProbes(api.vault.files, manager, operations);
  const publicJobs = operations ? new PublicExecJobs(api.vault.files, publicProbes, operations.receipts, operations.vaultInstance, manager, operations.retainActivity) : undefined;
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
  api.defineCapability(bindCapability(sshCapabilityDescriptors.hostsDirectory, (context, i) => directory.list(i, isWorkbenchCaller(context.caller) ? undefined : visibleHosts(context))));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.resourcesHostGet, (context, i) => authorizedResourceRoute(api.vault.files, context, i.hostId).view));
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
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.monitorPanelsList, (context) => {
      if (isWorkbenchCaller(context.caller)) return monitorPanels.list();
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
      const identities = new Map(panel.hostIds.map((hostId) => [hostId, routes.get(hostId)!.connectionIdentity]));
      return monitors.cachedDashboard(panel, identities);
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.monitorPanelsChange, ({ signal }, i) => monitors.change(i, signal)));
  const visibleForwardRules = (context: CapabilityContext) => {
    const routes = visibleSshRoutes(api.vault.files, context);
    return forwardRules.list().flatMap((rule) => {
      const route = routes.get(rule.hostId);
      return route?.targetIdentity === rule.boundTarget ? [{ rule, route }] : [];
    });
  };
  api.defineCapability(bindCapability(sshCapabilityDescriptors.forwardRulesList, (context) => (isWorkbenchCaller(context.caller) ? forwardRules.list() : visibleForwardRules(context).map(({ rule }) => rule))));
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
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.forwardRunsList, (context) => {
      if (isWorkbenchCaller(context.caller)) return forwarding.list();
      const rules = new Map(visibleForwardRules(context).map(({ rule, route }) => [rule.id, { revision: rule.revision, connectionIdentity: route.connectionIdentity }]));
      return forwarding.visibleRuns(rules);
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.forwardRunsStart, ({ signal }, input) => forwarding.start(input, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.forwardRunsResume, ({ signal }, input) => forwarding.start(input, signal, true)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.forwardRunsStop, ({ signal }, input) => forwarding.stop(input, signal)));
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
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceRunsList, () => runs.list()));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceRunsStart, ({ signal }, i) => runs.start(i, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceRunsReconnect, ({ signal }, i) => runs.reconnect(i.id, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceRunsClose, ({ signal }, i) => runs.close(i.id, signal)));
  api.defineCapability(bindCapability(sshCapabilityDescriptors.workspaceRunsSaveTemplate, ({ signal }, i) => runs.saveTemplate(i.id, i.name, signal)));
  api.defineCapability(hostImportPreview(hosts));
  api.defineCapability(hostImportConfirm(hosts, directory, (kind, id) => api.events.publish("entity.changed", { kind, id, op: "updated" })));
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
    bindCapability(sshCapabilityDescriptors.hostsConfigure, async (context, request) => {
      const { intentKey, routeRevision, ...input } = request;
      const save = async (assertCurrent?: () => void) => {
        const saved = await hosts.configure(input, context.signal, assertCurrent);
        api.events.publish("entity.changed", { kind: "ssh-host", id: saved.hostId, op: input.hostId ? "updated" : "created" });
        return saved;
      };
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
        const input = StartPublicProbeIntent.safeParse({ hostId, routeRevision, intentKey });
        if (background || !input.success || !input.data.intentKey) throw errors.invalidInput("外部连接核验需要主机路由版本和意图键");
        readBoundRoute(api.vault.files, context, input.data);
        return publicProbes.start(context, input.data);
      }
      if (!background) return manager.connect(hostId, signal);
      if (caller !== "desktop") throw errors.permissionDenied("ssh.connect");
      signal.throwIfAborted();
      return manager.start(hostId);
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.connectionStatuses, (context) => (isWorkbenchCaller(context.caller) ? manager.connectionStatuses() : publicProbes.currentStatuses(context))));
  api.defineCapability(
    bindCapability(sshCapabilityDescriptors.disconnect, (context, { hostId, attemptId, routeRevision }) => {
      if (isWorkbenchCaller(context.caller)) {
        manager.disconnect(hostId);
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
        return publicProbes.decide(context, input.data, "probe");
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
    bindCapability(sshCapabilityDescriptors.knownHostsForget, async (_c, key) => {
      api.vault.files.assertWritable();
      await manager.forgetHostKey(key);
      api.events.publish("entity.changed", { kind: "ssh-known-hosts", id: key.fingerprint, op: "deleted" });
      return { ok: true as const };
    }),
  );
  api.defineCapability(bindCapability(sshCapabilityDescriptors.execRun, (_c, i) => manager.exec(i.hostId, i.command, { ...(i.timeoutSec ? { timeoutSec: i.timeoutSec } : {}), ...(i.execId ? { execId: i.execId } : {}) })));
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
