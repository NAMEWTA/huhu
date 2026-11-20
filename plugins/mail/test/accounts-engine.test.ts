import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import { exportPackage, importPackage } from "@huhu/vault";
import { assert, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { accountPasswordPurpose, accountTargets, mailAccountDefinitionSchema } from "../src/engine/account-definition.js";
import { openMailAccounts, type MailAccount } from "../src/engine/accounts.js";
import { openImapFixture } from "./fixtures/imap.js";

test.skipIf(process.platform !== "win32" || process.arch !== "x64")("邮件账号在 Safe 锁定时可保存和读回，恢复后要求重新配置", async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-mail-native-"));
  const desktopUserData = path.join(fixture, "app-data");
  const vaultPath = path.join(fixture, "mail");
  const archive = path.join(fixture, "mail.zip");
  const restoredPath = path.join(fixture, "restored");
  const password = `synthetic-${randomUUID()}`;
  mkdirSync(desktopUserData);
  mkdirSync(vaultPath);
  const imap = await openImapFixture();
  let engine: RunningEngine | undefined;
  let restored: RunningEngine | undefined;
  let saved: MailAccount | undefined;

  async function call(running: RunningEngine, capability: string, input: unknown = {}, token = running.rendererToken) {
    const response = await fetch(`http://127.0.0.1:${running.port}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ capability, input, requestId: randomUUID() }),
    });
    expect(response.status).toBe(200);
    return CapabilityResultSchema.parse(await response.json());
  }

  function credentials(running: RunningEngine) {
    assert(running.moduleCredentialHost);
    return new ModuleCredentials({
      ...running.moduleCredentialHost,
      vault: running.vault,
      pluginId: "mail",
      definition: mailAccountDefinitionSchema,
      targets: ({ settings }) => accountTargets(settings),
    });
  }

  try {
    engine = await boot({ vaultPath, desktopUserData, create: true });
    expect(await call(engine, "safe.setup", { password: "mail-test-safe" })).toMatchObject({ ok: true });
    expect(await call(engine, "safe.lock")).toMatchObject({ ok: true });
    assert(engine.moduleCredentialHost);
    const local = openMailAccounts({ ...engine.moduleCredentialHost, vault: engine.vault });
    const draft = local.begin(
      {
        provider: "custom_imap",
        email: "fixture@example.test",
        label: "Fixture",
        auth: "password",
        imap: { host: "127.0.0.1", port: imap.port, security: "none" },
        smtpEnabled: false,
        smtp: { host: "", port: 465, security: "tls" },
      },
      password,
    );
    const folders = await draft.testConnection();
    expect(folders).toEqual(expect.arrayContaining([expect.objectContaining({ path: "INBOX", selected: true })]));
    saved = await draft.save();
    expect(imap.commands.filter((command) => command === "LOGIN")).toHaveLength(1);

    const list = await call(engine, "mail.accounts.list");
    expect(list).toMatchObject({ ok: true, data: { available: true, accounts: [saved] } });
    expect(JSON.stringify(list).includes(password)).toBe(false);
    expect(await call(engine, "gateway.mcp.update", { enabled: true, transport: "stdio" })).toMatchObject({ ok: true });
    expect(await call(engine, "mail.accounts.list", {}, engine.mcpToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await exportPackage(vaultPath, archive);
    expect(importPackage(archive, restoredPath).vaultId).toBe(engine.vault.id);

    await engine.shutdown();
    engine = await boot({ vaultPath, desktopUserData });
    expect(await call(engine, "safe.status")).toMatchObject({ ok: true, data: { locked: true } });
    expect(await call(engine, "mail.accounts.list")).toMatchObject({ ok: true, data: { accounts: [saved] } });
    expect(await credentials(engine).use(saved.accountId, [accountPasswordPurpose], async (_, keys) => keys.get(accountPasswordPurpose) === password)).toBe(true);

    restored = await boot({ vaultPath: restoredPath, desktopUserData });
    expect(await call(restored, "mail.accounts.list")).toMatchObject({
      ok: true,
      data: { accounts: [{ accountId: saved.accountId, authState: { [accountPasswordPurpose]: "needs-reconfiguration" } }] },
    });
  } finally {
    try {
      if (engine && saved) {
        await credentials(engine).save({
          entityId: saved.accountId,
          expectedRevision: saved.revision,
          definition: saved.definition,
          actions: [{ purpose: accountPasswordPurpose, action: "clear" }],
        });
      }
    } finally {
      await Promise.all([imap.close(), restored?.shutdown(), engine?.shutdown()]);
      rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  }
});

test.skipIf(process.platform !== "win32" || process.arch !== "x64")(
  "原邮箱认证修复使用当前 revision，失败、冲突和取消保留原绑定",
  async () => {
    const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-repair-"));
    const vaultPath = path.join(root, "vault");
    const desktopUserData = path.join(root, "app");
    mkdirSync(vaultPath);
    mkdirSync(desktopUserData);
    const original = randomUUID();
    const replacement = randomUUID();
    const otherPassword = randomUUID();
    let accepted = original;
    const imapA = await openImapFixture({ acceptPassword: (value) => value === accepted, message: { uidValidity: 12, subject: "Repair A", source: "Subject: Repair A\r\n\r\nAlpha fixture\r\n" } });
    const imapB = await openImapFixture({ acceptPassword: (value) => value === otherPassword, message: { uidValidity: 12, subject: "Repair B", source: "Subject: Repair B\r\n\r\nBeta fixture\r\n" } });
    let engine: RunningEngine | undefined;
    const resume = Promise.withResolvers<void>();

    async function call(capability: string, input: unknown = {}) {
      assert(engine);
      const id = randomUUID();
      const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: id, idempotencyKey: id }),
      });
      return CapabilityResultSchema.parse(await response.json());
    }
    async function setup(input: unknown) {
      const response = await call("mail.accounts.testConnection", input);
      assert(response.ok, response.ok ? undefined : response.error.code);
      return { setupId: (response.data as { setupId: string }).setupId };
    }
    function credentials(running: RunningEngine) {
      assert(running.moduleCredentialHost);
      return new ModuleCredentials({ ...running.moduleCredentialHost, vault: running.vault, pluginId: "mail", definition: mailAccountDefinitionSchema, targets: ({ settings }) => accountTargets(settings) });
    }
    async function list() {
      const result = await call("mail.accounts.list");
      assert(result.ok);
      return (result.data as { accounts: MailAccount[] }).accounts;
    }
    async function account(email: string) {
      const result = (await list()).find(({ definition }) => definition.settings.email === email);
      assert(result);
      return result;
    }
    const aMail = "repair-a@example.invalid";
    const bMail = "repair-b@example.invalid";

    try {
      engine = await boot({ vaultPath, desktopUserData, create: true });
      assert(engine.moduleCredentialHost);
      const protection = engine.moduleCredentialHost.protection;
      const owner = credentials(engine);
      for (const [email, port, password] of [
        [aMail, imapA.port, original],
        [bMail, imapB.port, otherPassword],
      ] as const) {
        const key = await setup({
          settings: {
            provider: "custom_imap",
            email,
            label: email,
            auth: "password",
            imap: { host: "127.0.0.1", port, security: "none" },
            smtpEnabled: false,
            smtp: { host: "", port: 465, security: "tls" },
          },
          password,
        });
        expect(await call("mail.accounts.save", { ...key, folders: ["INBOX"] })).toMatchObject({ ok: true });
      }
      let a = await account(aMail);
      const b = await account(bMail);
      const target = () => ({ accountId: a.accountId, expectedRevision: a.revision });
      const sync = (row: MailAccount) => call("mail.sync.refresh", { accountId: row.accountId, folder: "INBOX" });
      const retained = (value: string) => owner.use(a.accountId, [accountPasswordPurpose], async (_, values) => values.get(accountPasswordPurpose) === value);
      expect(await sync(a)).toMatchObject({ ok: true, data: { message: { subject: "Repair A" } } });
      expect(await sync(b)).toMatchObject({ ok: true, data: { message: { subject: "Repair B" } } });
      expect(await call("mail.accounts.testConnection", { ...target(), password: replacement })).toMatchObject({ ok: false, error: { details: { reason: "authentication" } } });
      expect(await account(aMail)).toEqual(a);

      accepted = replacement;
      const oldTarget = target();
      const stale = await setup({ ...oldTarget, password: replacement });
      expect(await call("mail.accounts.rename", { ...oldTarget, label: "原邮箱显示名称" })).toMatchObject({ ok: true, data: { accountId: a.accountId } });
      a = await account(aMail);
      expect(a.revision).not.toBe(oldTarget.expectedRevision);
      expect(await retained(original)).toBe(true);
      expect(await call("mail.accounts.save", stale)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      const count = imapA.commands.length;
      expect(await call("mail.accounts.testConnection", { ...oldTarget, password: replacement })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect(imapA.commands).toHaveLength(count);

      const durable = await setup({ ...target(), password: replacement });
      const write = engine.vault.files.write.bind(engine.vault.files);
      const failSave = vi.spyOn(engine.vault.files, "write").mockImplementation(async (...args) => {
        if (args[0].startsWith(".huhu/module-credentials/")) throw new Error("synthetic publish failure");
        return write(...args);
      });
      try {
        expect(await call("mail.accounts.save", durable)).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
      } finally {
        failSave.mockRestore();
      }
      expect(await account(aMail)).toEqual(a);
      expect(await retained(original)).toBe(true);

      const cancelled = await setup({ ...target(), password: replacement });
      const staged = Promise.withResolvers<void>();
      const read = protection.read.bind(protection);
      const pause = vi.spyOn(protection, "read").mockImplementationOnce(async (id) => {
        staged.resolve();
        await resume.promise;
        return read(id);
      });
      const pending = call("mail.accounts.save", cancelled);
      await staged.promise;
      try {
        expect(await call("mail.accounts.cancelSetup", cancelled)).toMatchObject({ ok: true });
      } finally {
        resume.resolve();
      }
      expect(await pending).toMatchObject({ ok: false, error: { details: { reason: "cancelled" } } });
      pause.mockRestore();
      expect(await call("mail.accounts.save", cancelled)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(await account(aMail)).toEqual(a);
      expect(await retained(original)).toBe(true);

      expect(await call("mail.accounts.save", durable)).toMatchObject({ ok: true, data: { accountId: a.accountId } });
      const repaired = await account(aMail);
      expect(repaired.revision).not.toBe(a.revision);
      expect(repaired.definition).toEqual(a.definition);
      expect(await retained(replacement)).toBe(true);
      expect(await account(bMail)).toEqual(b);
      expect(await sync(repaired)).toMatchObject({ ok: true, data: { message: { subject: "Repair A" } } });
      expect(await sync(b)).toMatchObject({ ok: true, data: { message: { subject: "Repair B" } } });
    } finally {
      resume.resolve();
      vi.restoreAllMocks();
      try {
        if (engine?.moduleCredentialHost) {
          const owner = credentials(engine);
          for (const { entityId, revision } of await owner.list()) await owner.delete(entityId, revision);
        }
      } finally {
        await Promise.all([engine?.shutdown(), imapA.close(), imapB.close()]);
        rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
      }
    }
  },
  30_000,
);
