import { randomUUID } from "node:crypto";
import { PERIODIC_PLANS_SERVICE, periodicPlanSourceService, PluginManifestSchema, type PeriodicPlanSource } from "@huhu/contracts";
import { CapabilityRegistry, createHuhuContext, Dispatcher, EventBus, GatewayAudit, IdempotencyStore, PluginManager } from "@huhu/kernel";
import { Vault, VaultFiles } from "@huhu/vault";
import { PeriodicPlans } from "../../automations/src/engine/periodic-plans.js";
import manifest from "../huhu-plugin.json";
import { apply, ledgerCapabilityDescriptors } from "../src/engine/index.js";

export async function ledgerEngine(directory: string, readOnly = false, clock?: { now(): number }) {
  const vault = await Vault.open(directory, { create: !readOnly, readOnly });
  const registry = new CapabilityRegistry();
  const events = new EventBus(() => vault.id);
  const lifecycle = createHuhuContext({
    registry, events,
    vault: { files: vault.files, stateDir: vault.stateDir, vaultId: vault.id, repo: {} as never, index: {} as never, trash: {} as never },
    call: async () => { throw new Error("unexpected plugin call"); },
  });
  const plugins = new PluginManager(lifecycle.root, lifecycle.facade, events);
  let tail: Promise<unknown> = Promise.resolve();
  const periodic = clock ? new PeriodicPlans(new VaultFiles(vault.stateDir, undefined, readOnly), {
    vaultId: vault.id, machineId: "ledger-fixture-machine", instance: "ledger-fixture-owner",
  }, { withRuleConfiguration(operation) {
    const next = tail.then(operation);
    tail = next.catch(() => undefined);
    return next;
  } }, ["ledger"], (plugin) => lifecycle.getService<PeriodicPlanSource>(periodicPlanSourceService(plugin)), clock,
  (id, sourcePlugin, kind) => events.publish("entity.changed", { id, sourcePlugin, kind, op: "updated" })) : undefined;
  if (periodic) lifecycle.facade("automations", lifecycle.root).provide(PERIODIC_PLANS_SERVICE, periodic);
  registry.declareDescriptors("ledger", ledgerCapabilityDescriptors);
  plugins.register({ manifest: PluginManifestSchema.parse(manifest), apply });
  await plugins.enableAll();
  const dispatcher = new Dispatcher({
    registry, audit: new GatewayAudit(), idempotency: new IdempotencyStore(),
    isPluginEnabled: (id) => plugins.isEnabled(id),
    toolAccess: () => ({ state: "ready", revision: 0, choices: {} }),
    grantedPermissions: () => [], pluginOrigin: () => "builtin",
  });
  const invoke = (capability: string, input: unknown = {}) => dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
  async function call<T>(capability: string, input: unknown = {}): Promise<T> {
    const result = await invoke(capability, input);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.data as T;
  }
  let closed = false;
  return {
    call, invoke, plugins, vault, events, periodic,
    async close() {
      if (closed) return;
      closed = true;
      await periodic?.close();
      await plugins.disposeAll();
      await vault.close();
    },
  };
}
