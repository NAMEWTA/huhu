import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityCatalogEntrySchema, CapabilityDiscoveryEntrySchema, CapabilityResultSchema } from "@huhu/contracts";
import { expect, test } from "vitest";
import { z } from "zod";
import manifest from "../huhu-plugin.json" with { type: "json" };
import { mailOAuthCapabilityDescriptors } from "../src/engine/index.js";
import { boot, type RunningEngine } from "./fixtures/engine.js";

test.skipIf(process.platform !== "win32")(
  "Mail OAuth catalog can be configured while disabled and survives an Engine restart",
  async () => {
    const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-catalog-"));
    const descriptors = Object.values(mailOAuthCapabilityDescriptors);
    const names = descriptors.map(({ name }) => name).sort();
    expect(manifest.contributes.capabilities.filter((name) => name.startsWith("mail.oauth.")).sort()).toEqual(names);
    let engine: RunningEngine | undefined;
    const url = (route: string) => `http://127.0.0.1:${engine!.port}${route}`;
    const call = async (capability: string, input: unknown = {}, token = engine!.rendererToken) => {
      const response = await fetch(url("/api/v1/call"), {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
      });
      expect(response.status).toBe(200);
      return CapabilityResultSchema.parse(await response.json());
    };
    const entries = async (includeInactive: boolean) => {
      const result = await call("capabilities.list", { includeInactive });
      expect(result.ok).toBe(true);
      return result.ok
        ? z
            .array(CapabilityCatalogEntrySchema)
            .parse(result.data)
            .filter(({ name }) => names.includes(name))
        : [];
    };
    const discovered = async (token: string) => {
      const response = await fetch(url("/api/v1/capabilities"), { headers: { authorization: `Bearer ${token}` } });
      expect(response.ok).toBe(true);
      return z
        .array(CapabilityDiscoveryEntrySchema)
        .parse(await response.json())
        .filter(({ name }) => names.includes(name))
        .map(({ name }) => name)
        .sort();
    };

    try {
      engine = await boot({ vaultPath: root, create: true });
      const active = await entries(true);
      expect(active.map(({ name }) => name).sort()).toEqual(names);
      for (const { name, title, description, risk, scope } of descriptors) {
        expect(active.find((entry) => entry.name === name)).toMatchObject({
          name,
          title,
          description,
          risk,
          scope,
          exposable: true,
          selected: false,
          exposed: false,
          availability: "active",
          input: expect.any(Object),
          output: expect.any(Object),
        });
      }
      const issued = await call("gateway.tokens.create", { name: "Mail catalog fixture" });
      expect(issued.ok).toBe(true);
      const { token } = z.object({ token: z.string() }).parse(issued.ok ? issued.data : undefined);
      expect(await discovered(token)).toEqual([]);
      expect(await call("plugins.setEnabled", { id: "mail", enabled: false })).toMatchObject({ ok: true, data: { state: "disabled" } });
      expect(await entries(false)).toEqual([]);
      expect(await entries(true)).toEqual(active.map((entry) => ({ ...entry, availability: "plugin-disabled" })));
      for (const name of names) expect(await call("gateway.update", { capability: name, exposed: true })).toMatchObject({ ok: true });
      expect(await discovered(token)).toEqual([]);
      expect(await call("mail.oauth.availability", {}, token)).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });

      await engine.shutdown();
      engine = await boot({ vaultPath: root });
      const selected = active.map((entry) => ({ ...entry, selected: true }));
      expect(await entries(true)).toEqual(selected.map((entry) => ({ ...entry, availability: "plugin-disabled" })));
      expect(await discovered(token)).toEqual([]);
      expect(await call("plugins.setEnabled", { id: "mail", enabled: true })).toMatchObject({ ok: true, data: { state: "active" } });
      expect(await entries(true)).toEqual(selected.map((entry) => ({ ...entry, exposed: true })));
      expect(await discovered(token)).toEqual(names);
      expect(await call("mail.oauth.availability", {}, token)).toMatchObject({ ok: true, data: { gmail: false, outlook: false } });
    } finally {
      try {
        await engine?.shutdown();
      } finally {
        if (path.dirname(root) === tmpdir() && path.basename(root).startsWith("huhu-mail-catalog-")) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    }
  },
  60_000,
);
