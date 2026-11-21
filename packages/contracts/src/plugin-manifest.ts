import { z } from "zod";

const PluginId = z.string().regex(/^[a-z][a-z0-9-]*$/);

const ExternalCommandSchema = z
  .strictObject({
    owner: PluginId,
    commandId: z.string().regex(/^[a-z][a-z0-9-]*$/),
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(1000),
    input: z.record(z.string(), z.unknown()),
    output: z.record(z.string(), z.unknown()),
    scope: z.enum(["read", "write"]),
    risk: z.enum(["normal", "high"]),
    retry: z.enum(["read-only", "durable-steps"]),
    dependencies: z
      .array(
        z
          .string()
          .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/)
          .max(128),
      )
      .max(40),
  })
  .refine(({ scope, retry }) => (scope === "read") === (retry === "read-only"), "命令范围与重试语义不一致");

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
      commandDescriptors: z.array(ExternalCommandSchema).max(40).optional(),
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
