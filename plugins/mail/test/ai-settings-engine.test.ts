import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { CapabilityResultSchema } from "@huhu/contracts";
import { exportPackage, importPackage } from "@huhu/vault";
import { assert, expect, test } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import type { MailAiSettings } from "../src/engine/ai-settings.js";
import { aiFixture, aiFixtureCert } from "./fixtures/ai.js";

test.skipIf(process.platform !== "win32" || process.arch !== "x64")(
  "邮件 AI 合成连接、修订、Key 操作、重启及恢复使用真实 Windows Engine",
  async () => {
    const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-ai-"));
    const vaultPath = path.join(root, "vault");
    const desktopUserData = path.join(root, "user-data");
    const restoredPath = path.join(root, "restored");
    const packagePath = path.join(root, "mail.zip");
    mkdirSync(vaultPath);
    mkdirSync(desktopUserData);
    const ca = getCACertificates("default");
    setDefaultCACertificates([...ca, readFileSync(aiFixtureCert, "utf8")]);
    const secure = await aiFixture(true);
    const local = await aiFixture();
    const oldKey = `synthetic-ai-${randomUUID()}`;
    const newKey = `synthetic-ai-${randomUUID()}`;
    let engine: RunningEngine | undefined;
    let restored: RunningEngine | undefined;

    const call = async (capability: string, input: unknown = {}, options: { instance?: RunningEngine; token?: string; intentKey?: string; signal?: AbortSignal } = {}) => {
      const instance = options.instance ?? engine;
      assert(instance);
      const response = await fetch(`http://127.0.0.1:${instance.port}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${options.token ?? instance.rendererToken}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID(), intentKey: options.intentKey }),
        ...(options.signal && { signal: options.signal }),
      });
      const text = await response.text();
      for (const key of [oldKey, newKey]) expect(text.includes(key)).toBe(false);
      return CapabilityResultSchema.parse(JSON.parse(text));
    };
    async function read(instance?: RunningEngine): Promise<MailAiSettings> {
      const result = await call("mail.ai.getSettings", {}, instance ? { instance } : {});
      assert(result.ok);
      return result.data as MailAiSettings;
    }
    async function save(input: unknown): Promise<MailAiSettings> {
      const result = await call("mail.ai.saveSettings", input);
      assert(result.ok, result.ok ? undefined : result.error.message);
      return result.data as MailAiSettings;
    }
    const input = { expectedRevision: null, enabled: true, endpoint: secure.url, model: "fixture-model", key: { action: "replace", value: oldKey } };
    const verify = "mail.ai.verifyConnection";
    try {
      engine = await boot({ vaultPath, desktopUserData, create: true });
      expect(await read()).toEqual({ available: true, revision: null, enabled: false, endpoint: "", model: "", keyState: "unconfigured" });
      expect(await call(verify, input, { token: engine.mcpToken })).toMatchObject({ ok: false });
      expect(await call(verify, input, { intentKey: randomUUID() })).toMatchObject({ ok: false });
      expect(secure.requests).toHaveLength(0);
      expect(await call(verify, input)).toEqual({ ok: true, data: { verified: true } });
      expect((await read()).revision).toBeNull();
      const original = await save(input);
      expect(original).toMatchObject({ enabled: true, endpoint: `${secure.url}/chat/completions`, model: input.model, keyState: "configured" });
      expect(secure.requests).toEqual(
        Array.from({ length: 2 }, () => ({
          path: "/v1/chat/completions",
          authorization: `Bearer ${oldKey}`,
          body: { model: input.model, messages: [{ role: "user", content: "Huhu Mail connection test. Reply with OK." }], stream: false },
        })),
      );
      expect(await call("mail.accounts.list")).toEqual({ ok: true, data: { available: true, accounts: [] } });
      expect(await call("mail.ai.saveSettings", input)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      for (const endpoint of ["http://example.invalid/v1", "http://127.example.invalid/v1", "http://192.0.2.1/v1", "https://user:pass@example.invalid/v1", `${secure.url}?secret=value`, `${secure.url}#fragment`, local.url]) {
        expect(await call(verify, { ...input, expectedRevision: original.revision, endpoint })).toMatchObject({ ok: false });
      }
      expect(secure.requests).toHaveLength(2);
      expect(local.requests).toHaveLength(0);
      const replace = { ...input, expectedRevision: original.revision, model: "another-model", key: { action: "replace", value: newKey } };
      secure.behavior.status = 401;
      secure.behavior.text = newKey;
      expect(await call("mail.ai.saveSettings", replace)).toMatchObject({ ok: false, error: { details: { reason: "auth" } } });
      expect(await read()).toEqual(original);
      secure.behavior.status = 307;
      secure.behavior.redirect = `${local.url}/unexpected`;
      expect(await call(verify, replace)).toMatchObject({ ok: false, error: { details: { reason: "redirect" } } });
      expect(local.requests).toHaveLength(0);
      expect(await read()).toEqual(original);
      delete secure.behavior.status;
      delete secure.behavior.redirect;
      const replaced = await save(replace);
      expect(replaced).toMatchObject({ enabled: true, model: replace.model, keyState: "configured" });
      expect(secure.requests.at(-1)?.authorization).toBe(`Bearer ${newKey}`);
      const { key: _replacedKey, ...otherSettings } = replace;
      const kept = await save({ ...otherSettings, expectedRevision: replaced.revision });
      expect(secure.requests.at(-1)?.authorization).toBe(`Bearer ${newKey}`);
      expect(secure.requests).toHaveLength(6);

      const manifest = await exportPackage(vaultPath, packagePath);
      expect(manifest.files.filter(({ path: file }) => file.startsWith(".huhu/module-credentials/"))).toHaveLength(1);
      expect(manifest.files.every(({ path: file }) => !file.startsWith(".huhu/runtime/") && !file.endsWith(".bin"))).toBe(true);
      const credentialFile = manifest.files.find(({ path: file }) => file.startsWith(".huhu/module-credentials/"))!.path;
      const definitions = readFileSync(path.join(vaultPath, credentialFile), "utf8");
      expect(definitions).toContain("another-model");
      for (const key of [oldKey, newKey]) {
        expect(definitions.includes(key)).toBe(false);
        for (const file of readdirSync(engine.vault.runtimeDir, { recursive: true, withFileTypes: true }).filter((file) => file.isFile())) {
          expect(readFileSync(path.join(file.parentPath, file.name)).includes(key)).toBe(false);
        }
      }
      importPackage(packagePath, restoredPath);
      await engine.shutdown();
      engine = await boot({ vaultPath, desktopUserData });
      expect(await read()).toEqual(kept);
      restored = await boot({ vaultPath: restoredPath, desktopUserData });
      expect(await read(restored)).toMatchObject({ revision: kept.revision, keyState: "needs-reconfiguration" });
      expect(await call(verify, { ...otherSettings, expectedRevision: kept.revision }, { instance: restored })).toMatchObject({ ok: false });
      expect(secure.requests).toHaveLength(6);

      expect(await call(verify, { ...otherSettings, expectedRevision: kept.revision, endpoint: local.url })).toMatchObject({ ok: false });
      expect(local.requests).toHaveLength(0);
      const cleared = await save({ ...otherSettings, expectedRevision: kept.revision, key: { action: "clear" } });
      expect(cleared).toMatchObject({ enabled: false, keyState: "unconfigured" });
      expect(secure.requests).toHaveLength(6);
      const loopback = await save({ ...otherSettings, endpoint: local.url.replace("127.0.0.1", "localhost"), expectedRevision: cleared.revision });
      expect(loopback).toMatchObject({ enabled: true, endpoint: `${local.url}/chat/completions`, keyState: "unconfigured" });
      expect(local.requests).toHaveLength(1);
      expect(local.requests[0]?.authorization).toBeUndefined();
      const wait = Promise.withResolvers<void>();
      local.behavior.wait = wait.promise;
      expect(await call(verify, { ...otherSettings, endpoint: local.url, expectedRevision: loopback.revision })).toMatchObject({ ok: false, error: { details: { reason: "timeout" } } });
      wait.resolve();
      expect(await read()).toEqual(loopback);
      expect(local.requests).toHaveLength(2);
    } finally {
      try {
        if (engine) {
          const settings = await read();
          if (settings.keyState === "configured") await save({ ...input, enabled: false, expectedRevision: settings.revision, key: { action: "clear" } });
        }
      } finally {
        await Promise.all([secure.close(), local.close(), restored?.shutdown(), engine?.shutdown()]);
        setDefaultCACertificates(ca);
        rmSync(root, { recursive: true, force: true, maxRetries: 5 });
      }
    }
  },
  40_000,
);
