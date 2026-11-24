import { openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { randomUUID } from "node:crypto";
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import { exportPackage, importPackage } from "@huhu/vault";
import { assert, expect, test as engineTest, vi } from "vitest";
import { boot, type RunningEngine } from "./fixtures/engine.js";
import { accountPasswordPurpose, accountTargets, mailAccountDefinitionSchema } from "../src/engine/account-definition.js";
import { openMailAccounts } from "../src/engine/accounts.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

const draftsPath = ".huhu/mail/drafts.json";

function credentials(engine: RunningEngine) {
  assert(engine.moduleCredentialHost);
  return new ModuleCredentials({
    ...engine.moduleCredentialHost,
    vault: engine.vault,
    pluginId: "mail",
    definition: mailAccountDefinitionSchema,
    targets: ({ settings }) => accountTargets(settings),
  });
}

async function withFixture(run: (fixture: { root: string; vaultPath: string; open: (options?: Partial<Parameters<typeof boot>[0]>) => Promise<RunningEngine> }) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-drafts-"));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "app-data");
  const engines: RunningEngine[] = [];
  let source: RunningEngine | undefined;
  const createKeys: { keyId: string; protection: NonNullable<RunningEngine["moduleCredentialHost"]>["protection"] }[] = [];
  try {
    mkdirSync(vaultPath);
    mkdirSync(desktopUserData);
    await run({
      root,
      vaultPath,
      async open(options) {
        const engine = await boot({ vaultPath, desktopUserData, ...options });
        engines.push(engine);
        if (!engine.vault.readOnly && engine.vault.root === vaultPath) {
          source = engine;
          const protection = engine.moduleCredentialHost?.protection;
          assert(protection);
          const create = protection.create.bind(protection);
          vi.spyOn(protection, "create").mockImplementation(async (keyId, key) => {
            createKeys.push({ keyId, protection });
            await create(keyId, key);
          });
        }
        return engine;
      },
    });
  } finally {
    try {
      if (source) {
        const owner = credentials(source);
        for (const entry of await owner.list()) await owner.delete(entry.entityId, entry.revision);
        for (const { keyId, protection } of createKeys) {
          const key = await protection.read(keyId);
          const removed = key === null;
          key?.fill(0);
          expect(removed).toBe(true);
        }
      }
    } finally {
      vi.restoreAllMocks();
      await Promise.all(engines.map((engine) => engine.shutdown()));
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
      expect(existsSync(root)).toBe(false);
    }
  }
}

async function call(engine: RunningEngine, capability: string, input: unknown = {}, token = engine.rendererToken, session?: string) {
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(session && { "mcp-session-id": session }) },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
  });
  expect(response.status).toBe(200);
  return CapabilityResultSchema.parse(await response.json());
}

const body = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "原始格式", marks: [{ type: "bold" }] },
        { type: "text", text: " 合成链接", marks: [{ type: "link", attrs: { href: "https://example.test/p?q=a%20b#section", target: "_blank", rel: "noopener" } }] },
      ],
    },
  ],
};
const content = {
  accountId: null as string | null,
  to: [" A@example.test ", "a@example.test"],
  cc: ["A@Example.Test", "Copy@example.test"],
  bcc: ["copy@example.test", "blind@example.test", "BLIND@example.test"],
  subject: "  合成邮件  ",
  body,
};
const saveInput = (draftId: string, expectedRevision: string | null, draft: typeof content = content) => ({ draftId, expectedRevision, draft });
const save = (engine: RunningEngine, ...params: Parameters<typeof saveInput>) => call(engine, "mail.drafts.save", saveInput(...params));
const get = (engine: RunningEngine, draftId: string) => call(engine, "mail.drafts.get", { draftId });

function result<T>(response: Awaited<ReturnType<typeof call>>): T {
  assert(response.ok, response.ok ? undefined : response.error.code);
  return response.data as T;
}

type Draft = { draftId: string; updatedAt: string; revision: string; accountId: string | null; subject: string };

engineTest(
  "离线草稿可切换发件账号，Engine、只读和新格式 ZIP 重开保留原始内容",
  async () => {
    await withFixture(async ({ root, vaultPath, open }) => {
      const transport = vi.fn();
      const listener = createServer((socket) => {
        transport();
        socket.destroy();
      });
      await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
      try {
        const address = listener.address();
        assert(address && typeof address !== "string");
        let engine = await open({ create: true });
        assert(engine.moduleCredentialHost);
        const discover = vi.fn(async () => [{ path: "INBOX", name: "INBOX", delimiter: "/", flags: [], specialUse: null }]);
        const accounts = openMailAccounts({ ...engine.moduleCredentialHost, vault: engine.vault }, discover);
        const passwords: string[] = [];
        const accountIds: string[] = [];
        for (const label of ["alpha", "beta", "receive-only"]) {
          const smtpEnabled = label !== "receive-only";
          const password = `offline-${randomUUID()}`;
          passwords.push(password);
          const account = accounts.begin(
            {
              provider: "custom_imap",
              email: `${label}@example.test`,
              label,
              auth: "password",
              imap: { host: "127.0.0.1", port: address.port, security: "none" },
              smtpEnabled,
              smtp: { host: smtpEnabled ? "127.0.0.1" : "", port: address.port, security: "none" },
            },
            password,
          );
          await account.testConnection();
          accountIds.push((await account.save()).accountId);
        }
        expect(discover).toHaveBeenCalledTimes(3);
        const [alpha, beta, receiveOnly] = accountIds;
        assert(alpha && beta && receiveOnly);
        const id = randomUUID();
        const initial = result<Draft>(await save(engine, id, null, { ...content, accountId: alpha }));
        expect(initial).toMatchObject({
          draftId: id,
          revision: expect.any(String),
          accountId: alpha,
          to: ["a@example.test"],
          cc: ["copy@example.test"],
          bcc: ["blind@example.test"],
          subject: content.subject,
          body,
        });
        for (const accountId of [receiveOnly, randomUUID()]) {
          expect(await save(engine, id, initial.revision, { ...content, accountId })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { reason: "sender-not-available" } } });
          expect(await get(engine, id)).toEqual({ ok: true, data: { draft: initial } });
        }
        const switched = result<Draft>(
          await engine.dispatcher.call("web:mail-draft-fixture", {
            capability: "mail.drafts.save",
            input: saveInput(id, initial.revision, { ...content, accountId: beta }),
            requestId: randomUUID(),
            idempotencyKey: randomUUID(),
          }),
        );
        expect(switched).toMatchObject({ draftId: id, accountId: beta, body });
        expect(switched.revision).not.toBe(initial.revision);
        const second = result<Draft>(await save(engine, randomUUID(), null, { ...content, accountId: alpha, subject: "alpha 草稿" }));

        await engine.shutdown();
        engine = await open();
        expect(await get(engine, switched.draftId)).toEqual({ ok: true, data: { draft: switched } });
        expect(await get(engine, second.draftId)).toEqual({ ok: true, data: { draft: second } });
        expect(await call(engine, "mail.drafts.list")).toMatchObject({
          ok: true,
          data: {
            drafts: expect.arrayContaining([
              { draftId: id, revision: switched.revision, accountId: beta, updatedAt: switched.updatedAt, subject: switched.subject },
              { draftId: second.draftId, revision: second.revision, accountId: alpha, updatedAt: second.updatedAt, subject: second.subject },
            ]),
          },
        });
        const routed = await engine.dispatcher.call("web:mail-draft-fixture", { capability: "mail.drafts.get", input: { draftId: id }, requestId: randomUUID() });
        expect(routed).toEqual({ ok: true, data: { draft: switched } });
        expect(await call(engine, "gateway.mcp.update", { enabled: true, transport: "stdio" })).toMatchObject({ ok: true });
        const session = await openMcpSession(`http://127.0.0.1:${engine.port}/api/v1/mcp`, engine.mcpToken);
        expect(await call(engine, "mail.drafts.get", { draftId: id }, engine.mcpToken, session)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
        expect(await call(engine, "mail.drafts.save", saveInput(id, switched.revision), engine.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
        const privateRuntimeFile = path.join(engine.vault.runtimeDir, "idempotency.ndjson");
        if (existsSync(privateRuntimeFile)) expect(readFileSync(privateRuntimeFile, "utf8")).not.toMatch(/mail\.drafts\.|blind@example\.test/);

        const readOnly = await open({ readOnly: true });
        const bytes = readFileSync(path.join(vaultPath, draftsPath));
        expect(await get(readOnly, id)).toEqual({ ok: true, data: { draft: switched } });
        expect(await save(readOnly, id, switched.revision)).toMatchObject({ ok: false, error: { code: "READ_ONLY_VAULT" } });
        expect(await call(readOnly, "mail.drafts.discard", { draftId: id, expectedRevision: switched.revision })).toMatchObject({ ok: false, error: { code: "READ_ONLY_VAULT" } });
        expect(readFileSync(path.join(vaultPath, draftsPath))).toEqual(bytes);

        const archive = path.join(root, "huhu-mail.zip");
        const destination = path.join(root, "restored");
        const manifest = await exportPackage(vaultPath, archive);
        expect(manifest).toMatchObject({ format: "huhu-package", version: 1, files: expect.arrayContaining([expect.objectContaining({ path: draftsPath })]) });
        expect(manifest.files.some(({ path: name }) => name.endsWith(".bin") || name.startsWith(".huhu/runtime/"))).toBe(false);
        expect(importPackage(archive, destination).vaultId).toBe(engine.vault.id);
        for (const { path: name } of manifest.files) {
          const file = readFileSync(path.join(destination, name));
          expect(passwords.some((password) => file.includes(password))).toBe(false);
        }
        const restored = await open({ vaultPath: destination });
        expect(await get(restored, id)).toEqual({ ok: true, data: { draft: switched } });
        expect(await get(restored, second.draftId)).toEqual({ ok: true, data: { draft: second } });
        expect(await call(restored, "mail.accounts.list")).toMatchObject({
          ok: true,
          data: { accounts: expect.arrayContaining([alpha, beta].map((accountId) => expect.objectContaining({ accountId, authState: { [accountPasswordPurpose]: "needs-reconfiguration" } }))) },
        });
        await expect(credentials(restored).use(beta, [accountPasswordPurpose], async () => true)).rejects.toMatchObject({ code: "unbound" });
        const edited = result<Draft>(await save(restored, id, switched.revision, { ...content, accountId: beta, subject: "恢复后继续编辑" }));
        expect(edited).toMatchObject({ draftId: id, accountId: beta, subject: "恢复后继续编辑", body });
        expect(await get(engine, id)).toEqual({ ok: true, data: { draft: switched } });
        expect(transport).toHaveBeenCalledTimes(0);
        expect(discover).toHaveBeenCalledTimes(3);
      } finally {
        await new Promise<void>((resolve, reject) => listener.close((error) => (error ? reject(error) : resolve())));
      }
    });
  },
  120_000,
);

engineTest(
  "草稿原子替换失败保留字节，并发 CAS 仅一个获胜，明确丢弃后迟到提交不能恢复",
  async () => {
    await withFixture(async ({ vaultPath, open }) => {
      const engine = await open({ create: true });
      const id = randomUUID();
      const initial = result<Draft>(await save(engine, id.toUpperCase(), null));
      expect(initial.draftId).toBe(id);
      const file = path.join(vaultPath, draftsPath);
      const original = readFileSync(file);
      const rename = fs.renameSync;
      let failures = 0;
      const fault = vi.mocked(renameSync).mockImplementation((source, target) => {
        if (target !== file || failures > 0) return rename(source, target);
        failures++;
        expect(existsSync(source)).toBe(true);
        throw Object.assign(new Error("synthetic atomic replacement failure"), { code: "EIO" });
      });
      const input = { ...content, subject: "replacement fixture" };
      try {
        expect(await save(engine, id, initial.revision, input)).toMatchObject({ ok: false, error: { code: "INTERNAL", details: { reason: "draft-write-failed" } } });
      } finally {
        fault.mockReset();
      }
      expect(failures).toBe(1);
      expect(readFileSync(file)).toEqual(original);
      expect(readdirSync(path.dirname(file))).toEqual(["drafts.json"]);
      expect(await get(engine, id)).toEqual({ ok: true, data: { draft: initial } });

      const contenders = await Promise.all([save(engine, id, initial.revision, input), save(engine, id, initial.revision, { ...content, subject: "another candidate" })]);
      const success = contenders.filter((item) => item.ok);
      expect(success).toHaveLength(1);
      const winner = result<Draft>(success[0]!);
      expect(contenders.filter((item) => !item.ok)).toMatchObject([{ ok: false, error: { code: "VERSION_CONFLICT", details: { currentVersion: winner.revision } } }]);
      expect(await get(engine, id)).toEqual({ ok: true, data: { draft: winner } });
      expect(await save(engine, id, null)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT", details: { currentVersion: winner.revision } } });

      const otherId = randomUUID();
      const [updated, other] = (await Promise.all([save(engine, id, winner.revision, input), save(engine, otherId, null)])).map((reply) => result<Draft>(reply));
      assert(updated && other);
      expect(await get(engine, id)).toEqual({ ok: true, data: { draft: updated } });
      expect(await get(engine, otherId)).toEqual({ ok: true, data: { draft: other } });
      expect(await call(engine, "mail.drafts.discard", { draftId: id, expectedRevision: initial.revision })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect(await get(engine, id)).toEqual({ ok: true, data: { draft: updated } });
      expect(await call(engine, "mail.drafts.discard", { draftId: id, expectedRevision: updated.revision })).toEqual({ ok: true, data: { draftId: id, discarded: true } });
      expect(await get(engine, id)).toEqual({ ok: true, data: { draft: null } });
      expect(await save(engine, id, updated.revision, input)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect(await save(engine, id, null, input)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect(JSON.parse(readFileSync(file, "utf8")).drafts[id]).toMatchObject({ draft: null });

      await engine.shutdown();
      const reopened = await open();
      expect(await get(reopened, id)).toEqual({ ok: true, data: { draft: null } });
      expect(await get(reopened, otherId)).toEqual({ ok: true, data: { draft: other } });
    });
  },
  120_000,
);
