import { toJsonSchema } from "@huhu/contracts";
import { z } from "zod";
import { defineCapability, type CapabilityRegistry } from "./define.js";
import type { PluginManager } from "../plugin-manager.js";

const PluginInfo = z.object({
  id: z.string(), title: z.string(), description: z.string(), version: z.string(), origin: z.string(),
  state: z.enum(["active", "disabled", "failed"]), error: z.string().optional(), dependsOn: z.array(z.string()), permissions: z.array(z.string()),
});

/** 注册内核的插件与能力目录能力（interfaces.md §2：plugins.*、capabilities.list）。 */
export function registerSystemCapabilities(
  registry: CapabilityRegistry,
  plugins: PluginManager,
  exposure: { isExposed(name: string): boolean },
): () => void {
  const offs = [
    registry.register(defineCapability({
      name: "plugins.list", plugin: "kernel", scope: "read", exposable: true, defaultExposed: true, input: z.object({}), output: z.array(PluginInfo),
      handler: () => plugins.list().map((p) => ({ id: p.id, title: p.manifest.title, description: p.manifest.description, version: p.manifest.version, origin: p.manifest.origin, state: p.state, ...(p.error ? { error: p.error } : {}), dependsOn: p.manifest.dependsOn, permissions: p.manifest.permissions })),
    })),
    registry.register(defineCapability({
      name: "plugins.setEnabled", plugin: "kernel", scope: "admin", exposable: false, defaultExposed: false,
      input: z.object({ id: z.string(), enabled: z.boolean() }), output: z.object({ state: z.string(), alsoDisabled: z.array(z.string()) }),
      handler: async (_c, i) => {
        if (i.id === "kernel") return { state: "active", alsoDisabled: [] };
        if (i.enabled) return { state: await plugins.enable(i.id), alsoDisabled: [] };
        return { state: "disabled", alsoDisabled: (await plugins.disable(i.id)).filter((x) => x !== i.id) };
      },
    })),
    registry.register(defineCapability({
      name: "capabilities.list", plugin: "kernel", scope: "read", exposable: true, defaultExposed: true, input: z.object({}),
      output: z.array(z.object({ name: z.string(), plugin: z.string(), scope: z.string(), exposable: z.boolean(), exposed: z.boolean(), input: z.unknown(), output: z.unknown() })),
      handler: () => registry.list().map((c) => ({ name: c.name, plugin: c.plugin, scope: c.scope, exposable: c.exposable, exposed: c.exposable && exposure.isExposed(c.name), input: toJsonSchema(c.input), output: toJsonSchema(c.output) })),
    })),
  ];
  return () => offs.forEach((o) => o());
}
