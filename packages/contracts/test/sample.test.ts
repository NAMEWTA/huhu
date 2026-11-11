import { describe, expect, test } from "vitest";
import { z } from "zod";
import { CapabilityRequestSchema, EVENT_PAYLOADS, HuhuError, HuhuErrorSchema, PluginManifestSchema, errors, findDependencyCycle, isId, newId, parseId, toJsonSchema, ERROR_CODES } from "../src/index.js";

describe("errors", () => {
  test("HuhuError 往返并通过模式", () => {
    const e = errors.versionConflict("abc");
    expect(HuhuErrorSchema.parse(JSON.parse(JSON.stringify(e)))).toEqual(e.toJSON());
    expect(e.retryable).toBe(false);
  });
  test("可重试码", () => {
    expect(new HuhuError("ENGINE_CLOSING", "x").retryable).toBe(true);
    expect(new HuhuError("NOT_FOUND", "x").retryable).toBe(false);
  });
  test("错误码无重复", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});

describe("ids", () => {
  test("生成与解析", () => {
    const id = newId("task", 1_700_000_000_000);
    expect(isId(id, "task")).toBe(true);
    expect(isId(id, "note")).toBe(false);
    expect(parseId(id)?.prefix).toBe("task");
    expect(parseId("bogus-123")).toBeNull();
  });
  test("不重复", () => {
    const s = new Set(Array.from({ length: 500 }, () => newId("note")));
    expect(s.size).toBeGreaterThan(495);
  });
});

describe("schemas", () => {
  test("请求非法输入", () => {
    expect(CapabilityRequestSchema.safeParse({ capability: "", requestId: "r" }).success).toBe(false);
    expect(CapabilityRequestSchema.safeParse({ capability: "a.b", input: {}, requestId: "r" }).success).toBe(true);
  });
  test("事件模式与 JSON Schema 导出", () => {
    for (const s of Object.values(EVENT_PAYLOADS)) expect(toJsonSchema(s)).toBeTypeOf("object");
    expect(EVENT_PAYLOADS["task.completedChanged"].safeParse({ taskId: "t", completed: "yes" }).success).toBe(false);
    expect(toJsonSchema(z.object({ a: z.string() }))).toMatchObject({ type: "object" });
  });
  test("插件清单与循环依赖", () => {
    const m = PluginManifestSchema.parse({ id: "tasks", title: "任务", description: "", version: "1.0.0", origin: "builtin" });
    expect(m.dependsOn).toEqual([]);
    expect(
      findDependencyCycle([
        { id: "a", dependsOn: ["b"] },
        { id: "b", dependsOn: ["a"] },
      ]),
    ).toEqual(["a", "b", "a"]);
    expect(
      findDependencyCycle([
        { id: "a", dependsOn: ["b"] },
        { id: "b", dependsOn: [] },
      ]),
    ).toBeNull();
  });
});
