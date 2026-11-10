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
const cap = (name: string, plugin: string) =>
  defineCapability({ name, plugin, scope: "read", input: z.object({}), output: z.unknown(), exposable: true, defaultExposed: true, handler: () => 1 });

describe("PluginManager", () => {
  test("启用/停用：能力、事件监听、定时器随作用域释放", async () => {
    const { registry, pm, root } = setup();
    let ticks = 0;
    let listenerCalls = 0;
    const a: PluginEntry = {
      manifest: manifest("a"),
      apply: (ctx, api) => {
        api.defineCapability(cap("a.ping", "a"));
        ctx.on("internal/ping" as never, (() => { listenerCalls++; }) as never);
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
    pm.register({ manifest: manifest("dead"), apply: () => { throw new Error("x"); } });
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
    for (const id of ["one", "two"]) pm.register({ manifest: manifest(id), apply: (ctx) => { ctx.effect(() => () => { order.push(id); }); } });
    await pm.enableAll();
    await pm.disposeAll();
    expect(order).toEqual(["two", "one"]);
  });

  test("api.events 订阅随作用域释放", async () => {
    const { pm, events } = setup();
    let hits = 0;
    pm.register({ manifest: manifest("sub"), apply: (_c, api) => { api.events.subscribe(() => { hits++; }); } });
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
    pm.register({ manifest: manifest("once"), apply: async (_c, api) => { applied++; await new Promise((r) => setTimeout(r, 20)); api.defineCapability(cap("once.x", "once")); } });
    const [a, b] = await Promise.all([pm.enable("once"), pm.enable("once")]);
    expect([a, b]).toEqual(["active", "active"]);
    expect(applied).toBe(1);
  });
});
