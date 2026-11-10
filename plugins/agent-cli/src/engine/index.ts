import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { machineId } from "@huhu/vault";
import path from "node:path";
import { z } from "zod";
import { ProviderDetector } from "./providers/index.js";
import { SpaceStore } from "./spaces.js";

export { PROVIDERS, ProviderDetector } from "./providers/index.js";
export { SpaceStore } from "./spaces.js";

const SpaceDto = z.object({ id: z.string(), name: z.string(), root: z.string(), machineId: z.string(), createdAt: z.string(), revision: z.number() });

export function apply(_ctx: Context, api: HuhuApi): { spaces: SpaceStore; detector: ProviderDetector } {
  const root = api.vault.files.root;
  const spaces = new SpaceStore(path.join(root, ".huhu", "agent-cli", "spaces"), machineId());
  spaces.ensureDefault(root); // 首次进入：默认以 Vault 根为目录的 Space
  const detector = new ProviderDetector();

  api.defineCapability(def({ name: "agent.spaces.list", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false, input: z.object({}), output: z.array(SpaceDto), handler: () => spaces.list() }));
  api.defineCapability(def({
    name: "agent.spaces.save", plugin: "agent-cli", scope: "write", exposable: false, defaultExposed: false,
    input: z.object({ id: z.string().optional(), name: z.string(), root: z.string(), expectedRevision: z.number().optional() }), output: SpaceDto,
    handler: (_c, i) => spaces.save({ name: i.name, root: i.root, ...(i.id ? { id: i.id } : {}), ...(i.expectedRevision !== undefined ? { expectedRevision: i.expectedRevision } : {}) }),
  }));
  api.defineCapability(def({ name: "agent.spaces.delete", plugin: "agent-cli", scope: "write", exposable: false, defaultExposed: false, input: z.object({ id: z.string() }), output: z.object({ ok: z.literal(true) }), handler: (_c, i) => (spaces.delete(i.id), { ok: true as const }) }));
  api.defineCapability(def({
    name: "agent.providers.detect", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false,
    input: z.object({ refresh: z.boolean().optional() }),
    output: z.array(z.object({ provider: z.string(), displayName: z.string(), status: z.string(), exe: z.string().nullable(), version: z.string().nullable(), checkedAt: z.string(), headless: z.boolean(), models: z.array(z.object({ id: z.string(), label: z.string(), efforts: z.array(z.string()), fast: z.boolean() })) })),
    handler: (_c, i) => detector.detect(i.refresh === true),
  }));
  return { spaces, detector };
}
