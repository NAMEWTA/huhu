import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityCatalogEntrySchema, CapabilityResultSchema } from "@huhu/contracts";
import { expect, test } from "vitest";
import { z } from "zod";
import { boot, type RunningEngine } from "../src/boot.js";

async function call(engine: RunningEngine, capability: string, input: unknown = {}, token = engine.rendererToken) {
  const reply = await fetch("http://127.0.0.1:" + engine.port + "/api/v1/call", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID() }),
  });
  expect(reply.status).toBe(200);
  return CapabilityResultSchema.parse(await reply.json());
}

async function directory(engine: RunningEngine, includeInactive: boolean, token = engine.rendererToken) {
  const result = await call(engine, "capabilities.list", { includeInactive }, token);
  if (!result.ok) throw new Error(result.error.message);
  return z.array(CapabilityCatalogEntrySchema).parse(result.data);
}

async function discoveredNames(engine: RunningEngine) {
  const reply = await fetch("http://127.0.0.1:" + engine.port + "/api/v1/capabilities", { headers: { authorization: "Bearer " + engine.rendererToken } });
  expect(reply.ok).toBe(true);
  return z
    .array(z.object({ name: z.string() }))
    .parse(await reply.json())
    .map((entry) => entry.name);
}

test("静态目录在 SSH 停用、重启和重新启用后保留描述，由同一 Engine 执行活动工具", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-catalog-"));
  const notePath = path.join(dir, "目录样例.md");
  const note = "# 目录样例\n";
  let engine: RunningEngine | undefined;
  try {
    writeFileSync(notePath, note, "utf8");
    engine = await boot({ vaultPath: dir, create: true });
    const active = await directory(engine, true);
    expect(active.find((entry) => entry.name === "notes.read")).toMatchObject({
      plugin: "notes",
      title: "读取笔记",
      scope: "read",
      risk: "normal",
      availability: "active",
      input: { properties: { path: { type: "string" } } },
      output: { properties: { text: { type: "string" }, version: { type: "string" } } },
    });
    const noteInput = { path: "目录样例.md" };
    const fromDesktop = await call(engine, "notes.read", noteInput);
    expect(fromDesktop).toMatchObject({ ok: true, data: { path: noteInput.path, text: note, version: expect.any(String) } });
    expect(await call(engine, "notes.read", noteInput, engine.cliToken)).toEqual(fromDesktop);
    expect(readFileSync(notePath, "utf8")).toBe(note);

    const published = active.filter((entry) => entry.plugin === "ssh");
    expect(published).toHaveLength(21);
    expect(new Set(published.map((entry) => entry.name)).size).toBe(21);
    expect(published.every((entry) => entry.title && entry.description && entry.risk && entry.input && entry.output && entry.availability === "active")).toBe(true);
    expect(published.find((entry) => entry.name === "ssh.hosts.delete")).toMatchObject({
      plugin: "ssh",
      title: "删除 SSH 主机",
      scope: "write",
      risk: "high",
      input: { properties: { id: { type: "string" } }, required: ["id"] },
      output: { properties: { ok: { const: true } } },
    });
    expect(await call(engine, "ssh.hosts.list")).toEqual({ ok: true, data: [] });
    expect(await discoveredNames(engine)).toContain("ssh.hosts.list");
    expect(await call(engine, "ssh.hosts.list", {}, engine.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });

    expect(await call(engine, "plugins.setEnabled", { id: "ssh", enabled: false })).toMatchObject({ ok: true, data: { state: "disabled" } });
    const inactive = published.map((entry) => ({ ...entry, availability: "plugin-disabled" }));
    expect((await directory(engine, true)).filter((entry) => entry.plugin === "ssh")).toEqual(inactive);
    expect((await directory(engine, false)).some((entry) => entry.plugin === "ssh")).toBe(false);
    expect(await discoveredNames(engine)).not.toContain("ssh.hosts.list");
    const cliDirectory = await directory(engine, true, engine.cliToken);
    expect(cliDirectory.find((entry) => entry.name === "ssh.hosts.list")).toEqual({
      name: "ssh.hosts.list",
      plugin: "ssh",
      availability: "plugin-disabled",
      exposed: false,
      exposable: false,
      scope: null,
      input: null,
      output: null,
    });
    expect(await call(engine, "gateway.check", { capability: "ssh.hosts.list" })).toMatchObject({
      ok: true,
      data: { found: true, availability: "plugin-disabled", scope: "read", identities: expect.arrayContaining([expect.objectContaining({ identity: "cli", allowed: false })]) },
    });
    expect(await call(engine, "gateway.check", { capability: "uninstalled.probe" })).toMatchObject({
      ok: true,
      data: { found: false, availability: "not-found", scope: null },
    });
    expect(await call(engine, "ssh.hosts.list")).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
    expect(await call(engine, "uninstalled.probe")).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_FOUND" } });

    await engine.shutdown();
    engine = await boot({ vaultPath: dir });
    expect((await directory(engine, true)).filter((entry) => entry.plugin === "ssh")).toEqual(inactive);
    expect(await call(engine, "ssh.hosts.list")).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
    expect(await call(engine, "notes.read", noteInput)).toEqual(fromDesktop);

    expect(await call(engine, "plugins.setEnabled", { id: "ssh", enabled: true })).toMatchObject({ ok: true, data: { state: "active" } });
    expect((await directory(engine, true)).filter((entry) => entry.plugin === "ssh")).toEqual(published);
    expect(await call(engine, "ssh.hosts.list")).toEqual({ ok: true, data: [] });
  } finally {
    try {
      await engine?.shutdown();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}, 60_000);
