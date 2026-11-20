import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import { exportPackage, importPackage } from "@huhu/vault";
import { assert, expect, test } from "vitest";
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
