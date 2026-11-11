import { z } from "zod";

const PluginId = z.string().regex(/^[a-z][a-z0-9-]*$/);

export const PluginManifestSchema = z.object({
  id: PluginId,
  title: z.string().min(1),
  description: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  origin: z.enum(["builtin", "external"]),
  dependsOn: z.array(PluginId).default([]),
  optionalDeps: z.array(PluginId).default([]),
  permissions: z.array(z.string()).default([]),
  activation: z.enum(["vault-open", "on-demand"]).default("vault-open"),
  contributes: z
    .object({
      modules: z.array(z.string()).default([]),
      settingsPages: z.array(z.string()).default([]),
      homeWidgets: z.array(z.string()).default([]),
      commands: z.array(z.string()).default([]),
      capabilities: z.array(z.string()).default([]),
      fileKinds: z.array(z.string()).default([]),
    })
    .default({ modules: [], settingsPages: [], homeWidgets: [], commands: [], capabilities: [], fileKinds: [] }),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** 校验依赖图：返回依赖环（若有）；用于清单加载时拒绝循环依赖。 */
export function findDependencyCycle(manifests: readonly Pick<PluginManifest, "id" | "dependsOn">[]): string[] | null {
  const deps = new Map(manifests.map((m) => [m.id, m.dependsOn]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 1);
    stack.push(id);
    for (const d of deps.get(id) ?? []) {
      const c = visit(d);
      if (c) return c;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const m of manifests) {
    const c = visit(m.id);
    if (c) return c;
  }
  return null;
}
