import { openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { expect, test } from "vitest";
import { z } from "zod";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { DirectoryView, type DirectoryUpdate } from "../src/engine/directory-schema.js";
import { resolveHostTargets } from "../src/engine/directory-selection.js";

type Operation = z.infer<typeof DirectoryUpdate>["operation"];

async function call(engine: RunningEngine, capability: string, input: unknown = {}, token = engine.rendererToken, session?: string) {
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(session && { "mcp-session-id": session }) },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
  });
  expect(response.status).toBe(200);
  return CapabilityResultSchema.parse(await response.json());
}

async function data(...args: Parameters<typeof call>) {
  const result = await call(...args);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.data;
}

async function directory(engine: RunningEngine, input: Record<string, unknown> = {}) {
  return DirectoryView.parse(await data(engine, "ssh.hosts.directory", input));
}

const hostIds = (view: z.infer<typeof DirectoryView>) => view.hosts.map((host) => host.hostId);

async function saveHost(engine: RunningEngine, properties: Record<string, unknown>) {
  return z.object({ hostId: z.string() }).parse(await data(engine, "ssh.hosts.configure", { authKind: "agent", expectedRevision: null, ...properties })).hostId;
}

test("通过 Engine HTTP 按真实主机 ID 搜索、整理和重开同一个 Vault", async () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "huhu-ssh-directory-"));
  const root = path.join(fixtureRoot, "vault");
  const desktopUserData = path.join(fixtureRoot, "desktop");
  mkdirSync(root);
  mkdirSync(desktopUserData);
  let engine: RunningEngine | undefined;
  try {
    const live = await boot({ vaultPath: root, desktopUserData, create: true });
    engine = live;
    const alice = "legacy-mirror";
    const oldDirectory = path.join(root, ".huhu", "ssh", "hosts");
    mkdirSync(oldDirectory, { recursive: true });
    const oldProfile = path.join(oldDirectory, `${alice}.json`);
    writeFileSync(
      oldProfile,
      JSON.stringify({
        id: alice,
        name: "Mirror",
        user: "alice",
        host: "mirror.invalid",
        tags: ["Blue"],
        auth: { kind: "key", secretRef: "safe://synthetic-key-ref", passphraseRef: "safe://synthetic-passphrase-ref" },
      }),
    );
    const bob = await saveHost(live, { name: "Mirror", user: "bob", host: "mirror.invalid", tags: ["Green"] });
    const alpha = await saveHost(live, { name: "Alpha", user: "preview", host: "2001:db8::10" });
    const zulu = await saveHost(live, { name: "Zulu", user: "relay", host: "relay.invalid", port: 2222 });
    const legacy = await data(live, "ssh.hosts.list");
    const savedProfile = readFileSync(oldProfile);
    const owners = z.array(z.object({ id: z.string(), revision: z.string().optional() })).parse(legacy);

    const importSource = { format: "openssh", filename: "config", contentBase64: Buffer.from("Host Mirror candidate\n User alice\n HostName mirror.invalid").toString("base64") };
    const preview = await data(live, "ssh.hosts.import.preview", importSource);
    expect(preview).toMatchObject({ rows: [{ state: "conflict", conflicts: expect.arrayContaining([{ kind: "existing", hostId: alice, field: "endpoint" }]) }, { state: "conflict" }] });
    expect(JSON.stringify(preview)).not.toMatch(/synthetic-key-ref|safe:\/\//);
    expect(await call(live, "ssh.hosts.import.preview", importSource, live.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect(await data(live, "ssh.hosts.list")).toEqual(legacy);
    expect(readFileSync(oldProfile)).toEqual(savedProfile);

    let current = await directory(live);
    expect(current).toMatchObject({ version: "0", sort: "name-asc", groups: [] });
    expect(hostIds(current)).toEqual([alpha, alice, bob, zulu]);
    for (const [query, expected] of [
      [" MiRRoR ", [alice, bob]],
      ["BoB", [bob]],
      ["BLUE", [alice]],
      ["mirror.invalid:22", [alice, bob]],
      ["bob@mirror.invalid:22", [bob]],
      ["relay.invalid:2222", [zulu]],
      ["[2001:db8::10]:22", [alpha]],
      ["Mirror  green", [bob]],
      ["synthetic-key-ref", []],
    ] as const) {
      expect(hostIds(await directory(live, { query }))).toEqual(expected);
    }
    expect(current.hosts.find((host) => host.hostId === alice)).toEqual({
      hostId: alice,
      groupId: null,
      pinned: false,
      name: "Mirror",
      user: "alice",
      host: "mirror.invalid",
      port: 22,
      tags: ["Blue"],
    });
    expect(JSON.stringify(current)).not.toContain("safe://");

    const change = async (operation: Operation) => {
      current = DirectoryView.parse(await data(live, "ssh.hosts.organize", { expectedVersion: current.version, operation }));
      return current;
    };
    const organize = (operation: Operation, expectedVersion = current.version) => call(live, "ssh.hosts.organize", { expectedVersion, operation });
    const groupId = (name: string) => current.groups.find((group) => group.name === name)!.groupId;
    await change({ type: "group.create", name: "Development", parentId: null });
    const dev = groupId("Development");
    await change({ type: "group.create", name: "Build", parentId: dev });
    const build = groupId("Build");
    await change({ type: "group.create", name: "Network", parentId: null });
    const net = groupId("Network");
    await change({ type: "group.create", name: "Empty", parentId: null });
    const empty = groupId("Empty");
    await change({ type: "hosts.move", hostIds: [zulu], groupId: net });
    const picked = resolveHostTargets(hostIds(current), [alice, bob, alice], bob);
    expect(picked).toEqual([alice, bob]);
    expect(resolveHostTargets(hostIds(current), picked, zulu)).toEqual([zulu]);
    expect(resolveHostTargets(hostIds(current), [alice, "removed", bob], "removed")).toEqual([]);
    expect(resolveHostTargets(hostIds(current), [alice, "removed", bob])).toEqual([alice, bob]);

    const beforeRename = current.version;
    await change({ type: "group.rename", groupId: build, name: "Release" });
    expect(groupId("Release")).toBe(build);
    expect(await organize({ type: "hosts.move", hostIds: picked, groupId: build }, beforeRename)).toMatchObject({
      ok: false,
      error: { code: "VERSION_CONFLICT", details: { currentVersion: current.version } },
    });
    expect(await organize({ type: "group.move", groupId: dev, parentId: build })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await organize({ type: "group.move", groupId: build, parentId: build })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await organize({ type: "hosts.move", hostIds: [alice, "missing"], groupId: build })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await directory(live)).toEqual(current);
    await change({ type: "hosts.move", hostIds: picked, groupId: build });
    expect(hostIds(await directory(live, { groupId: dev }))).toEqual(picked);
    expect(hostIds(await directory(live, { groupId: null }))).toEqual([alpha]);
    expect(hostIds(await directory(live, { groupId: build, query: "blue" }))).toEqual([alice]);
    expect(hostIds(await directory(live, { groupId: net }))).toEqual([zulu]);
    await change({ type: "group.move", groupId: build, parentId: net });
    expect(hostIds(await directory(live, { groupId: dev }))).toEqual([]);
    expect(hostIds(await directory(live, { groupId: net }))).toEqual([alice, bob, zulu]);
    expect(await organize({ type: "group.delete", groupId: build })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await organize({ type: "group.delete", groupId: net })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    await change({ type: "group.delete", groupId: empty });

    await change({ type: "hosts.move", hostIds: [alpha], groupId: build });
    await change({ type: "sort.set", sort: "name-desc" });
    expect(hostIds(current)).toEqual([zulu, bob, alice, alpha]);
    await change({ type: "sort.set", sort: "manual" });
    expect(await organize({ type: "hosts.reorder", groupId: build, hostIds: [alice, alpha, zulu] })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    await change({ type: "hosts.reorder", groupId: build, hostIds: [bob, alpha, alice] });
    expect(hostIds(current)).toEqual([bob, alpha, alice, zulu]);
    await change({ type: "hosts.pin", hostIds: [alice], pinned: true });
    expect(hostIds(current)).toEqual([alice, bob, alpha, zulu]);
    expect(current.groups).toEqual([
      { groupId: dev, parentId: null, name: "Development" },
      { groupId: net, parentId: null, name: "Network" },
      { groupId: build, parentId: net, name: "Release" },
    ]);
    expect(await data(live, "ssh.hosts.list")).toEqual(legacy);
    expect(readFileSync(oldProfile)).toEqual(savedProfile);
    const directoryFile = path.join(root, ".huhu", "ssh", "host-directory.json");
    expect(readFileSync(directoryFile, "utf8")).not.toMatch(/auth|safe:\/\/|secretRef|passphraseRef/);
    expect(existsSync(path.join(root, ".huhu", "ssh", "known_hosts"))).toBe(false);
    const vaultId = live.vault.id;
    await live.shutdown();
    engine = await boot({ vaultPath: root, desktopUserData });
    expect(engine.vault.id).toBe(vaultId);
    expect(await directory(engine)).toEqual(current);
    expect(hostIds(await directory(engine, { groupId: build }))).toEqual([alice, bob, alpha]);
    expect(await data(engine, "ssh.hosts.list")).toEqual(legacy);
    expect(await data(engine, "ssh.hosts.remove", { hostId: zulu, expectedRevision: owners.find(({ id }) => id === zulu)!.revision })).toEqual({ ok: true });
    expect(hostIds(await directory(engine))).toEqual([alice, bob, alpha]);
  } finally {
    try {
      await engine?.shutdown();
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }
}, 60_000);

test("首次及后续并发写入只有一个胜者，并沿用静态目录与入口授权", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ssh-version-"));
  let engine: RunningEngine | undefined;
  try {
    const live = await boot({ vaultPath: root, create: true });
    engine = live;
    const catalog = z.array(z.object({ name: z.string(), scope: z.string(), availability: z.string() }));
    const descriptor = { name: "ssh.hosts.organize", scope: "write" };
    expect(catalog.parse(await data(live, "capabilities.list", { includeInactive: true }))).toContainEqual({ ...descriptor, availability: "active" });
    expect(await call(live, "ssh.hosts.directory", {}, live.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect(await call(live, "gateway.mcp.update", { enabled: true, transport: "stdio" })).toMatchObject({ ok: true });
    const session = await openMcpSession(`http://127.0.0.1:${live.port}/api/v1/mcp`, live.mcpToken);
    expect(await call(live, "ssh.hosts.organize", {}, live.mcpToken, session)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });

    async function compete(expectedVersion: string) {
      const results = await Promise.all(
        ["First", "Second"].map((name) =>
          call(live, "ssh.hosts.organize", {
            expectedVersion,
            operation: { type: "group.create", name, parentId: null },
          }),
        ),
      );
      const accepted = results.filter((result) => result.ok);
      expect(accepted).toHaveLength(1);
      const view = DirectoryView.parse(accepted[0]!.data);
      expect(results.filter((result) => !result.ok)).toEqual([
        expect.objectContaining({
          error: expect.objectContaining({ code: "VERSION_CONFLICT", details: { currentVersion: view.version } }),
        }),
      ]);
      expect(await directory(live)).toEqual(view);
      return view;
    }
    const initial = await compete("0");
    const next = await compete(initial.version);
    expect(next.version).not.toBe(initial.version);
    expect(next.groups).toHaveLength(2);
    expect(next.groups).toEqual(expect.arrayContaining(initial.groups));

    await data(live, "plugins.setEnabled", { id: "ssh", enabled: false });
    expect(catalog.parse(await data(live, "capabilities.list", { includeInactive: true }))).toContainEqual({ ...descriptor, availability: "plugin-disabled" });
    expect(await call(live, "ssh.hosts.directory")).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
    await data(live, "plugins.setEnabled", { id: "ssh", enabled: true });
    expect(await directory(live)).toEqual(next);

    const directoryFile = path.join(root, ".huhu", "ssh", "host-directory.json");
    writeFileSync(directoryFile, "{broken");
    expect(await call(live, "ssh.hosts.directory")).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await call(live, "ssh.hosts.organize", { expectedVersion: next.version, operation: { type: "sort.set", sort: "manual" } })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
    expect(readFileSync(directoryFile, "utf8")).toBe("{broken");

    rmSync(directoryFile);
    mkdirSync(directoryFile);
    const marker = path.join(directoryFile, "keep.txt");
    writeFileSync(marker, "保留原数据");
    for (const result of [await call(live, "ssh.hosts.directory"), await call(live, "ssh.hosts.organize", { expectedVersion: "0", operation: { type: "sort.set", sort: "manual" } })]) {
      expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    }
    expect(readFileSync(marker, "utf8")).toBe("保留原数据");
  } finally {
    try {
      await engine?.shutdown();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}, 60_000);

test("导入确认只创建明确选中的主机，分组失败后可按原身份重试", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ssh-import-"));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "desktop");
  mkdirSync(vaultPath);
  mkdirSync(desktopUserData);
  let engine: RunningEngine | undefined;
  try {
    const live = await boot({ vaultPath, desktopUserData, create: true });
    engine = live;
    const existing = await saveHost(live, { name: "Mirror", user: "alice", host: "mirror.invalid" });
    const source = {
      format: "netcatty",
      filename: "hosts.csv",
      contentBase64: Buffer.from(
        [
          "Groups,Label,Hostname/IP,Protocol,Port,Username,Password,Startup command",
          "Workspace/Lab,Ready,ready.invalid,SSH2,2222,fixture,fixture-password,fixture-command",
          "Workspace/Lab,Mirror,renamed.invalid,SSH2,22,fixture,,",
          "Workspace,Endpoint,mirror.invalid,SSH2,22,alice,,",
          "Workspace,Other,other.invalid,SSH2,22,fixture,,",
        ].join("\n"),
      ).toString("base64"),
    };
    const directoryFile = path.join(vaultPath, ".huhu", "ssh", "host-directory.json");
    const preview = async () => z.object({ token: z.string(), rows: z.array(z.object({ index: z.number(), state: z.string() }).passthrough()) }).parse(await data(live, "ssh.hosts.import.preview", source));
    const first = await preview();
    expect(first.rows.map(({ state }) => state)).toEqual(["ready", "conflict", "conflict", "ready"]);
    expect(JSON.stringify(first)).not.toMatch(/fixture-password|fixture-command/);
    expect(hostIds(await directory(live))).toEqual([existing]);
    expect(existsSync(directoryFile)).toBe(false);

    const confirm = (token: string, selected: Array<{ index: number; renameTo?: string }>, original = source) => ({ source: original, token, selected });
    const selected = [{ index: 1 }, { index: 2, renameTo: "Mirror copy" }];
    const write = (input: unknown) => call(live, "ssh.hosts.import.confirm", input);
    expect(await write(confirm(first.token, selected, { ...source, filename: "substituted.csv" }))).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    const concurrent = await saveHost(live, { name: "Concurrent", user: "bob", host: "concurrent.invalid" });
    expect(await write(confirm(first.token, selected))).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    const { token } = await preview();
    for (const bad of [
      [{ index: 1 }, { index: 2 }],
      [{ index: 1 }, { index: 3, renameTo: "Different name" }],
      [{ index: 1 }, { index: 1 }],
    ]) {
      expect(await write(confirm(token, bad))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    }
    expect(hostIds(await directory(live))).toEqual([concurrent, existing]);
    const input = confirm(token, selected);
    expect(await call(live, "ssh.hosts.import.confirm", input, live.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });

    mkdirSync(path.dirname(directoryFile), { recursive: true });
    writeFileSync(directoryFile, "{broken");
    const pending = await write(input);
    expect(pending, JSON.stringify(pending)).toMatchObject({ ok: true, data: { groups: { state: "pending" } } });
    expect(readFileSync(directoryFile, "utf8")).toBe("{broken");
    expect(JSON.stringify(await data(live, "ssh.hosts.list"))).not.toMatch(/fixture-password|fixture-command/);
    rmSync(directoryFile);
    const saved = await write(input);
    expect(saved).toMatchObject({
      ok: true,
      data: {
        imported: [
          { index: 1, hostId: expect.stringMatching(/^host-owned-/), name: "Ready" },
          { index: 2, hostId: expect.stringMatching(/^host-owned-/), name: "Mirror copy" },
        ],
        groups: { state: "saved" },
      },
    });
    if (!pending.ok || !saved.ok) throw new Error("import did not complete");
    expect(saved.data).toMatchObject({ imported: z.object({ imported: z.unknown() }).parse(pending.data).imported });
    const current = await directory(live);
    const workspace = current.groups.find(({ name }) => name === "Workspace")!;
    const lab = current.groups.find(({ name }) => name === "Lab")!;
    expect(lab.parentId).toBe(workspace.groupId);
    expect(current.hosts.map(({ name, groupId }) => [name, groupId])).toEqual([
      ["Concurrent", null],
      ["Mirror", null],
      ["Mirror copy", lab.groupId],
      ["Ready", lab.groupId],
    ]);
    expect(existsSync(path.join(vaultPath, ".huhu", "ssh", "known_hosts"))).toBe(false);
    await live.shutdown();
    engine = await boot({ vaultPath, desktopUserData });
    expect(await directory(engine)).toEqual(current);
    expect(await data(engine, "ssh.hosts.import.confirm", input)).toEqual(saved.data);
    expect(await directory(engine)).toEqual(current);
  } finally {
    try {
      await engine?.shutdown();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}, 60_000);
