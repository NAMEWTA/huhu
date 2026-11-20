import { HomeWidgetDefinitionSchema, PluginManifestSchema, assertHomeWidgetDefinitions, defineHomeWidget, homeWidgetType, projectHomeWidget } from "@huhu/contracts";
import { ContributionRegistry, defineHomeWidgetContribution } from "@huhu/workbench";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import manifestJson from "../huhu-plugin.json" with { type: "json" };
import { sshHostsWidget, sshHostsWidgetConfigSchema } from "../src/shared/index.js";
import { SshHomeWidget } from "../src/ui/HomeWidget.js";
import { contributions } from "../src/ui/index.js";

const manifest = PluginManifestSchema.parse(manifestJson);
const authorized = new Set(["ssh.hosts.list"]);

describe("SSH 首页小组件贡献", () => {
  test("共享描述、清单和桌面实际注册入口一致", () => {
    assertHomeWidgetDefinitions(manifest, [sshHostsWidget]);
    expect(homeWidgetType(sshHostsWidget.owner, sshHostsWidget.id)).toBe("widget:ssh:hosts");
    expect(sshHostsWidget).toMatchObject({
      maxInstances: null,
      minSize: { w: 2, h: 2 },
      defaultSize: { w: 3, h: 2 },
      maxSize: { w: 6, h: 6 },
      defaultConfig: {},
      configSchema: { type: "object", properties: { hostId: { type: "string", minLength: 1 } }, additionalProperties: false },
      capabilities: [{ name: "ssh.hosts.list", required: true }],
    });
    expect(manifest.contributes.capabilities).toContain("ssh.hosts.list");
    const serialized = JSON.stringify(sshHostsWidget);
    expect(HomeWidgetDefinitionSchema.parse(JSON.parse(serialized))).toEqual(sshHostsWidget);

    const registry = new ContributionRegistry();
    registry.register(contributions);
    registry.setEnabledPlugins(["ssh"]);
    const [entry] = registry.getHomeWidgetCatalog(authorized);
    expect(entry?.definition).toBe(sshHostsWidget);
    expect(entry?.component).toBe(SshHomeWidget);
    expect(entry).toMatchObject(projectHomeWidget(sshHostsWidget, new Set(["ssh"]), authorized));
    expect(registry.getSnapshot().homeWidgets).toMatchObject([{ id: "hosts", plugin: "ssh", title: "SSH 主机", order: 20, component: SshHomeWidget }]);
  });

  test.each([
    ["copied metadata", structuredClone(sshHostsWidget)],
    ["handwritten JSON Schema", { ...sshHostsWidget, configSchema: { type: "object" } }],
  ] as const)("rejects %s at trusted registration", (_label, definition) => {
    expect(HomeWidgetDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(() => assertHomeWidgetDefinitions(manifest, [definition])).toThrow(/defineHomeWidget/);

    const registry = new ContributionRegistry();
    const homeWidgets = [{ ...contributions.homeWidgets[0]!, definition }];
    expect(() => registry.register({ ...contributions, homeWidgets })).toThrow(/defineHomeWidget/);
    expect(registry.getSnapshot().modules).toEqual([]);
    expect(registry.getSnapshot().homeWidgets).toEqual([]);
    expect(registry.getHomeWidgetCatalog(authorized)).toEqual([]);
  });

  test("keeps the nested catalog schema aligned with the save validator", () => {
    const registry = new ContributionRegistry();
    registry.register(contributions);
    registry.setEnabledPlugins(["ssh"]);

    const schema = registry.getHomeWidgetCatalog(authorized)[0]!.definition.configSchema;
    const { hostId } = schema.properties as { hostId: { minLength: number } };
    expect(Reflect.set(hostId, "minLength", 2)).toBe(false);
    expect(registry.getHomeWidgetCatalog(authorized)[0]?.definition.configSchema).toMatchObject({
      properties: { hostId: { minLength: 1 } },
    });
    expect(sshHostsWidgetConfigSchema.safeParse({ hostId: "a" }).success).toBe(true);
    expect(sshHostsWidgetConfigSchema.safeParse({ hostId: "" }).success).toBe(false);
  });

  test("captures the validated widget contribution before publishing it", () => {
    const registry = new ContributionRegistry();
    const plainDefinition = structuredClone(sshHostsWidget);
    let reads = 0;
    const widget = {
      ...contributions.homeWidgets[0]!,
      get definition() {
        return reads++ === 0 ? sshHostsWidget : plainDefinition;
      },
    };
    registry.register({ ...contributions, homeWidgets: [widget] });
    expect(registry.getHomeWidgetCatalog(authorized)[0]?.definition).toBe(sshHostsWidget);
  });

  test("owns nested defaults without freezing the caller's data", () => {
    const defaultConfig = { hosts: [{ hostId: "a" }] };
    const definition = defineHomeWidget({
      ...sshHostsWidget,
      configSchema: z.strictObject({ hosts: z.array(z.strictObject({ hostId: z.string() })) }),
      defaultConfig,
    });
    defaultConfig.hosts[0]!.hostId = "b";
    const hosts = definition.defaultConfig.hosts as { hostId: string }[];
    expect(hosts).toEqual([{ hostId: "a" }]);
    expect(Reflect.set(hosts[0]!, "hostId", "c")).toBe(false);
    expect(Reflect.set(hosts, "length", 0)).toBe(false);
  });

  test("默认配置、单台主机引用、尺寸和实例数量按契约校验", () => {
    expect(sshHostsWidgetConfigSchema.parse(sshHostsWidget.defaultConfig)).toEqual({});
    expect(sshHostsWidgetConfigSchema.parse({ hostId: "host-sample1" })).toEqual({ hostId: "host-sample1" });
    expect(sshHostsWidgetConfigSchema.safeParse({ hostId: "" }).success).toBe(false);
    expect(sshHostsWidgetConfigSchema.safeParse({ hostId: "host-sample1", capability: "ssh.connect" }).success).toBe(false);
    expect(() => defineHomeWidget({ ...sshHostsWidget, configSchema: sshHostsWidgetConfigSchema, defaultConfig: { hostId: 1 } })).toThrow();
    expect(HomeWidgetDefinitionSchema.safeParse({ ...sshHostsWidget, defaultSize: { w: 1, h: 2 } }).success).toBe(false);
    expect(HomeWidgetDefinitionSchema.safeParse({ ...sshHostsWidget, maxSize: { w: 7, h: 6 } }).success).toBe(false);
    expect(HomeWidgetDefinitionSchema.safeParse({ ...sshHostsWidget, maxInstances: 0 }).success).toBe(false);
    expect(HomeWidgetDefinitionSchema.safeParse({ ...sshHostsWidget, capabilities: [...sshHostsWidget.capabilities, ...sshHostsWidget.capabilities] }).success).toBe(false);
  });

  test("清单漏报、多报、重复和归属不符会被拒绝", () => {
    const withIds = (...homeWidgets: string[]) => ({ ...manifest, contributes: { ...manifest.contributes, homeWidgets } });
    const registry = new ContributionRegistry();
    expect(() => registry.register({ ...contributions, homeWidgetSource: withIds() })).toThrow(/undeclared definitions: \[widget:ssh:hosts\]/);
    expect(() => registry.register({ ...contributions, homeWidgetSource: withIds("hosts", "ghost") })).toThrow(/missing definitions: \[widget:ssh:ghost\]/);
    expect(() => registry.register({ ...contributions, homeWidgetSource: withIds("hosts", "hosts") })).toThrow(/Duplicate home widget declaration widget:ssh:hosts/);
    expect(() => registry.register({ homeWidgetSource: manifest })).toThrow(/missing definitions: \[widget:ssh:hosts\]/);
    const differentOwner = defineHomeWidget({ ...sshHostsWidget, owner: "versioning", configSchema: sshHostsWidgetConfigSchema });
    expect(() => assertHomeWidgetDefinitions(manifest, [differentOwner])).toThrow(/different owner/);
    expect(() => assertHomeWidgetDefinitions(manifest, [sshHostsWidget, sshHostsWidget])).toThrow(/Duplicate home widget definition widget:ssh:hosts/);
    expect(registry.getSnapshot().modules).toEqual([]);
  });

  test("声明无法引入外部组件，且注册拒绝 Renderer 元数据漂移", () => {
    const registry = new ContributionRegistry();
    expect(() => registry.register({ ...contributions, homeWidgetSource: { ...manifest, origin: "external" } })).toThrow(/Untrusted home widget owner ssh/);
    expect(() => registry.register({ homeWidgets: contributions.homeWidgets })).toThrow(/Missing home widget source/);
    const homeWidgets = contributions.homeWidgets.map((widget) => ({ ...widget, title: "另一个标题" }));
    expect(() => registry.register({ homeWidgetSource: manifest, homeWidgets })).toThrow(/Renderer metadata differs/);
    expect(registry.getSnapshot().homeWidgets).toEqual([]);
  });

  test("同批与跨批重复注册均失败，注销可安全重试", () => {
    const registry = new ContributionRegistry();
    expect(() => registry.register({ ...contributions, homeWidgets: [...contributions.homeWidgets, ...contributions.homeWidgets] })).toThrow(/Duplicate home widget registration widget:ssh:hosts/);
    expect(registry.getSnapshot().modules).toEqual([]);
    const unregister = registry.register({ homeWidgets: contributions.homeWidgets, homeWidgetSource: manifest });
    expect(() => registry.register(contributions)).toThrow(/Duplicate home widget registration widget:ssh:hosts/);
    expect(registry.getSnapshot().modules).toEqual([]);
    registry.removePlugin("ssh");
    const unregisterLatest = registry.register(contributions);
    unregister();
    expect(registry.getSnapshot().homeWidgets).toHaveLength(1);
    unregisterLatest();
    expect(registry.getSnapshot().homeWidgets).toEqual([]);
  });

  test("启动未知、停用、恢复和撤回授权按当前快照投影", () => {
    const registry = new ContributionRegistry();
    registry.register(contributions);
    const catalog = (grants: ReadonlySet<string>) => registry.getHomeWidgetCatalog(grants)[0];
    expect(catalog(authorized)).toMatchObject({ status: "disabled", capabilities: [{ name: "ssh.hosts.list", allowed: false }] });
    expect(catalog(authorized)?.component).toBeUndefined();
    registry.setEnabledPlugins(["ssh"]);
    expect(catalog(authorized)?.component).toBe(SshHomeWidget);
    expect(catalog(new Set(["ssh.connect"]))).toMatchObject({ status: "unauthorized", capabilities: [{ name: "ssh.hosts.list", allowed: false }] });
    expect(catalog(new Set())?.component).toBeUndefined();
    registry.setEnabledPlugins([]);
    expect(catalog(authorized)?.status).toBe("disabled");
    expect(catalog(authorized)?.component).toBeUndefined();
    expect(registry.getSnapshot().homeWidgets).toEqual([]);
    registry.setEnabledPlugins(["ssh"]);
    expect(catalog(authorized)?.definition).toBe(sshHostsWidget);
    expect(catalog(authorized)?.component).toBe(SshHomeWidget);
  });

  test("kernel 单独声明；可选动作的撤权不隐藏已授权读取的卡片", () => {
    const definition = defineHomeWidget({
      ...sshHostsWidget,
      owner: "kernel",
      id: "sample",
      maxInstances: 1,
      configSchema: sshHostsWidgetConfigSchema,
      capabilities: [
        { name: "sample.list", required: true },
        { name: "sample.update", required: false },
      ],
    });
    const registry = new ContributionRegistry();
    const component = () => null;
    registry.register({
      homeWidgetSource: { id: "kernel", origin: "kernel", contributes: { homeWidgets: ["sample"] } },
      homeWidgets: [defineHomeWidgetContribution(definition, 0, component)],
    });
    registry.setEnabledPlugins([]);
    const [entry] = registry.getHomeWidgetCatalog(new Set(["sample.list"]));
    expect(entry).toMatchObject({ widgetType: "widget:kernel:sample", status: "available", component, capabilities: [{ allowed: true }, { allowed: false }] });
  });
});
