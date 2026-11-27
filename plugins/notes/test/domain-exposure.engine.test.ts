import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { run } from "../../../apps/cli/src/main.js";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { mcpRequest, mcpRpc, openMcpSession, openRecoverableMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { HerdrCore } from "../../agent-cli/src/engine/herdr-core.js";
import { DocumentSession } from "../src/ui/documents/DocumentSession.js";

const work = new Map<string, RunningEngine>();
const GUIDE = ".agents/skills/huhu/SKILL.md";
const BODY = "private synthetic passage for domain receipts";
const DATE = "2026-11-16";
const DAILY = `日记/${DATE} · 每日笔记.md`;
const ARCHIVE = "Archives/Fixture Library/Fixture Record/";
const DELETABLE_TYPE = "Archives/Fixture Removable/";
const IdVersion = z.object({ id: z.string(), version: z.string() });
type Entry = "cli" | "mcp";

afterEach(async () => {
  for (const [root, engine] of work) {
    try {
      await engine.shutdown();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  work.clear();
});

async function fixture(entry: Entry) {
  const root = mkdtempSync(path.join(tmpdir(), `huhu-domain-tools-${entry}-`));
  let engine = await boot({ vaultPath: root, create: true });
  work.set(root, engine);
  const callDesktop = async (capability: string, input: unknown = {}) => {
    const reply = await engine.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
    if (!reply.ok) throw new Error(`${capability}: ${reply.error.code} ${reply.error.message}`);
    return reply.data;
  };
  await callDesktop("gateway.mcp.update", { enabled: true });
  const gateway = z.object({ id: z.string(), token: z.string() }).parse(await callDesktop("gateway.tokens.create", { name: "isolated domain fixture" }));
  const endpoint = () => `http://127.0.0.1:${engine.port}/mcp`;
  let session = entry === "mcp" ? await openRecoverableMcpSession(endpoint(), gateway.token) : undefined;

  const cli = async (args: string[], discard = false) => {
    const output: string[] = [];
    await run([...args, "--vault", root, "--json"], {
      out: (line) => {
        if (!discard) output.push(line);
      },
      err: (line) => {
        throw new Error(line);
      },
    });
    return discard ? undefined : JSON.parse(output.join(""));
  };
  const invoke = async (id: string, input: unknown, intent?: string, discard = false) => {
    if (entry === "cli") {
      const reply = await cli(["call", id, "--input-json", JSON.stringify(input), ...(intent ? ["--intent-key", intent] : [])], discard);
      return discard ? undefined : CapabilityResultSchema.parse(reply);
    }
    const response = await mcpRequest(endpoint(), gateway.token, mcpRpc("tools/call", { name: id.replaceAll(".", "_"), arguments: input, ...(intent && { _meta: { "huhu.dev/intent-key": intent } }) }), session!.handle);
    expect(response.status).toBe(200);
    if (discard) {
      await response.body!.cancel();
      return;
    }
    const { result } = z
      .object({
        result: z.object({
          isError: z.boolean().optional(),
          content: z.array(z.object({ text: z.string() })),
          structuredContent: z.object({ data: z.unknown(), opId: z.string().optional() }).optional(),
        }),
      })
      .parse(await response.json());
    return CapabilityResultSchema.parse(result.isError ? { ok: false, error: JSON.parse(result.content[0]!.text) } : { ok: true, ...result.structuredContent });
  };
  const tools = async () => {
    const list = z.array(z.object({ name: z.string(), _meta: z.record(z.string(), z.unknown()).optional() }));
    if (entry === "cli") return z.object({ data: list }).parse(await cli(["capabilities", "list"])).data;
    const response = await mcpRequest(endpoint(), gateway.token, mcpRpc("tools/list"), session!.handle);
    return z.object({ result: z.object({ tools: list }) }).parse(await response.json()).result.tools;
  };
  const operation = async (operationId: string) => {
    if (entry === "cli") return CapabilityResultSchema.parse(await cli(["operation", operationId]));
    const response = await mcpRequest(endpoint(), gateway.token, mcpRpc("resources/read", { uri: `huhu://operations/${operationId}` }), session!.handle);
    const { result } = z.object({ result: z.object({ contents: z.array(z.object({ text: z.string() })) }) }).parse(await response.json());
    return CapabilityResultSchema.parse(JSON.parse(result.contents[0]!.text));
  };
  const restart = async () => {
    await engine.shutdown();
    engine = await boot({ vaultPath: root });
    work.set(root, engine);
    if (session) {
      expect((await mcpRequest(endpoint(), gateway.token, mcpRpc("tools/list"), session.handle)).status).toBe(404);
      session = await openRecoverableMcpSession(endpoint(), gateway.token, session.recovery);
    }
  };
  const put = (rel: string, bytes: string | Buffer) => {
    const target = path.join(root, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    engine.index.refreshPaths([rel]);
  };
  const version = (rel: string) => engine.vault.files.currentVersion(rel);
  const get = (rel: string) => readFileSync(path.join(root, rel), "utf8");
  const exists = (rel: string) => existsSync(path.join(root, rel));
  const policy = z.object({ revision: z.number(), choices: z.record(z.string(), z.boolean()) });
  const currentPolicy = async () => z.object({ toolAccess: policy }).parse(await callDesktop("gateway.get")).toolAccess;
  const choose = async (id: string, exposed: boolean) => {
    const before = await currentPolicy();
    expect(await callDesktop("gateway.update", { capability: id, exposed })).toMatchObject({ revision: before.revision + 1, exposed });
  };

  return { root, engine: () => engine, entry, gateway, endpoint, callDesktop, invoke, tools, operation, restart, put, version, get, exists, currentPolicy, choose };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

function businessState(root: string): Record<string, string> {
  const state: Record<string, string> = {};
  const excluded = new Set([".huhu/runtime", ".huhu/gateway", ".huhu/writer.lock", ".huhu/cache", ".huhu/history"]);
  function visit(dir: string) {
    for (const child of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${child.name}` : child.name;
      if (excluded.has(rel)) continue;
      if (child.isDirectory()) {
        state[rel] = "directory";
        visit(rel);
      } else if (child.isFile()) {
        state[rel] = createHash("sha256")
          .update(readFileSync(path.join(root, rel)))
          .digest("hex");
      }
    }
  }
  visit("");
  return state;
}

type Case = {
  id: string;
  mode: "read" | "write";
  risk?: "high";
  arrange(): unknown | Promise<unknown>;
  verify(data: unknown): void | Promise<void>;
};

async function cases(f: Fixture): Promise<Case[]> {
  const write = (id: string, arrange: Case["arrange"], verify: Case["verify"], risk?: "high"): Case => ({ id, mode: "write", arrange, verify, ...(risk && { risk }) });
  const read = (id: string, arrange: Case["arrange"], verify: Case["verify"], risk?: "high"): Case => ({ id, mode: "read", arrange, verify, ...(risk && { risk }) });
  const makeNote = async (name: string) => z.object({ path: z.string(), id: z.string() }).parse(await f.callDesktop("notes.create", { name }));
  const putInTrash = async (name: string) => {
    const item = await makeNote(name);
    return z.object({ trashId: z.string() }).parse(await f.callDesktop("notes.trash", { path: item.path }));
  };
  const capture = async (title: string) => IdVersion.parse(await f.callDesktop("inbox.capture", { title, body: BODY }));
  const captureRead = async (id: string) => {
    const captures = z.array(z.object({ id: z.string(), version: z.string(), status: z.string(), body: z.string(), result: z.unknown() })).parse(await f.callDesktop("inbox.list"));
    return captures.find((item) => item.id === id);
  };
  const note = await makeNote("Favorite-and-attachment");
  const trashes = { toTrash: await makeNote("ToTrash"), restore: await putInTrash("ToRestore"), destroy: await putInTrash("ToDestroy") };
  const drafts = await makeNote("DraftSource");
  f.put("Fixture Template.md", "# Fixture source");
  f.put("模板/Existing.md", "An existing template");
  f.put("enc.txt", Buffer.from([0x63, 0x61, 0x66, 0xe9]));
  f.put("convert.txt", Buffer.from([0x63, 0x61, 0x66, 0xe9]));
  await f.callDesktop("archives.types.save", { name: "Fixture Library", fields: [] });
  await f.callDesktop("archives.types.save", { name: "Fixture Removable", fields: [] });
  await f.callDesktop("archives.create", { type: "Fixture Library", name: "Fixture Record", body: BODY });
  await f.callDesktop("archives.create", { type: "Fixture Removable", name: "Archive To Remove", body: "keep in trash" });
  f.put("Preflight.md", "Reference to [[Archives/Fixture Removable/Archive To Remove/]]");
  const items = { update: await capture("ToEdit"), convert: await capture("ToConvert"), dismiss: await capture("ToDismiss"), delete: await capture("ToDelete") };
  const guideState = ".huhu/guide/state.json";
  f.put(GUIDE, BODY);
  f.put(guideState, JSON.stringify({ ...JSON.parse(f.get(guideState)), needsCheck: { [GUIDE]: true } }));
  let hiddenVersion = "";
  let typeVersion = "";
  let draftVersion = "";
  let backupId = "";
  let dismissedVersion = "";
  let convertedVersion = "";
  const guideVersions = () => ({ [GUIDE]: f.version(GUIDE) });

  return [
    read(
      "archives.types.list",
      () => ({}),
      (data) => {
        const types = z.array(z.object({ path: z.string(), version: z.string(), count: z.number(), affectedArchives: z.array(z.string()), referencedBy: z.array(z.string()) })).parse(data);
        const type = types.find(({ path }) => path === DELETABLE_TYPE)!;
        expect(type).toMatchObject({ count: 1, affectedArchives: ["Archives/Fixture Removable/Archive To Remove/"], referencedBy: ["Preflight.md"] });
        typeVersion = type.version;
      },
    ),
    write(
      "archives.types.save",
      () => ({ name: "Single New Type", fields: [{ name: "Private field name", type: "text" }] }),
      (data) => {
        expect(data).toMatchObject({ path: "Archives/Single New Type/", version: expect.any(String) });
        expect(data).not.toHaveProperty("fields");
        expect(readdirSync(path.join(f.root, "Archives")).filter((name) => name.startsWith("Single New Type"))).toEqual(["Single New Type"]);
      },
    ),
    write(
      "archives.types.delete",
      () => ({ path: DELETABLE_TYPE, expectedVersion: typeVersion, confirmed: true }),
      (data) => {
        expect(data).toMatchObject({ trashed: 2 });
        expect(f.exists(DELETABLE_TYPE)).toBe(false);
      },
      "high",
    ),
    write(
      "archives.addFile",
      () => ({ path: ARCHIVE, expectedVersion: f.version(`${ARCHIVE}index.md`), name: "receipt.txt", dataBase64: Buffer.from(BODY).toString("base64") }),
      (data) => {
        const result = z.object({ path: z.string() }).parse(data);
        expect(result.path).toBe(`${ARCHIVE}receipt.txt`);
        expect(f.get(result.path)).toBe(BODY);
      },
    ),
    read(
      "notes.templates.list",
      () => ({}),
      (data) => {
        expect(data).toContain("模板/Existing.md");
      },
    ),
    write(
      "notes.templates.import",
      () => ({ path: "Fixture Template.md", expectedVersion: f.version("Fixture Template.md") }),
      (data) => {
        expect(data).toEqual({ path: "模板/Fixture Template.md" });
        expect(f.get("模板/Fixture Template.md")).toBe(f.get("Fixture Template.md"));
        expect(readdirSync(path.join(f.root, "模板")).filter((name) => name.startsWith("Fixture Template"))).toEqual(["Fixture Template.md"]);
      },
    ),
    read(
      "notes.textEncoding",
      () => ({ path: "enc.txt" }),
      (data) => {
        expect(data).toMatchObject({ state: "encoding", version: f.version("enc.txt") });
      },
    ),
    read(
      "notes.previewEncoding",
      () => ({ path: "enc.txt", encoding: "windows-1252", expectedVersion: f.version("enc.txt") }),
      (data) => {
        expect(data).toEqual({ text: "café", truncated: false });
      },
      "high",
    ),
    write(
      "notes.convertEncoding",
      () => ({ path: "convert.txt", encoding: "windows-1252", expectedVersion: f.version("convert.txt") }),
      (data) => {
        expect(data).toEqual({ version: f.version("convert.txt") });
        expect(f.get("convert.txt")).toBe("café");
      },
      "high",
    ),
    write(
      "notes.attach",
      () => ({ notePath: note.path, expectedVersion: f.version(note.path), name: "capture.png", dataBase64: Buffer.from(BODY).toString("base64") }),
      (data) => {
        expect(data).toEqual({ path: "attachments/capture.png", size: Buffer.byteLength(BODY), deduped: false });
        expect(f.get("attachments/capture.png")).toBe(BODY);
      },
    ),
    write(
      "notes.trash",
      () => ({ path: trashes.toTrash.path, noteId: trashes.toTrash.id, expectedVersion: f.version(trashes.toTrash.path) }),
      (data) => {
        expect(data).toMatchObject({ trashId: expect.any(String) });
        expect(f.exists(trashes.toTrash.path)).toBe(false);
      },
      "high",
    ),
    write(
      "notes.restore",
      () => trashes.restore,
      (data) => {
        expect(data).toEqual({ path: "ToRestore.md" });
        expect(f.exists("ToRestore.md")).toBe(true);
      },
      "high",
    ),
    write(
      "notes.deletePermanent",
      () => ({ ...trashes.destroy, confirmed: true }),
      (data) => {
        expect(data).toEqual({ ok: true });
        expect(f.exists(`.huhu/trash/${trashes.destroy.trashId}`)).toBe(false);
      },
      "high",
    ),
    read(
      "notes.hidden.get",
      () => ({}),
      (data) => {
        const info = z.object({ version: z.string(), hiddenPaths: z.array(z.string()) }).parse(data);
        expect(info.hiddenPaths).toEqual([]);
        hiddenVersion = info.version;
      },
    ),
    write(
      "notes.hidden.set",
      () => ({ expectedVersion: hiddenVersion, hiddenPaths: [note.path] }),
      async (data) => {
        expect(data).toMatchObject({ version: expect.any(String) });
        expect(data).not.toHaveProperty("hiddenPaths");
        expect(await f.callDesktop("notes.hidden.get")).toEqual({ hiddenPaths: [note.path] });
      },
    ),
    write(
      "notes.setFavorite",
      () => ({ path: note.path, expectedVersion: f.version(note.path), favorite: true }),
      async (data) => {
        expect(data).toEqual({ favorites: [note.id] });
        expect(await f.callDesktop("notes.list", { filter: "favorites" })).toEqual([expect.objectContaining({ id: note.id })]);
      },
    ),
    write(
      "notes.openDaily",
      () => ({ date: DATE }),
      (data) => {
        expect(data).toEqual({ path: DAILY, created: true });
        expect(f.exists(DAILY)).toBe(true);
      },
    ),
    write(
      "folders.create",
      () => ({ path: "Fixture Folder" }),
      (data) => {
        expect(data).toEqual({ ok: true });
        expect(statSync(path.join(f.root, "Fixture Folder")).isDirectory()).toBe(true);
      },
    ),
    write(
      "notes.draft.save",
      () => ({ path: drafts.path, text: BODY, baseVersion: f.version(drafts.path), expectedDraftVersion: null }),
      async (data) => {
        expect(data).toEqual({ ok: true });
        expect(await f.callDesktop("notes.draft.get", { path: drafts.path })).toBeNull();
      },
    ),
    read(
      "notes.draft.get",
      () => ({ path: drafts.path }),
      async (data) => {
        const draft = z.object({ text: z.string(), version: z.string() }).parse(data);
        expect(draft.text).toBe(BODY);
        draftVersion = draft.version;
        if (f.entry === "mcp") {
          const stranger = await openMcpSession(f.endpoint(), f.gateway.token);
          const reply = await mcpRequest(f.endpoint(), f.gateway.token, mcpRpc("tools/call", { name: "notes_draft_get", arguments: { path: drafts.path } }), stranger);
          expect(await reply.json()).toMatchObject({ result: { structuredContent: { data: null } } });
          expect((await mcpRequest(f.endpoint(), f.gateway.token, undefined, stranger, { method: "DELETE" })).status).toBe(200);
        }
      },
      "high",
    ),
    write(
      "notes.draft.discard",
      () => ({ path: drafts.path, expectedVersion: draftVersion }),
      (data) => {
        expect(data).toEqual({ ok: true });
        expect(readdirSync(path.join(f.root, ".huhu/drafts"))).toEqual([]);
        expect(f.exists(drafts.path)).toBe(true);
      },
      "high",
    ),
    write(
      "inbox.update",
      () => ({ ...items.update, expectedVersion: items.update.version, body: `${BODY} updated` }),
      async (data) => {
        expect(data).toMatchObject({ id: items.update.id });
        expect(data).not.toHaveProperty("body");
        expect((await captureRead(items.update.id))?.body).toBe(`${BODY} updated`);
      },
    ),
    write(
      "inbox.convert",
      () => ({ id: items.convert.id, expectedVersion: items.convert.version, target: "note", fields: { name: "Only Converted Note" } }),
      async (data) => {
        expect(data).toMatchObject({ id: items.convert.id, status: "processed", result: { kind: "note" } });
        expect(data).not.toHaveProperty("title");
        convertedVersion = (await captureRead(items.convert.id))!.version;
        expect((await captureRead(items.convert.id))?.body).toBe(BODY);
        expect(f.exists("Only Converted Note.md")).toBe(true);
      },
    ),
    write(
      "inbox.dismiss",
      () => ({ id: items.dismiss.id, expectedVersion: items.dismiss.version }),
      async (data) => {
        expect(data).toMatchObject({ id: items.dismiss.id, status: "dismissed" });
        dismissedVersion = (await captureRead(items.dismiss.id))!.version;
      },
    ),
    write(
      "inbox.restore",
      () => ({ id: items.dismiss.id, expectedVersion: dismissedVersion }),
      async (data) => {
        expect(data).toMatchObject({ id: items.dismiss.id, status: "pending" });
        expect((await captureRead(items.dismiss.id))?.body).toBe(BODY);
      },
    ),
    write(
      "inbox.undo",
      () => {
        f.put("Only Converted Note.md", "# Later edit to the result");
        return { id: items.convert.id, expectedVersion: convertedVersion };
      },
      async (data) => {
        expect(data).toMatchObject({ id: items.convert.id, status: "pending", result: null });
        expect((await captureRead(items.convert.id))?.body).toBe(BODY);
        expect(f.get("Only Converted Note.md")).toBe("# Later edit to the result");
      },
      "high",
    ),
    write(
      "inbox.delete",
      () => ({ id: items.delete.id, expectedVersion: items.delete.version, confirmed: true }),
      async (data) => {
        expect(data).toEqual({ ok: true });
        expect(await captureRead(items.delete.id)).toBeUndefined();
      },
      "high",
    ),
    read(
      "guide.view",
      () => ({ path: GUIDE }),
      (data) => {
        expect(data).toMatchObject({ path: GUIDE, contentVersion: f.version(GUIDE), current: BODY, status: "needs-check" });
      },
      "high",
    ),
    write(
      "guide.check",
      () => ({}),
      (data) => {
        expect(data).toMatchObject({ overall: "conflict" });
        expect(JSON.parse(f.get(guideState)).needsCheck).toEqual({});
      },
    ),
    write(
      "guide.preserve",
      () => ({ path: GUIDE, expectedVersions: guideVersions() }),
      (data) => {
        expect(data).toMatchObject({ overall: "preserved" });
        expect(f.get(GUIDE)).toBe(BODY);
      },
    ),
    write(
      "guide.restoreBuiltin",
      () => ({ path: GUIDE, expectedVersions: guideVersions() }),
      (data) => {
        const view = z.object({ backupId: z.string(), overall: z.string() }).parse(data);
        expect(view.overall).toBe("current");
        backupId = view.backupId;
        expect(f.get(GUIDE)).not.toContain(BODY);
        expect(f.get(`.huhu/guide/backups/${backupId}/${GUIDE}`)).toBe(BODY);
      },
      "high",
    ),
    read(
      "guide.backups.list",
      () => ({}),
      (data) => {
        expect(data).toEqual([{ id: backupId, files: [GUIDE] }]);
      },
    ),
    write(
      "guide.backups.restore",
      () => ({ id: backupId, expectedVersions: guideVersions() }),
      (data) => {
        expect(data).toMatchObject({ overall: "conflict" });
        expect(f.get(GUIDE)).toBe(BODY);
      },
      "high",
    ),
  ];
}

const denied = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
function businessEvents(f: Fixture) {
  const events: string[] = [];
  f.engine().events.subscribe((event) => {
    if (event.type !== "entity.changed") return;
    const payload = z.object({ kind: z.string(), id: z.string(), op: z.string() }).parse(event.payload);
    if (["note", "archive", "capture"].includes(payload.kind)) events.push(`${payload.kind}:${payload.op}:${payload.id}`);
  });
  return events;
}

describe.each(["cli", "mcp"] as const)("%s domain exposure", (entry) => {
  test("shared capabilities default off, explicitly enabled, revoked and reconciled after restart", { timeout: 90_000 }, async () => {
    const f = await fixture(entry);
    const matrix = await cases(f);
    const events = businessEvents(f);
    const pending: { id: string; input: unknown; key: string; reply: unknown; opId: string }[] = [];
    const catalog = z.object({ name: z.string(), plugin: z.string(), scope: z.string().nullable(), risk: z.string().optional(), availability: z.string(), exposable: z.boolean(), selected: z.boolean().nullable() });
    const entries = z.array(catalog).parse(await f.callDesktop("capabilities.list"));
    const shared = entries.filter(({ plugin }) => ["notes", "inbox", "agent-guide"].includes(plugin));
    expect(shared).toHaveLength(57);
    const commentNames = shared
      .map(({ name }) => name)
      .filter((name) => name.startsWith("comments."))
      .sort();
    expect(commentNames).toEqual(["comments.create", "comments.delete", "comments.list", "comments.relocate", "comments.update"]);
    for (const registered of shared) {
      expect(registered).toMatchObject({ availability: "active", exposable: true, selected: false });
      const descriptor = f.engine().registry.getDescriptor(registered.name);
      expect(descriptor?.defaultExposed).toBe(false);
      expect(f.engine().registry.get(registered.name)?.defaultExposed).toBe(false);
    }

    expect(matrix).toHaveLength(33);
    for (const row of matrix) {
      const listedName = entry === "mcp" ? row.id.replaceAll(".", "_") : row.id;
      const input = await row.arrange();
      const key = row.mode === "write" ? randomUUID() : undefined;
      const before = businessState(f.root);
      expect(
        entries.find(({ name }) => name === row.id),
        row.id,
      ).toMatchObject({ scope: row.mode, risk: row.risk ?? "normal" });
      expect(
        (await f.tools()).find(({ name }) => name === listedName),
        row.id,
      ).toBeUndefined();
      expect(await f.invoke(row.id, input, key), row.id).toMatchObject(denied);
      expect(businessState(f.root), row.id).toEqual(before);
      await f.choose(row.id, true);
      const available = (await f.tools()).find(({ name }) => name === listedName);
      expect(available, row.id).toBeDefined();
      if (entry === "mcp" && key) expect(available?._meta).toMatchObject({ "huhu.dev/intent-key": "required" });
      if (key) {
        expect(await f.invoke(row.id, input), row.id).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
        expect(businessState(f.root), row.id).toEqual(before);
      }
      const eventStart = events.length;
      const [reply] = await Promise.all([f.invoke(row.id, input, key), f.invoke(row.id, input, key, true)]);
      expect(reply, row.id).toMatchObject({ ok: true });
      const success = reply as Extract<z.infer<typeof CapabilityResultSchema>, { ok: true }>;
      await row.verify(success.data);
      const after = businessState(f.root);
      const eventAfter = events.length;
      if (key) {
        expect(after, row.id).not.toEqual(before);
        if (row.id.startsWith("inbox.") || row.id === "archives.types.save" || row.id === "notes.convertEncoding") expect(eventAfter - eventStart, row.id).toBeGreaterThan(0);
        expect(success.opId, row.id).toEqual(expect.any(String));
        await expect(f.invoke(row.id, input, key), row.id).resolves.toEqual(reply);
        expect(await f.operation(success.opId!), row.id).toMatchObject({ ok: true, data: { operationId: success.opId, state: "completed" } });
        if (row.id !== "guide.check") expect(await f.invoke(row.id, { ...(input as object), ...mismatch(row.id) }, key), row.id).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
        pending.push({ id: row.id, input, key, reply, opId: success.opId! });
      } else {
        expect(after, row.id).toEqual(before);
        expect(eventStart, row.id).toBe(eventAfter);
      }
      expect(businessState(f.root), row.id).toEqual(after);
      expect(events.length, row.id).toBe(eventAfter);
      await f.choose(row.id, false);
      expect(
        (await f.tools()).find(({ name }) => name === listedName),
        row.id,
      ).toBeUndefined();
      expect(await f.invoke(row.id, input, key), row.id).toMatchObject(denied);
      if (key) expect(await f.operation(success.opId!), row.id).toMatchObject(denied);
      expect(businessState(f.root), row.id).toEqual(after);
      expect(events.length, row.id).toBe(eventAfter);
    }
    for (const row of pending) await f.choose(row.id, true);
    await f.restart();
    const before = businessState(f.root);
    const afterEvents = businessEvents(f);
    for (const row of pending) {
      expect(await f.invoke(row.id, row.input, row.key), row.id).toEqual(row.reply);
      expect(await f.operation(row.opId), row.id).toMatchObject({ ok: true, data: { operationId: row.opId, state: "completed" } });
    }
    expect(businessState(f.root)).toEqual(before);
    expect(afterEvents).toEqual([]);
    for (const row of pending) await f.choose(row.id, false);

    // Repeat each read on the restarted Engine with only that tool enabled.
    const core = vi.spyOn(HerdrCore.prototype, "ensure");
    const fetches = vi.spyOn(globalThis, "fetch");
    try {
      for (const row of matrix.filter(({ mode }) => mode === "read")) {
        await f.choose(row.id, true);
        const readBaseline = businessState(f.root);
        const input = await row.arrange();
        expect(await f.invoke(row.id, input), row.id).toMatchObject({ ok: true });
        expect(businessState(f.root), row.id).toEqual(readBaseline);
        await f.choose(row.id, false);
      }
      expect(core).not.toHaveBeenCalled();
      const requestedUrls = fetches.mock.calls.map(([input]) => new URL(input instanceof Request ? input.url : input.toString()));
      expect(requestedUrls.every((url) => url.hostname === "127.0.0.1" && url.port === String(f.engine().port))).toBe(true);
      expect(afterEvents).toEqual([]);
    } finally {
      fetches.mockRestore();
      core.mockRestore();
    }
    const ledger = readFileSync(path.join(f.engine().vault.runtimeDir, "invocation-intents.ndjson"), "utf8");
    expect(ledger).not.toContain(BODY);
    expect(ledger).not.toContain("Private field name");
    expect(ledger).not.toContain(f.gateway.token);
  });

  test("inbox conversion retains source and target bodies without writing them to conversion receipts", { timeout: 45_000 }, async () => {
    const f = await fixture(entry);
    const taskBody = "synthetic body written only to the converted task";
    const archiveBody = "synthetic body written only to the converted archive";
    const archiveField = "synthetic field written only to the converted archive";
    const noteBody = "Synthetic note first line.\n\n```js\nconst kept = 42\n```\n\n[[Conversion Reference]]";
    const editedBody = "Synthetic edited note.\n\n[[Conversion Reference]]";
    await f.callDesktop("archives.types.save", { name: "Conversion Library", fields: [{ name: "reference", type: "text" }] });
    const first = IdVersion.parse(await f.callDesktop("inbox.capture", { title: "Source for task", body: BODY }));
    const second = IdVersion.parse(await f.callDesktop("inbox.capture", { title: "Source for archive", body: BODY }));
    await f.choose("inbox.convert", true);
    const taskInput = { id: first.id, expectedVersion: first.version, target: "task", fields: { title: "Converted Task", body: taskBody } };
    const [a, b] = await Promise.all([f.invoke("inbox.convert", taskInput, randomUUID()), f.invoke("inbox.convert", taskInput, randomUUID())]);
    const replies = [a, b];
    expect(replies.filter((reply) => reply?.ok)).toHaveLength(2);
    const converted = replies.find((reply) => reply?.ok);
    if (!converted?.ok) throw new Error("Fixture could not convert to a task");
    const target = z.object({ result: z.object({ id: z.string(), kind: z.literal("task") }) }).parse(converted.data).result;
    expect(b).toMatchObject({ ok: true, data: { result: target } });
    expect(await f.callDesktop("tasks.read", { id: target.id })).toMatchObject({ body: taskBody, origin: { kind: "inbox" } });
    expect(readdirSync(path.join(f.root, "Tasks")).filter((name) => name.startsWith("Converted Task"))).toHaveLength(1);
    const archive = await f.invoke(
      "inbox.convert",
      { id: second.id, expectedVersion: second.version, target: "archive", fields: { type: "Conversion Library", name: "Converted Archive", body: archiveBody, fields: { reference: archiveField } } },
      randomUUID(),
    );
    expect(archive).toMatchObject({ ok: true, data: { result: { kind: "archive", id: "Archives/Conversion Library/Converted Archive/" } } });
    expect(await f.callDesktop("archives.read", { path: "Archives/Conversion Library/Converted Archive/" })).toMatchObject({ body: expect.stringContaining(archiveBody), fields: { reference: archiveField } });
    expect(await f.callDesktop("inbox.list")).toEqual(expect.arrayContaining([expect.objectContaining({ id: first.id, body: BODY }), expect.objectContaining({ id: second.id, body: BODY })]));
    await f.callDesktop("notes.create", { name: "Conversion Reference" });
    for (const [name, original, override, expected] of [
      ["Converted Note Default", noteBody, undefined, noteBody],
      ["Converted Note Edited", noteBody, editedBody, editedBody],
      ["Converted Note Empty", noteBody, "", ""],
    ] as const) {
      const capture = IdVersion.parse(await f.callDesktop("inbox.capture", { title: name, body: original }));
      const result = await f.invoke("inbox.convert", { id: capture.id, expectedVersion: capture.version, target: "note", fields: { name, ...(override !== undefined && { body: override }) } }, randomUUID());
      expect(result).toMatchObject({ ok: true, data: { result: { kind: "note", id: expect.any(String) } } });
      if (!result?.ok) throw new Error("Fixture could not convert to a note");
      const converted = z.object({ result: z.object({ id: z.string() }) }).parse(result.data).result;
      expect(readFileSync(path.join(f.root, `${name}.md`), "utf8")).toBe(expected);
      expect(await f.callDesktop("notes.list")).toEqual(expect.arrayContaining([expect.objectContaining({ path: `${name}.md`, id: converted.id })]));
      expect(await f.callDesktop("inbox.list")).toEqual(expect.arrayContaining([expect.objectContaining({ id: capture.id, body: original, status: "processed", result: { kind: "note", id: converted.id } })]));
    }
    const backlinks = (await f.callDesktop("notes.backlinks", { path: "Conversion Reference.md" })) as { path: string }[];
    expect(
      backlinks
        .filter(({ path: file }) => file.startsWith("Converted Note"))
        .map(({ path: file }) => file)
        .sort(),
    ).toEqual(["Converted Note Default.md", "Converted Note Edited.md"]);
    for (const name of ["invocation-intents.ndjson", "idempotency.ndjson"]) {
      const ledger = readFileSync(path.join(f.engine().vault.runtimeDir, name), "utf8")
        .split("\n")
        .filter((line) => !line.startsWith('{"k":"desktop|inbox.capture|'))
        .join("\n");
      for (const secret of [taskBody, archiveBody, archiveField, noteBody.split("\n")[0]!, editedBody.split("\n")[0]!]) expect(ledger).not.toContain(secret);
    }

    const regular = "direct create keeps its existing response";
    expect(await f.callDesktop("tasks.create", { title: "Direct Desktop", body: regular })).toMatchObject({ body: regular });
    await f.choose("tasks.create", true);
    expect(await f.invoke("tasks.create", { title: "Direct Tool", body: regular }, randomUUID())).toMatchObject({ ok: true, data: { body: regular } });
  });

  test("guarded object paths and stale external versions remain untouched", { timeout: 45_000 }, async () => {
    const f = await fixture(entry);
    f.put("Automations/Original.txt", Buffer.from([0x63, 0x61, 0x66, 0xe9]));
    f.put("public.md", "# Fixture");
    f.put("Archive guess.md", "# Fixture");
    f.put(GUIDE, BODY);
    symlinkSync(path.join(f.root, "Automations"), path.join(f.root, "alias"), process.platform === "win32" ? "junction" : "dir");
    symlinkSync(path.join(f.root, "Automations"), path.join(f.root, "模板"), process.platform === "win32" ? "junction" : "dir");
    f.put("Normal Folder/Allowed.md", "# Ordinary note");
    symlinkSync(path.join(f.root, "Automations"), path.join(f.root, "Normal Folder", "managed"), process.platform === "win32" ? "junction" : "dir");
    const cases = [
      { id: "notes.convertEncoding", input: { path: "alias/Original.txt", encoding: "windows-1252", expectedVersion: f.version("Automations/Original.txt") }, code: "PERMISSION_DENIED" },
      { id: "notes.templates.import", input: { path: "public.md", expectedVersion: f.version("public.md") }, code: "PERMISSION_DENIED" },
      { id: "notes.attach", input: { notePath: "public.md", dir: "alias", name: "x.png", dataBase64: "YQ==", expectedVersion: f.version("public.md") }, code: "INVALID_INPUT" },
      { id: "folders.create", input: { path: "alias/New Folder" }, code: "PERMISSION_DENIED" },
      { id: "notes.trash", input: { path: "public.md", expectedVersion: "stale" }, code: "VERSION_CONFLICT" },
      { id: "notes.hidden.set", input: { hiddenPaths: [".huhu/vault.json"], expectedVersion: "stale" }, code: "PERMISSION_DENIED" },
      { id: "notes.draft.save", input: { path: "public.md", baseVersion: "stale", expectedDraftVersion: null, text: BODY }, code: "VERSION_CONFLICT" },
      { id: "archives.types.delete", input: { path: "Archives/unknown/", expectedVersion: "anything" }, code: "INVALID_INPUT" },
      { id: "archives.addFile", input: { path: "Archive guess.md", expectedVersion: f.version("Archive guess.md"), name: "x.txt", dataBase64: "YQ==" }, code: "NOT_FOUND" },
      { id: "inbox.convert", input: { id: "capture-of-another-vault", expectedVersion: "stale", target: "note", fields: { name: "Must not exist" } }, code: "NOT_FOUND" },
      { id: "guide.restoreBuiltin", input: { path: GUIDE, expectedVersions: { [GUIDE]: "stale" } }, code: "VERSION_CONFLICT" },
      { id: "guide.backups.restore", input: { id: "../outside", expectedVersions: {} }, code: "INVALID_INPUT" },
    ];
    for (const row of cases) {
      await f.choose(row.id, true);
      const before = businessState(f.root);
      expect(await f.invoke(row.id, row.input, randomUUID()), row.id).toMatchObject({ ok: false, error: { code: row.code } });
      expect(businessState(f.root), row.id).toEqual(before);
      await f.choose(row.id, false);
    }
    await f.choose("notes.duplicate", true);
    const beforeCopy = businessState(f.root);
    expect(await f.invoke("notes.duplicate", { path: "Normal Folder" })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(businessState(f.root)).toEqual(beforeCopy);
  });
});

test("disabled domain plugins retain static declarations and existing choices", async () => {
  const f = await fixture("cli");
  for (const [plugin, capability, input] of [
    ["notes", "notes.templates.list", {}],
    ["inbox", "inbox.list", {}],
    ["agent-guide", "guide.backups.list", {}],
  ] as const) {
    await f.choose(capability, true);
    const declared = f.engine().registry.getDescriptor(capability);
    expect(declared).toBeDefined();
    expect(await f.callDesktop("plugins.setEnabled", { id: plugin, enabled: false })).toMatchObject({ state: "disabled" });
    expect(f.engine().registry.get(capability)).toBeUndefined();
    expect(await f.callDesktop("capabilities.list", { includeInactive: true })).toEqual(expect.arrayContaining([expect.objectContaining({ name: capability, availability: "plugin-disabled", selected: true, exposable: true })]));
    expect(await f.invoke(capability, input)).toMatchObject({ error: { code: "PLUGIN_DISABLED" } });
    expect(await f.callDesktop("plugins.setEnabled", { id: plugin, enabled: true })).toMatchObject({ state: "active" });
    expect(f.engine().registry.getDescriptor(capability)).toBe(declared);
    expect(await f.invoke(capability, input)).toMatchObject({ ok: true });
  }
});

test("external drafts track the original stable note identity through rename and path reuse", async () => {
  const f = await fixture("mcp");
  await f.callDesktop("notes.create", { name: "Facade source" });
  await f.choose("notes.draft.save", true);
  await f.choose("notes.draft.get", true);
  expect(await f.invoke("notes.draft.save", { path: "Facade source.md", text: BODY, baseVersion: f.version("Facade source.md"), expectedDraftVersion: null }, randomUUID())).toMatchObject({ ok: true });
  await f.callDesktop("notes.rename", { path: "Facade source.md", newName: "Moved source" });
  await f.callDesktop("notes.create", { name: "Facade source" });
  expect(await f.invoke("notes.draft.get", { path: "Facade source.md" })).toMatchObject({ ok: true, data: null });
  expect(await f.invoke("notes.draft.get", { path: "Moved source.md" })).toMatchObject({ ok: true, data: { path: "Moved source.md", text: BODY } });
});

test("desktop draft capabilities preserve an unknown outcome across Engine restart", async () => {
  const f = await fixture("cli");
  const unknownPath = "未知写入.txt";
  const ordinaryPath = "普通草稿.txt";
  f.put(unknownPath, "X");
  f.put(ordinaryPath, "普通正文");
  const marked = { path: unknownPath, text: "X", baseVersion: f.version(unknownPath), outcome: "unknown" };
  const ordinary = { path: ordinaryPath, text: "普通正文", baseVersion: f.version(ordinaryPath) };
  expect(await f.callDesktop("notes.draft.save", marked)).toEqual({ ok: true });
  expect(await f.callDesktop("notes.draft.save", ordinary)).toEqual({ ok: true });

  await f.restart();

  expect(await f.callDesktop("notes.draft.get", { path: unknownPath })).toEqual({ ...marked, savedAt: expect.any(String) });
  const readOrdinary = await f.callDesktop("notes.draft.get", { path: ordinaryPath });
  expect(readOrdinary).toEqual({ ...ordinary, savedAt: expect.any(String) });
  expect(readOrdinary).not.toHaveProperty("outcome");
  expect(f.get(unknownPath)).toBe("X");
  expect(f.get(ordinaryPath)).toBe("普通正文");
});

test("Workbench conditional draft discard preserves a replacement written after sampling", async () => {
  const f = await fixture("cli");
  const rel = "记录身份.txt";
  f.put(rel, "A");
  const input = { path: rel, baseVersion: f.version(rel), outcome: "unknown" };
  const original = await f.callDesktop("notes.draft.save", { ...input, text: "X", withVersion: true });
  const [filename] = readdirSync(path.join(f.root, ".huhu/drafts"));
  const expectedVersion = f.version(`.huhu/drafts/${filename}`);
  expect(expectedVersion).toEqual(expect.any(String));
  expect(original).toEqual({ ok: true, version: expectedVersion });
  expect(await f.callDesktop("notes.draft.get", { path: rel, withVersion: true })).toMatchObject({ text: "X", version: expectedVersion });
  const replacement = await f.callDesktop("notes.draft.save", { ...input, text: "Y", withVersion: true });

  await expect(f.callDesktop("notes.draft.discard", { path: rel, expectedVersion })).rejects.toThrow(/VERSION_CONFLICT/);
  const { version } = z.object({ version: z.string() }).parse(replacement);
  expect(await f.callDesktop("notes.draft.get", { path: rel, withVersion: true })).toMatchObject({ text: "Y", outcome: "unknown", version });
  expect(await f.callDesktop("notes.draft.discard", { path: rel, expectedVersion: version })).toEqual({ ok: true });
  expect(await f.callDesktop("notes.draft.get", { path: rel })).toBeNull();
  expect(f.get(rel)).toBe("A");
});

test("Workbench reports real draft read errors during confirmed reload", async () => {
  const f = await fixture("cli");
  const rel = "草稿读取失败.txt";
  f.put(rel, "A");
  await f.callDesktop("notes.draft.save", { path: rel, text: "X", baseVersion: f.version(rel), outcome: "unknown" });
  const session = new DocumentSession({
    id: { vaultId: "v", path: rel, epoch: 1 },
    engine: { call: async <T>(capability: string, input: unknown) => (await f.callDesktop(capability, input)) as T },
    autosave: () => false,
    pollMs: 0,
  });
  expect(await session.load()).toBe(true);
  session.restoreDraft();
  const dir = path.join(f.root, ".huhu/drafts");
  const [filename] = readdirSync(dir);
  const entry = path.join(dir, filename!);
  const backup = `${entry}.held`;
  renameSync(entry, backup);
  mkdirSync(entry);
  try {
    expect(await session.discardEditsAndReload()).toBe(false);
    expect(session.getSnapshot()).toMatchObject({ text: "X", state: "conflict", hasUnsaved: true, flushError: expect.stringContaining("notes.draft.get: INTERNAL") });
    expect(f.get(rel)).toBe("A");
  } finally {
    rmSync(entry, { recursive: true });
    renameSync(backup, entry);
  }
  expect(await session.discardEditsAndReload()).toBe(true);
  expect(await f.callDesktop("notes.draft.get", { path: rel })).toBeNull();
  expect(session.getSnapshot()).toMatchObject({ text: "A", state: "saved", hasUnsaved: false });

  session.setText("Z");
  await session.keepDraft();
  expect(await f.callDesktop("notes.draft.get", { path: rel })).toMatchObject({ text: "Z" });
  await f.callDesktop("notes.draft.discard", { path: rel });
  expect(await session.discardEditsAndReload()).toBe(true);
  expect(session.getSnapshot()).toMatchObject({ text: "A", state: "saved", hasUnsaved: false, draft: null });
});

function mismatch(id: string): object {
  switch (id) {
    case "archives.types.save":
      return { name: "Another Type" };
    case "archives.types.delete":
      return { confirmed: false };
    case "archives.addFile":
      return { name: "other.txt" };
    case "notes.templates.import":
      return { path: "Another.md" };
    case "notes.convertEncoding":
      return { encoding: "big5" };
    case "notes.attach":
      return { name: "other.png" };
    case "notes.trash":
      return { expectedVersion: "other" };
    case "notes.restore":
      return { newName: "Other Name" };
    case "notes.deletePermanent":
      return { confirmed: false };
    case "notes.hidden.set":
      return { hiddenPaths: [] };
    case "notes.setFavorite":
      return { favorite: false };
    case "notes.openDaily":
      return { date: "2026-11-17" };
    case "folders.create":
      return { path: "Unrelated Folder" };
    case "notes.draft.save":
      return { text: "another draft" };
    case "notes.draft.discard":
      return { expectedVersion: "other" };
    case "inbox.update":
      return { body: "other update" };
    case "inbox.convert":
      return { target: "archive" };
    case "inbox.dismiss":
    case "inbox.restore":
    case "inbox.undo":
      return { expectedVersion: "other" };
    case "inbox.delete":
      return { confirmed: false };
    case "guide.preserve":
    case "guide.restoreBuiltin":
      return { expectedVersions: { [GUIDE]: "other" } };
    case "guide.backups.restore":
      return { id: "other" };
    default:
      throw new Error(id);
  }
}
