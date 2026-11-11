import { z } from "zod";
import type { ExternalPlugins } from "../plugins/external.js";
import { defineCapability } from "./define.js";
import type { CapabilityRegistry } from "./define.js";

const Manifest = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  version: z.string(),
  permissions: z.array(z.string()),
  dependsOn: z.array(z.string()),
});
const Perm = z.object({ name: z.string(), capabilities: z.array(z.string()) });
const admin = { plugin: "kernel", scope: "admin" as const, exposable: false, defaultExposed: false };

/** 外部扩展的安装 / 卸载 / 命令（仅桌面可调用）。扩展自己的调用走 `plugin:<id>` 令牌与 PERMISSION_TABLE。 */
export function registerExternalPluginCapabilities(registry: CapabilityRegistry, external: ExternalPlugins): () => void {
  const offs = [
    registry.register(
      defineCapability({
        name: "plugins.inspect",
        ...admin,
        input: z.object({ source: z.string() }),
        output: z.object({ manifest: Manifest, permissions: z.array(Perm), publisher: z.string().optional() }),
        handler: (_c, i) => {
          const info = external.inspect(i.source);
          try {
            return {
              manifest: { id: info.manifest.id, title: info.manifest.title, description: info.manifest.description, version: info.manifest.version, permissions: info.manifest.permissions, dependsOn: info.manifest.dependsOn },
              permissions: external.permissionInfo(info.manifest).map((p) => ({ name: p.name, capabilities: [...p.capabilities] })),
              ...(info.publisher ? { publisher: info.publisher } : {}),
            };
          } finally {
            info.cleanup?.();
          }
        },
      }),
    ),
    registry.register(
      defineCapability({
        name: "plugins.install",
        ...admin,
        input: z.object({ source: z.string(), grants: z.array(z.string()) }),
        output: z.object({ id: z.string() }),
        timeoutMs: 60_000,
        handler: (_c, i) => external.install(i.source, i.grants),
      }),
    ),
    registry.register(
      defineCapability({
        name: "plugins.uninstall",
        ...admin,
        input: z.object({ id: z.string(), eraseData: z.boolean().default(false) }),
        output: z.object({ ok: z.literal(true) }),
        handler: async (_c, i) => (await external.uninstall(i.id, i.eraseData), { ok: true as const }),
      }),
    ),
    registry.register(
      defineCapability({
        name: "plugins.examples",
        ...admin,
        scope: "read",
        input: z.object({}),
        output: z.array(z.object({ id: z.string(), manifest: Manifest, publisher: z.string(), tags: z.array(z.string()), installed: z.boolean(), source: z.string() })),
        handler: () =>
          external.examples().map((e) => ({
            id: e.id,
            manifest: { id: e.manifest.id, title: e.manifest.title, description: e.manifest.description, version: e.manifest.version, permissions: e.manifest.permissions, dependsOn: e.manifest.dependsOn },
            publisher: e.publisher,
            tags: e.tags,
            installed: e.installed,
            source: e.source,
          })),
      }),
    ),
    registry.register(
      defineCapability({
        name: "plugins.commands.list",
        ...admin,
        scope: "read",
        input: z.object({}),
        output: z.array(z.object({ pluginId: z.string(), id: z.string(), title: z.string() })),
        handler: () => external.commands(),
      }),
    ),
    registry.register(
      defineCapability({
        name: "plugins.commands.run",
        ...admin,
        input: z.object({ pluginId: z.string(), commandId: z.string(), args: z.record(z.string(), z.unknown()).default({}) }),
        output: z.object({ result: z.unknown() }),
        timeoutMs: 70_000,
        handler: async (_c, i) => ({ result: await external.runCommand(i.pluginId, i.commandId, i.args) }),
      }),
    ),
  ];
  return () => offs.forEach((off) => off());
}
