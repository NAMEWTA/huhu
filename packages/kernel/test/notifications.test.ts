import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SettingsSchema, mergeSettings } from "@huhu/contracts";
import { afterEach, describe, expect, test } from "vitest";
import { CapabilityRegistry, Dispatcher, GatewayAudit, IdempotencyStore, NotificationStore, registerNotificationAndSettings } from "../src/index.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), "huhu-n-")); dirs.push(d); return d; };

describe("NotificationStore", () => {
  test("创建/未读过滤/标记已读/删除/清除已读；重启后状态保持", () => {
    const f = path.join(tmp(), "n.ndjson");
    const created: string[] = [];
    const s = new NotificationStore(f, () => new Date("2026-11-11T00:00:00Z"), (n) => created.push(n.id));
    const a = s.create({ title: "A", module: "tasks" }); const b = s.create({ title: "B", module: "automations" });
    expect(created).toEqual([a.id, b.id]);
    expect(s.list().map((n) => n.title)).toEqual(["B", "A"]);
    expect(s.markRead([a.id])).toBe(1);
    expect(s.list({ unreadOnly: true }).map((n) => n.title)).toEqual(["B"]);
    expect(s.list({ module: "tasks" })).toHaveLength(1);
    const reopened = new NotificationStore(f);
    expect(reopened.list().map((n) => [n.title, n.read])).toEqual([["B", false], ["A", true]]);
    expect(reopened.clearRead()).toBe(1);
    expect(reopened.delete([b.id])).toBe(1);
    expect(new NotificationStore(f).list()).toEqual([]);
  });
  test("只保留最近 1000 条；半行损坏被忽略", () => {
    const f = path.join(tmp(), "n.ndjson");
    const s = new NotificationStore(f);
    for (let i = 0; i < 1010; i++) s.create({ title: `n${i}`, module: "x" });
    expect(s.list()).toHaveLength(1000);
    expect(s.list()[0]?.title).toBe("n1009");
    writeFileSync(f, readFileSync(f, "utf8") + '{"id":"half');
    expect(new NotificationStore(f).list()).toHaveLength(1000);
  });
});

describe("设置", () => {
  test("缺省补全；非法值回退默认；深度合并只改补丁里的键", () => {
    const d = SettingsSchema.parse({});
    expect(d.appearance).toMatchObject({ theme: "pearl", mode: "system", fontSize: 14 });
    expect(SettingsSchema.parse({ appearance: { fontSize: 99, theme: "nope" } }).appearance).toMatchObject({ fontSize: 14, theme: "pearl" });
    const next = mergeSettings(d, { appearance: { theme: "soft" }, editor: { autosave: false } });
    expect(next.appearance).toMatchObject({ theme: "soft", fontSize: 14 });
    expect(next.editor.autosave).toBe(false);
    expect(next.dateTime.weekStartsOn).toBe(1);
    expect(mergeSettings(d, { dateTime: { zone: "Mars/Base" } }).dateTime.zone).toBe(d.dateTime.zone);
  });
  test("settings.get/update 能力：持久化到文件；通知能力不对外开放", async () => {
    const dir = tmp();
    const file = path.join(dir, "settings.json");
    const registry = new CapabilityRegistry();
    registerNotificationAndSettings(registry, new NotificationStore(path.join(dir, "n.ndjson")), file);
    const d = new Dispatcher({ registry, audit: new GatewayAudit(), idempotency: new IdempotencyStore(), isPluginEnabled: () => true, exposureOverride: () => undefined, grantedPermissions: () => [] });
    const r = await d.call("desktop", { capability: "settings.update", input: { patch: { appearance: { theme: "suliworld", mode: "dark" } } }, requestId: "r", idempotencyKey: "key-settings-1" });
    expect(r.ok).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8")).appearance).toMatchObject({ theme: "suliworld", mode: "dark" });
    expect(existsSync(file)).toBe(true);
    const got = await d.call("desktop", { capability: "settings.get", input: {}, requestId: "r" });
    expect(got.ok && (got.data as { appearance: { mode: string } }).appearance.mode).toBe("dark");
    const ext = await d.call("cli", { capability: "notifications.list", input: {}, requestId: "r" });
    expect(!ext.ok && ext.error.code).toBe("CAPABILITY_NOT_EXPOSED");
  });
});

describe("设置范围（规格 modules/system.md §3）", () => {
  test("编辑器字号 14–20、行高 1.4–2.0：越界回退默认；范围内保留", async () => {
    const { SettingsSchema } = await import("@huhu/contracts");
    expect(SettingsSchema.parse({ editor: { fontSize: 12, lineHeight: 2.4 } }).editor).toMatchObject({ fontSize: 16, lineHeight: 1.8 });
    expect(SettingsSchema.parse({ editor: { fontSize: 20, lineHeight: 1.4 } }).editor).toMatchObject({ fontSize: 20, lineHeight: 1.4 });
  });
  test("readSettingsFile：缺失或损坏的文件按默认值", async () => {
    const { readSettingsFile } = await import("../src/capabilities/system.js");
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "huhu-set-"));
    expect(readSettingsFile(join(dir, "none.json")).dateTime.weekStartsOn).toBe(1);
    writeFileSync(join(dir, "bad.json"), "{坏的");
    expect(readSettingsFile(join(dir, "bad.json")).editor.fontSize).toBe(16);
    writeFileSync(join(dir, "z.json"), JSON.stringify({ dateTime: { zone: "America/New_York" } }));
    expect(readSettingsFile(join(dir, "z.json")).dateTime.zone).toBe("America/New_York");
  });
  test("settings.json 损坏时 settings.update 先留下副本再覆盖", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "huhu-set-"));
    const file = path.join(dir, "settings.json");
    writeFileSync(file, "{损坏的内容");
    const registry = new CapabilityRegistry();
    registerNotificationAndSettings(registry, new NotificationStore(path.join(dir, "n.ndjson")), file);
    const d = new Dispatcher({ registry, audit: new GatewayAudit(), idempotency: new IdempotencyStore(), isPluginEnabled: () => true, exposureOverride: () => undefined, grantedPermissions: () => [] });
    const r = await d.call("desktop", { capability: "settings.update", input: { patch: { editor: { autosave: false } } }, requestId: "r", idempotencyKey: "key-corrupt-1" });
    expect(r.ok).toBe(true);
    const copies = (await import("node:fs")).readdirSync(dir).filter((f) => f.startsWith("settings.json.corrupt-"));
    expect(copies).toHaveLength(1);
    expect(readFileSync(path.join(dir, copies[0] as string), "utf8")).toBe("{损坏的内容");
  });
});
