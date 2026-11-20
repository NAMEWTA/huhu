import { PluginManifestSchema } from "@huhu/contracts";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { CapabilityRegistry, EventBus, PluginManager, createHuhuContext, defineCapability, type PluginEntry } from "../src/index.js";

function manifest(id: string, dependsOn: string[] = []) {
  return PluginManifestSchema.parse({ id, title: id, description: "", version: "1.0.0", origin: "builtin", dependsOn });
}
function setup() {
  const registry = new CapabilityRegistry();
  const events = new EventBus(() => "vault-test");
  const seen: unknown[] = [];
  events.subscribe((e) => seen.push([e.type, e.payload]));
  const { root, facade } = createHuhuContext({ registry, events, vault: undefined as never, call: async () => null });
  const pm = new PluginManager(root, facade, events);
  return { registry, events, pm, seen, root };
}
const cap = (name: string, plugin: string) => defineCapability({ name, plugin, scope: "read", input: z.object({}), output: z.unknown(), exposable: true, defaultExposed: true, handler: () => 1 });

describe("PluginManager", () => {
  test("启用/停用：能力、事件监听、定时器随作用域释放", async () => {
    const { registry, pm, root } = setup();
    let ticks = 0;
    let listenerCalls = 0;
    const a: PluginEntry = {
      manifest: manifest("a"),
      apply: (ctx, api) => {
        api.defineCapability(cap("a.ping", "a"));
        ctx.on(
          "internal/ping" as never,
          (() => {
            listenerCalls++;
          }) as never,
        );
        ctx.effect(() => {
          const t = setInterval(() => ticks++, 5);
          return () => clearInterval(t);
        });
      },
    };
    pm.register(a);
    expect(await pm.enable("a")).toBe("active");
    expect(registry.get("a.ping")).toBeDefined();
    root.emit("internal/ping" as never);
    expect(listenerCalls).toBe(1);
    await new Promise((r) => setTimeout(r, 25));
    expect(ticks).toBeGreaterThan(0);

    expect(await pm.disable("a")).toEqual(["a"]);
    expect(registry.get("a.ping")).toBeUndefined();
    root.emit("internal/ping" as never);
    expect(listenerCalls).toBe(1);
    const t = ticks;
    await new Promise((r) => setTimeout(r, 25));
    expect(ticks).toBe(t);
    expect(pm.isEnabled("a")).toBe(false);
  });

  test("apply 抛错 → failed，已注册内容回滚", async () => {
    const { registry, pm, seen } = setup();
    pm.register({
      manifest: manifest("bad"),
      apply: (_ctx, api) => {
        api.defineCapability(cap("bad.x", "bad"));
        throw new Error("boom");
      },
    });
    expect(await pm.enable("bad")).toBe("failed");
    expect(pm.error("bad")).toBe("boom");
    expect(registry.get("bad.x")).toBeUndefined();
    expect(seen).toContainEqual(["plugin.stateChanged", { id: "bad", state: "failed", error: "boom" }]);
  });

  test("两个插件互相依赖地启停；停用被依赖者会一并停用依赖它的插件", async () => {
    const { registry, pm } = setup();
    pm.register({ manifest: manifest("base"), apply: (_c, api) => api.defineCapability(cap("base.x", "base")) });
    pm.register({ manifest: manifest("top", ["base"]), apply: (_c, api) => api.defineCapability(cap("top.x", "top")) });
    expect(await pm.enable("top")).toBe("active");
    expect(pm.state("base")).toBe("active");
    expect(await pm.disable("base")).toEqual(["top", "base"]);
    expect(registry.list()).toHaveLength(0);
    expect(await pm.enable("top")).toBe("active");
  });

  test("依赖缺失或依赖失败 → 不启用并说明", async () => {
    const { pm } = setup();
    pm.register({ manifest: manifest("orphan", ["ghost"]), apply: () => undefined });
    expect(await pm.enable("orphan")).toBe("failed");
    expect(pm.error("orphan")).toContain("ghost");
    pm.register({
      manifest: manifest("dead"),
      apply: () => {
        throw new Error("x");
      },
    });
    pm.register({ manifest: manifest("child", ["dead"]), apply: () => undefined });
    expect(await pm.enable("child")).toBe("failed");
    expect(pm.error("child")).toContain("dead");
  });

  test("循环依赖在注册时被拒绝", () => {
    const { pm } = setup();
    pm.register({ manifest: manifest("p", ["q"]), apply: () => undefined });
    expect(() => pm.register({ manifest: manifest("q", ["p"]), apply: () => undefined })).toThrow(/成环/);
  });

  test("插件不能注册属于其他插件的能力", async () => {
    const { pm } = setup();
    pm.register({ manifest: manifest("evil"), apply: (_c, api) => api.defineCapability(cap("notes.read", "notes")) });
    expect(await pm.enable("evil")).toBe("failed");
  });

  test("disposeAll 逆序释放", async () => {
    const { pm } = setup();
    const order: string[] = [];
    for (const id of ["one", "two"])
      pm.register({
        manifest: manifest(id),
        apply: (ctx) => {
          ctx.effect(() => () => {
            order.push(id);
          });
        },
      });
    await pm.enableAll();
    await pm.disposeAll();
    expect(order).toEqual(["two", "one"]);
  });

  test("api.events 订阅随作用域释放", async () => {
    const { pm, events } = setup();
    let hits = 0;
    pm.register({
      manifest: manifest("sub"),
      apply: (_c, api) => {
        api.events.subscribe(() => {
          hits++;
        });
      },
    });
    await pm.enable("sub");
    events.publish("engine.closing", {});
    const before = hits;
    expect(before).toBeGreaterThan(0);
    await pm.disable("sub");
    events.publish("engine.closing", {});
    expect(hits).toBe(before);
  });

  test("并发 enable 只执行一次 apply", async () => {
    const { pm } = setup();
    let applied = 0;
    pm.register({
      manifest: manifest("once"),
      apply: async (_c, api) => {
        applied++;
        await new Promise((r) => setTimeout(r, 20));
        api.defineCapability(cap("once.x", "once"));
      },
    });
    const [a, b] = await Promise.all([pm.enable("once"), pm.enable("once")]);
    expect([a, b]).toEqual(["active", "active"]);
    expect(applied).toBe(1);
  });

  test("事件 id 全局唯一（插件门面与根总线共用计数）", async () => {
    const { pm, events } = setup();
    const ids: string[] = [];
    events.subscribe((e) => ids.push(e.id));
    pm.register({
      manifest: manifest("p1"),
      apply: (_c, api) => {
        api.events.publish("engine.closing", {});
      },
    });
    pm.register({
      manifest: manifest("p2"),
      apply: (_c, api) => {
        api.events.publish("engine.closing", {});
      },
    });
    await pm.enableAll();
    events.publish("engine.closing", {});
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("启用进行中时停用：最终为 disabled", async () => {
    const { pm } = setup();
    pm.register({
      manifest: manifest("slow"),
      apply: async () => {
        await new Promise((r) => setTimeout(r, 30));
      },
    });
    const en = pm.enable("slow");
    const dis = pm.disable("slow");
    await Promise.all([en, dis]);
    expect(pm.state("slow")).toBe("disabled");
  });

  test("卸载等待并发停用完成，且阻止重新启用", async () => {
    const { registry, pm } = setup();
    pm.onRegister = (m) => registry.declare(m.id, m.contributes.capabilities);
    pm.onUnregister = (id) => registry.forgetPlugin(id);
    let enter!: () => void;
    let finish!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const release = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const name = "slow.ping";
    const entry: PluginEntry = {
      manifest: PluginManifestSchema.parse({ ...manifest("slow"), contributes: { capabilities: [name] } }),
      apply: (ctx, api) => {
        api.defineCapability(cap(name, "slow"));
        ctx.effect(() => async () => {
          enter();
          await release;
        });
      },
    };
    pm.register(entry);
    expect(await pm.enable("slow")).toBe("active");
    const disable = pm.disable("slow");
    await entered;
    const uninstall = pm.unregister("slow");
    const retry = pm.unregister("slow");
    try {
      expect(await pm.enable("slow")).toBe("disabled");
      expect(pm.has("slow")).toBe(true);
      expect(registry.knownPlugin(name)).toBe("slow");
    } finally {
      finish();
      await Promise.all([disable, uninstall, retry]);
    }
    expect(pm.has("slow")).toBe(false);
    expect(registry.knownPlugin(name)).toBeUndefined();
    expect(registry.get(name)).toBeUndefined();
    pm.register(entry);
    expect(await pm.enable("slow")).toBe("active");
    await pm.unregister("slow");
  });

  test("失败安装的作用域释放期间，另一插件不能取得 canonical 或 MCP 名", async () => {
    const { registry, pm } = setup();
    pm.onRegister = (m, installing) => registry.declare(m.id, m.contributes.capabilities, installing);
    pm.onInstallConfirmed = (id) => registry.confirmPluginInstall(id);
    pm.onUnregister = (id) => registry.forgetPlugin(id);
    let enter!: () => void;
    let finish!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const release = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const name = "fixture.concurrent.read";
    const entry = (id: string, capability: string): PluginEntry => ({
      manifest: PluginManifestSchema.parse({ ...manifest(id), origin: "external", contributes: { capabilities: [capability] } }),
      apply: () => undefined,
    });
    const rollback = pm
      .activateInstall({
        ...entry("failed", name),
        apply: (ctx, api) => {
          api.defineCapability(cap(name, "failed"));
          ctx.effect(() => async () => {
            enter();
            await release;
          });
          throw new Error("fixture activation failed");
        },
      })
      .then(async (state) => {
        expect(state).toBe("failed");
        await pm.unregister("failed");
      });
    const challenger = entry("challenger", name);
    try {
      await Promise.race([entered, rollback]);
      expect(registry.knownPlugin(name)).toBe("failed");
      await expect(pm.activateInstall(challenger)).rejects.toMatchObject({ code: "NAME_CONFLICT" });
      await expect(pm.activateInstall(entry("alias", "fixture.concurrent_read"))).rejects.toMatchObject({ code: "NAME_CONFLICT" });
    } finally {
      finish();
      await rollback;
    }
    expect(registry.get(name)).toBeUndefined();
    expect(registry.knownPlugin(name)).toBeUndefined();
    expect(await pm.activateInstall(challenger)).toBe("active");
    await pm.unregister("challenger");
  });

  test("provide/service：服务随提供者作用域注册与注销", async () => {
    const { pm } = setup();
    let seen: unknown;
    pm.register({ manifest: manifest("prov"), apply: (_c, api) => api.provide("svc", { hello: 1 }) });
    pm.register({
      manifest: manifest("cons", ["prov"]),
      apply: (_c, api) => {
        seen = api.service("svc");
      },
    });
    await pm.enable("cons");
    expect(seen).toEqual({ hello: 1 });
    await pm.disable("prov");
    let after: unknown = "unset";
    pm.register({
      manifest: manifest("late"),
      apply: (_c, api) => {
        after = api.service("svc");
      },
    });
    await pm.enable("late");
    expect(after).toBeUndefined();
  });
});
