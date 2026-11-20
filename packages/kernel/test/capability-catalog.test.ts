import { z } from "zod";
import { expect, test } from "vitest";
import { bindCapability, CapabilityRegistry, defineCapability, defineCapabilityDescriptor } from "../src/capabilities/define.js";

const descriptor = defineCapabilityDescriptor({
  name: "notes.read",
  plugin: "notes",
  title: "读取笔记",
  description: "按路径读取笔记。",
  scope: "read",
  risk: "normal",
  input: z.object({ path: z.string() }),
  output: z.string(),
  exposable: true,
  defaultExposed: true,
});

test("重复或归属冲突的静态描述被拒绝，整批保持原状", () => {
  const registry = new CapabilityRegistry();
  expect(() => registry.declareDescriptors("notes", [descriptor, descriptor])).toThrow("能力描述重复登记");
  expect(registry.knownNames()).toEqual([]);
  expect(() => registry.declareDescriptors("ssh", [descriptor])).toThrow("能力归属不符");

  registry.declare("notes", [descriptor.name]);
  registry.declareDescriptors("notes", [descriptor]);
  registry.declare("notes", [descriptor.name]);
  expect(registry.getDescriptor(descriptor.name)).toBe(descriptor);
  expect(() => registry.declareDescriptors("notes", [descriptor])).toThrow("能力描述重复登记");
  expect(() => registry.declareDescriptors("ssh", [{ ...descriptor, plugin: "ssh" }])).toThrow("能力归属不符");
  expect(registry.getDescriptor(descriptor.name)).toBe(descriptor);
});

test("登记的静态描述只接受同源 handler，卸载 handler 后可重新绑定", () => {
  const registry = new CapabilityRegistry();
  const bound = bindCapability(descriptor, (_c, i) => i.path);
  expect(() => registry.register(bound)).toThrow("与已登记的描述不匹配");
  registry.declareDescriptors("notes", [descriptor]);

  const mismatched = defineCapabilityDescriptor({ ...descriptor, input: z.object({ path: z.string().min(3) }) });
  expect(() => registry.register(bindCapability(mismatched, (_c, i) => i.path))).toThrow("与已登记的描述不匹配");
  expect(() => registry.register(defineCapability({ ...descriptor, handler: (_c, i) => i.path }))).toThrow("与已登记的描述不匹配");

  const unbind = registry.register(bound);
  expect(registry.get(descriptor.name)).toBe(bound);
  expect(() => registry.register(bound)).toThrow("能力重复注册");
  unbind();
  expect(registry.get(descriptor.name)).toBeUndefined();
  expect(registry.getDescriptor(descriptor.name)).toBe(descriptor);
  const next = bindCapability(descriptor, (_c, i) => i.path);
  registry.register(next);
  unbind();
  expect(registry.get(descriptor.name)).toBe(next);
});
