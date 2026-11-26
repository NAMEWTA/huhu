import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Caller, HuhuEvent } from "@huhu/contracts";
import { CapabilityRegistry, Dispatcher, EventBus, GatewayAudit, IdempotencyStore } from "@huhu/kernel";
import { expect, test, vi, type TestContext } from "vitest";
import { shortcutPasteError } from "../../../packages/ui/src/components/terminal-paste.js";
import { Vault } from "../../../packages/vault/src/index.js";
import { registerShortcuts, sshShortcutDescriptors, SshShortcuts } from "../src/engine/shortcuts.js";
import { hasShortcutControl, MAX_SHORTCUT_LIBRARY_BYTES, MAX_SHORTCUT_TEXT, Shortcut, type ShortcutLibrary, shortcutNames } from "../src/shared/shortcuts.js";
import { broadcastTerminalKey, currentBroadcastTargets } from "../src/ui/terminal-broadcast.js";

const fixtureBody = "第一行 🙂\r\n\t第二行 e\u0301";
const first: Shortcut = { id: "first", name: "合成甲", group: "测试组", text: fixtureBody };
const second: Shortcut = { id: "second", name: "合成乙", group: "测试组", text: "无副作用的文本" };
const file = ".huhu/ssh/shortcuts.json";

test("keyboard broadcast follows only the selected and still-controlled shell bindings", () => {
  const terminal = (id: string) => ({ id, label: id, sessionId: `${id}-shell`, send: Object.assign(() => "sent" as const, { sendKeys: vi.fn() }) });
  const left = terminal("left");
  const right = terminal("right");
  const other = terminal("other");
  const selected = [left, right];
  const visible = [left, right, other];
  const live = currentBroadcastTargets(selected, visible);
  broadcastTerminalKey(live, other.id, "unselected");
  broadcastTerminalKey(live, left.id, "\u001b[D");
  expect(right.send.sendKeys).toHaveBeenCalledExactlyOnceWith("\u001b[D");
  expect(left.send.sendKeys).not.toHaveBeenCalled();
  expect(other.send.sendKeys).not.toHaveBeenCalled();
  for (const changed of [[], [left], [left, { ...right, send: undefined }], [left, terminal("right")], [left, { ...right, sessionId: "new-shell" }]]) {
    expect(currentBroadcastTargets(selected, changed)).toEqual([]);
  }
});

async function setup(context: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "huhu-ssh-shortcuts-"));
  const vaults: Vault[] = [];
  context.onTestFinished(async () => {
    try {
      await Promise.all(vaults.map((vault) => vault.close()));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  async function open(name: string, create: boolean) {
    const directory = path.join(root, name);
    if (create) await mkdir(directory);
    const vault = await Vault.open(directory, { create });
    vaults.push(vault);
    return vault;
  }
  async function close(vault: Vault) {
    await vault.close();
    vaults.splice(vaults.indexOf(vault), 1);
  }
  return { open, close };
}

test("loads an empty isolated Vault, preserves Unicode and order, and reopens version 1", async (context) => {
  const { open, close } = await setup(context);
  const vault = await open("primary", true);
  const store = new SshShortcuts(vault.files);
  const signal = context.signal;
  expect(store.list()).toEqual({ revision: null, shortcuts: [] });
  const storedPath = vault.files.abs(file);
  await mkdir(path.dirname(storedPath), { recursive: true });
  await writeFile(storedPath, JSON.stringify({ version: 1, shortcuts: [{ id: "old", name: "已有正文", text: "保留\n原文" }] }));
  const legacy = store.list();
  expect(legacy.shortcuts).toEqual([{ id: "old", name: "已有正文", text: "保留\n原文" }]);
  const replacement = await store.save({ expectedRevision: legacy.revision, shortcuts: [second, first, ...legacy.shortcuts] }, signal);
  expect(replacement.revision).not.toBe(legacy.revision);
  expect(JSON.parse(await readFile(vault.files.abs(file), "utf8"))).toEqual({ version: 1, shortcuts: [second, first, ...legacy.shortcuts] });
  await close(vault);
  expect(new SshShortcuts((await open("primary", false)).files).list()).toEqual(replacement);
  expect(new SshShortcuts((await open("other", true)).files).list()).toEqual({ revision: null, shortcuts: [] });
});

test("handles competing creation, replacement, and deletion without overwriting the winner", async (context) => {
  const { open } = await setup(context);
  const vault = await open("primary", true);
  const stores = [new SshShortcuts(vault.files), new SshShortcuts(vault.files)];
  let revision: string | null = null;
  let last: ShortcutLibrary | undefined;
  for (const shortcuts of [[first], [first, second]]) {
    const outcomes = await Promise.allSettled(stores.map((store, index) => store.save({ expectedRevision: revision, shortcuts: index === 0 ? shortcuts : [...shortcuts, { ...second, id: "extra" }] }, context.signal)));
    const saved = outcomes.find((outcome) => outcome.status === "fulfilled")?.value;
    expect(saved).toBeDefined();
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({ reason: { code: "VERSION_CONFLICT", details: { currentVersion: saved?.revision } } });
    expect(stores[0]!.list()).toEqual(saved);
    last = saved;
    revision = saved!.revision;
  }
  await rm(vault.files.abs(file));
  await expect(stores[0]!.save({ expectedRevision: last!.revision, shortcuts: [first] }, context.signal)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(stores[0]!.list().revision).toBeNull();
});

test("rejects oversized, malformed, and cancelled saves while preserving the stored revision", async (context) => {
  const { open } = await setup(context);
  const vault = await open("primary", true);
  const store = new SshShortcuts(vault.files);
  const saved = await store.save({ expectedRevision: null, shortcuts: [first] }, context.signal);
  const attempt = (shortcuts: Shortcut[]) => store.save({ expectedRevision: saved.revision, shortcuts }, context.signal);
  const oversized = Array.from({ length: 18 }, (_, index) => ({ ...first, id: String(index), text: "🙂".repeat(MAX_SHORTCUT_TEXT / 2) }));
  for (const shortcuts of [[first, first], [{ ...first, text: "a".repeat(MAX_SHORTCUT_TEXT + 1) }], [{ ...first, text: "x\u009b1m" }], oversized]) {
    await expect(attempt(shortcuts)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  }
  const cancelled = new Error("fixture cancelled");
  await expect(store.save({ expectedRevision: saved.revision, shortcuts: [] }, AbortSignal.abort(cancelled))).rejects.toBe(cancelled);
  expect(store.list()).toEqual(saved);
  await writeFile(vault.files.abs(file), JSON.stringify({ version: 2, shortcuts: [] }));
  expect(() => store.list()).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  await writeFile(vault.files.abs(file), "x".repeat(MAX_SHORTCUT_LIBRARY_BYTES + 1));
  expect(() => store.list()).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
});

test("keeps terminal controls and literal whitespace consistent with the existing paste policy", () => {
  for (let point = 0; point <= 255; point++) {
    const text = `literal${String.fromCodePoint(point)}text`;
    expect(hasShortcutControl(text)).toBe(shortcutPasteError(text, false, true) === "control-character");
  }
  expect(Shortcut.parse(first).text).toBe(fixtureBody);
  expect(shortcutPasteError(fixtureBody, false, false)).toBe("bracketed-paste-required");
});

test("dispatches on both workbenches, rechecks external writes, and keeps shortcut bodies out of events and audit", async (context) => {
  const { open } = await setup(context);
  const vault = await open("primary", true);
  const registry = new CapabilityRegistry();
  registry.declareDescriptors("ssh", Object.values(sshShortcutDescriptors));
  const events = new EventBus(() => vault.id);
  const notifications: HuhuEvent[] = [];
  events.subscribe((event) => notifications.push(event));
  const audit = new GatewayAudit();
  const log = vi.fn();
  let choices: Record<string, boolean> = {};
  registerShortcuts({ vault, events, defineCapability: (def) => void registry.register(def) });
  const dispatcher = new Dispatcher({
    registry,
    isPluginEnabled: () => true,
    toolAccess: () => ({ state: "ready", revision: 1, choices, resources: { "ssh.hosts": [] } }),
    grantedPermissions: () => [],
    pluginOrigin: () => "builtin",
    idempotency: new IdempotencyStore(),
    audit,
    log,
  });
  const call = (caller: Caller, capability: string, input: unknown = {}) => dispatcher.call(caller, { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }, context.signal);
  expect(await call("desktop", shortcutNames.list)).toMatchObject({ ok: true, data: { revision: null, shortcuts: [] } });
  const input = { expectedRevision: null, shortcuts: [first] };
  for (const caller of ["cli", "mcp", "http", "plugin:other"] as const) {
    const code = caller === "plugin:other" ? "PERMISSION_DENIED" : "CAPABILITY_NOT_EXPOSED";
    expect(await call(caller, shortcutNames.list)).toMatchObject({ ok: false, error: { code } });
    expect(await call(caller, shortcutNames.save, input)).toMatchObject({ ok: false, error: { code } });
  }
  expect(await call("web:fixture", shortcutNames.save, input)).toMatchObject({ ok: true, data: { shortcuts: [first] } });
  expect(await call("desktop", shortcutNames.list)).toMatchObject({ ok: true, data: { shortcuts: [first] } });
  expect(await call("desktop", shortcutNames.save, input)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  choices = { [shortcutNames.list]: true };
  const listed = await call("cli", shortcutNames.list);
  expect(listed).toMatchObject({ ok: true, data: { shortcuts: [first] } });
  if (!listed.ok) throw new Error("Fixture CLI cannot list the granted shortcut library");
  const replacement = { expectedRevision: (listed.data as ShortcutLibrary).revision, shortcuts: [second, first] };
  expect(await call("mcp", shortcutNames.save, replacement)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  choices[shortcutNames.save] = true;
  const write = vault.files.write.bind(vault.files);
  const beforeCommit = vi.spyOn(vault.files, "write").mockImplementationOnce((...args) => {
    choices[shortcutNames.save] = false;
    return write(...args);
  });
  expect(await call("mcp", shortcutNames.save, replacement)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  beforeCommit.mockRestore();
  choices[shortcutNames.save] = true;
  expect(await call("mcp", shortcutNames.save, replacement)).toMatchObject({ ok: true, data: { shortcuts: [second, first] } });
  choices = {};
  expect(await call("cli", shortcutNames.list)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  expect(await call("desktop", shortcutNames.list)).toMatchObject({ ok: true, data: { shortcuts: [second, first] } });
  expect(notifications.map(({ type, payload }) => ({ type, payload }))).toEqual(Array.from({ length: 2 }, () => ({ type: "entity.changed", payload: { kind: "ssh-shortcuts", id: "library", op: "updated" } })));
  expect(JSON.stringify([notifications, audit.list(), log.mock.calls])).not.toContain("第一行");
});
