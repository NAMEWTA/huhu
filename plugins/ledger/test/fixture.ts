import { randomUUID } from "node:crypto";
import path from "node:path";
import { PERIODIC_PLANS_SERVICE, periodicPlanSourceService, PluginManifestSchema, type PeriodicPlanSource } from "@huhu/contracts";
import { CapabilityRegistry, createHuhuContext, Dispatcher, EventBus, GatewayAudit, IdempotencyStore, PluginManager } from "@huhu/kernel";
import { OperationLog, SemanticRepository, Trash, Vault, VaultFiles, VaultIndex } from "@huhu/vault";
import { PeriodicPlans } from "../../automations/src/engine/periodic-plans.js";
import manifest from "../huhu-plugin.json";
import { apply, ledgerCapabilityDescriptors } from "../src/engine/index.js";

export async function ledgerEngine(directory: string, readOnly = false, clock?: { now(): number }, options?: { notes?: boolean }) {
  const vault = await Vault.open(directory, { create: !readOnly, readOnly });
  const registry = new CapabilityRegistry();
  const events = new EventBus(() => vault.id);
  const index = new VaultIndex(vault.root);
  const operations = new OperationLog(vault.files, path.join(vault.stateDir, "operations"));
  const repo = new SemanticRepository(vault.files, operations);
  const trash = new Trash(vault.files, undefined, operations);
  const lifecycle = createHuhuContext({
    registry, events,
    vault: { files: vault.files, stateDir: vault.stateDir, vaultId: vault.id, repo, index, trash },
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
  plugins.register({ manifest: PluginManifestSchema.parse(manifest), apply: (ctx, api) => apply(ctx, api, () => dispatcher) });
  if (options?.notes) {
    await index.build();
    const notes = await import("../../notes/src/engine/index.js");
    const notesManifest = PluginManifestSchema.parse((await import("../../notes/huhu-plugin.json")).default);
    registry.declareDescriptors("notes", notes.notesCapabilityDescriptors);
    plugins.register({ manifest: notesManifest, apply: (ctx, api) => { notes.apply(ctx, api); } });
  }
  const dispatcher: Dispatcher = new Dispatcher({
    registry, audit: new GatewayAudit(), idempotency: new IdempotencyStore(),
    isPluginEnabled: (id) => plugins.isEnabled(id),
    toolAccess: () => ({ state: "ready", revision: 0, choices: {} }),
    grantedPermissions: (id) => plugins.permissionsOf(id), pluginOrigin: () => "builtin",
  });
  await plugins.enableAll();
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
