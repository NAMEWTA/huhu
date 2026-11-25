import { randomUUID } from "node:crypto";
import { PluginManifestSchema } from "@huhu/contracts";
import { CapabilityRegistry, createHuhuContext, Dispatcher, EventBus, GatewayAudit, IdempotencyStore, PluginManager } from "@huhu/kernel";
import { Vault } from "@huhu/vault";
import manifest from "../huhu-plugin.json";
import { apply, ledgerCapabilityDescriptors } from "../src/engine/index.js";

export async function ledgerEngine(directory: string, readOnly = false) {
  const vault = await Vault.open(directory, { create: !readOnly, readOnly });
  const registry = new CapabilityRegistry();
  const events = new EventBus(() => vault.id);
  const lifecycle = createHuhuContext({
    registry, events,
    vault: { files: vault.files, stateDir: vault.stateDir, vaultId: vault.id, repo: {} as never, index: {} as never, trash: {} as never },
    call: async () => { throw new Error("unexpected plugin call"); },
  });
  const plugins = new PluginManager(lifecycle.root, lifecycle.facade, events);
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
    call, invoke, plugins, vault, events,
    async close() {
      if (closed) return;
      closed = true;
      await plugins.disposeAll();
      await vault.close();
    },
  };
}
