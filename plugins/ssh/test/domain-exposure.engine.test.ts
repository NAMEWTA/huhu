import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityCatalogEntrySchema, CapabilityResultSchema } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import ssh2 from "ssh2";
import { expect, test, vi } from "vitest";
import { z } from "zod";
import { run } from "../../../apps/cli/src/main.js";
import { boot } from "../../../apps/engine/src/boot.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { mcpRequest, mcpRpc, openRecoverableMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { HerdrCore } from "../../agent-cli/src/engine/herdr-core.js";
import { SshPreferences } from "../src/engine/preferences.js";
import { Transfers } from "../src/engine/transfers.js";
import { defaultVaultPreferences } from "../src/shared/preferences.js";
import { KnownHostAuthorities } from "../src/shared/trust.js";

const get = "ssh.settings.get";
const update = "ssh.settings.update";
const denied = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
const toolsSchema = z.array(z.object({ name: z.string(), _meta: z.record(z.string(), z.unknown()).optional() }));
const mcpReply = z.object({
  result: z.object({
    isError: z.boolean().optional(),
    content: z.array(z.object({ text: z.string() })),
    structuredContent: z.object({ data: z.unknown(), opId: z.string().optional() }).optional(),
  }),
});

test.each(["cli", "mcp"] as const)("%s SSH Vault settings are individually authorized, revoked and reconciled after restart", { timeout: 60_000 }, async (entry) => {
  const root = mkdtempSync(path.join(tmpdir(), `huhu-ssh-settings-${entry}-`));
  const vault = path.join(root, "vault");
  const profile = path.join(root, "profile");
  let engine: Awaited<ReturnType<typeof boot>> | undefined;
  try {
    mkdirSync(vault);
    mkdirSync(profile);
    const protection = new TestProtection(profile);
    engine = await boot({ vaultPath: vault, desktopUserData: profile, moduleCredentialProtection: protection, create: true });
    const desktop = (capability: string, input: unknown = {}) => engine!.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
    const success = async (capability: string, input?: unknown) => {
      const result = await desktop(capability, input);
      if (!result.ok) throw Error(`${capability}: ${result.error.code}`);
      return result.data;
    };
    await success("gateway.mcp.update", { enabled: true });
    const { token } = z.object({ token: z.string() }).parse(await success("gateway.tokens.create", { name: "SSH settings fixture" }));
    const endpoint = () => `http://127.0.0.1:${engine!.port}/mcp`;
    let session = entry === "mcp" ? await openRecoverableMcpSession(endpoint(), token) : undefined;
    const name = (capability: string) => (entry === "mcp" ? capability.replaceAll(".", "_") : capability);

    const cli = async (args: string[], discard = false) => {
      const output: string[] = [];
      await run([...args, "--vault", vault, "--json"], {
        out: (line) => {
          if (!discard) output.push(line);
        },
        err: (line) => {
          throw new Error(line);
        },
      });
      return discard ? undefined : JSON.parse(output.join(""));
    };
    const rpc = async (method: string, params?: unknown) => {
      const response = await mcpRequest(endpoint(), token, mcpRpc(method, params), session!.handle);
      expect(response.status).toBe(200);
      return response;
    };
    const tools = async () => {
      if (entry === "cli") return z.object({ data: toolsSchema }).parse(await cli(["capabilities", "list"])).data;
      return z.object({ result: z.object({ tools: toolsSchema }) }).parse(await (await rpc("tools/list")).json()).result.tools;
    };
    const invoke = async (capability: string, input: unknown = {}, key?: string, discard = false) => {
      if (entry === "cli") {
        const reply = await cli(["call", capability, "--input-json", JSON.stringify(input), ...(key ? ["--intent-key", key] : [])], discard);
        return discard ? undefined : CapabilityResultSchema.parse(reply);
      }
      const response = await rpc("tools/call", { name: name(capability), arguments: input, ...(key && { _meta: { "huhu.dev/intent-key": key } }) });
      if (discard) {
        await response.body!.cancel();
        return;
      }
      const { result } = mcpReply.parse(await response.json());
      return CapabilityResultSchema.parse(result.isError ? { ok: false, error: JSON.parse(result.content[0]!.text) } : { ok: true, ...result.structuredContent });
    };
    const catalog = z.array(CapabilityCatalogEntrySchema).parse(await success("capabilities.list", { includeInactive: true }));
    const ssh = catalog.filter(({ plugin }) => plugin === "ssh");
    expect(ssh.length).toBeGreaterThan(2);
    for (const [capability, scope] of [
      [get, "read"],
      [update, "write"],
    ] as const) {
      expect(ssh.find(({ name }) => name === capability)).toMatchObject({ availability: "active", exposable: true, selected: false, scope, risk: "normal" });
    }
    for (const row of ssh) {
      expect(engine.registry.getDescriptor(row.name)?.defaultExposed, row.name).toBe(false);
      expect(engine.registry.get(row.name)?.defaultExposed, row.name).toBe(false);
    }
    const initialTools = await tools();
    expect(initialTools.filter(({ name }) => name.startsWith(entry === "mcp" ? "ssh_" : "ssh."))).toEqual([]);
    const closed = ssh.filter(({ exposable }) => !exposable);
    const available = ssh.filter(({ exposable }) => exposable);
    const authorityList = "ssh.knownHosts.authorities.list";
    const authorityAdd = "ssh.knownHosts.authorities.add";
    const authorityRemove = "ssh.knownHosts.authorities.remove";
    for (const capability of ["ssh.authentication.answer", "ssh.configSync.apply", "ssh.configSync.preview", "ssh.local.close", "ssh.local.environments", "ssh.local.list", "ssh.local.open", authorityList, authorityAdd, authorityRemove]) {
      expect(closed.find(({ name }) => name === capability)).toMatchObject({ availability: "active", exposable: false, selected: false });
      expect(await desktop("gateway.update", { capability, exposed: true })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(await success("gateway.check", { capability })).toMatchObject({
        found: true,
        identities: [{ allowed: false }, { allowed: false }, { allowed: false }],
      });
    }
    expect(available.map(({ name }) => name).sort()).toEqual(
      [
        get,
        update,
        "ssh.archives.run",
        "ssh.archives.support",
        "ssh.audit.list",
        "ssh.auth.keyboardInteractive.respond",
        "ssh.connect",
        "ssh.connections.status",
        "ssh.disconnect",
        "ssh.exec.cancel",
        "ssh.exec.run",
        "ssh.fileSessions.close",
        "ssh.fileSessions.commitDirectory",
        "ssh.fileSessions.directory",
        "ssh.fileSessions.cancelSearch",
        "ssh.fileSessions.changeProperties",
        "ssh.fileSessions.createEntry",
        "ssh.fileSessions.document.open",
        "ssh.fileSessions.document.save",
        "ssh.fileSessions.list",
        "ssh.fileSessions.open",
        "ssh.fileSessions.moveEntry",
        "ssh.fileSessions.prepareDirectory",
        "ssh.fileSessions.properties",
        "ssh.fileSessions.search",
        "ssh.forwarding.rules.delete",
        "ssh.forwarding.rules.list",
        "ssh.forwarding.rules.save",
        "ssh.forwarding.runs.list",
        "ssh.forwarding.runs.resume",
        "ssh.forwarding.runs.start",
        "ssh.forwarding.runs.stop",
        "ssh.hosts.configure",
        "ssh.hosts.copy",
        "ssh.hosts.directory",
        "ssh.hosts.import.confirm",
        "ssh.hosts.import.preview",
        "ssh.hosts.list",
        "ssh.hosts.organize",
        "ssh.hosts.remove",
        "ssh.hosts.testDraft",
        "ssh.hostKey.decide",
        "ssh.jobs.cancel",
        "ssh.jobs.get",
        "ssh.jobs.list",
        "ssh.jobs.output.read",
        "ssh.jobs.prepare",
        "ssh.jobs.start",
        "ssh.knownHosts.list",
        "ssh.keys.add",
        "ssh.keys.list",
        "ssh.keys.remove",
        "ssh.knownHosts.forget",
        "ssh.monitor.panels.delete",
        "ssh.monitor.panels.change",
        "ssh.monitor.panels.external.list",
        "ssh.monitor.panels.list",
        "ssh.monitor.panels.run",
        "ssh.monitor.panels.save",
        "ssh.monitor.session.change",
        "ssh.monitor.session.get",
        "ssh.monitor.session.list",
        "ssh.monitor.session.open",
        "ssh.monitor.tools.read",
        "ssh.proxyShare.detect",
        "ssh.proxyShare.start",
        "ssh.proxyShare.status",
        "ssh.proxyShare.stop",
        "ssh.proxyShare.test",
        "ssh.recordings.list",
        "ssh.recordings.read",
        "ssh.recordings.start",
        "ssh.recordings.stop",
        "ssh.resources.connection.get",
        "ssh.resources.connection.list",
        "ssh.resources.connection.start",
        "ssh.resources.host.get",
        "ssh.resources.trust.decide",
        "ssh.shortcuts.list",
        "ssh.shortcuts.save",
        "ssh.sftp.cancel",
        "ssh.sftp.delete",
        "ssh.sftp.download",
        "ssh.sftp.list",
        "ssh.sftp.mkdir",
        "ssh.sftp.read",
        "ssh.sftp.rename",
        "ssh.sftp.upload",
        "ssh.sftp.write",
        "ssh.shells.close",
        "ssh.shells.list",
        "ssh.shells.open",
        "ssh.shells.read",
        "ssh.shells.resize",
        "ssh.shells.write",
        "ssh.transfers.cancel",
        "ssh.transfers.clearHistory",
        "ssh.transfers.decide",
        "ssh.transfers.list",
        "ssh.transfers.origin",
        "ssh.transfers.pause",
        "ssh.transfers.recheck",
        "ssh.transfers.resume",
        "ssh.transfers.retry",
        "ssh.transfers.start",
        "ssh.transfers.startBatch",
        "ssh.workspace.runs.close",
        "ssh.workspace.runs.changeLayout",
        "ssh.workspace.runs.list",
        "ssh.workspace.runs.reconnect",
        "ssh.workspace.runs.saveTemplate",
        "ssh.workspace.runs.start",
        "ssh.workspace.templates.delete",
        "ssh.workspace.templates.list",
        "ssh.workspace.templates.save",
      ].sort(),
    );
    expect(available.every(({ selected }) => selected === false)).toBe(true);
    for (const row of closed) expect(await invoke(row.name), row.name).toMatchObject(denied);
    const bulk = (rows: typeof ssh) => ({ changes: rows.map(({ name }) => ({ capability: name, exposed: true })) });
    const registry = engine.registry;
    const batchable = available.filter(({ name }) => !registry.getDescriptor(name)?.individualExposure);
    const preview = z.object({ targets: z.array(z.object({ capability: z.string() })) }).parse(await success("gateway.policy.preview", bulk(batchable)));
    expect(preview.targets.map(({ capability }) => capability)).toEqual(batchable.map(({ name }) => name));
    expect(await desktop("gateway.policy.preview", bulk(available))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await desktop("gateway.policy.preview", bulk(ssh))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

    const { hostId, revision: expectedRevision } = z
      .object({ hostId: z.string(), revision: z.string() })
      .parse(await success("ssh.hosts.configure", { name: "CA scope fixture", host: "127.0.0.1", port: 22022, user: "fixture", authKind: "agent", expectedRevision: null, credentials: [] }));
    const publicKey = ssh2.utils.generateKeyPairSync("ed25519").public;
    const approval = { hostId, expectedRevision, expectedTrustRevision: null, publicKey };
    expect(await success(authorityList)).toEqual({ revision: null, authorities: [] });
    expect(await invoke(authorityAdd, approval)).toMatchObject(denied);
    const savedAuthority = KnownHostAuthorities.parse(await success(authorityAdd, approval));
    expect(savedAuthority.authorities).toMatchObject([{ scope: "[127.0.0.1]:22022", keyType: "ssh-ed25519" }]);
    expect(await desktop(authorityAdd, approval)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    const removal = { authority: savedAuthority.authorities[0], expectedTrustRevision: savedAuthority.revision };
    expect(await invoke(authorityRemove, removal)).toMatchObject(denied);
    expect(await success(authorityRemove, removal)).toMatchObject({ authorities: [] });

    const core = vi.spyOn(HerdrCore.prototype, "ensure");
    const dial = vi.spyOn(ssh2.Client.prototype, "connect");
    const credentials = vi.spyOn(ModuleCredentials.prototype, "list");
    const changes = vi.spyOn(SshPreferences.prototype, "update");
    const schedule = vi.spyOn(Transfers.prototype, "preferencesChanged");
    const preferences = path.join(vault, ".huhu", "ssh", "preferences.json");
    const gateway = z.object({ toolAccess: z.object({ revision: z.number() }) });
    const choose = async (capability: string, exposed: boolean) => {
      const { toolAccess } = gateway.parse(await success("gateway.get"));
      expect(await success("gateway.update", { capability, exposed })).toMatchObject({ exposed, revision: toolAccess.revision + 1 });
    };
    const shortcutsList = "ssh.shortcuts.list";
    const shortcutsSave = "ssh.shortcuts.save";
    const shortcuts = [{ id: "example", name: "Fixture", text: "合成文本\n第二行" }];
    const saveShortcuts = { expectedRevision: null, shortcuts };
    expect(await invoke(shortcutsList)).toMatchObject(denied);
    expect(await invoke(shortcutsSave, saveShortcuts)).toMatchObject(denied);
    await choose(shortcutsList, true);
    expect(await tools()).toContainEqual(expect.objectContaining({ name: name(shortcutsList) }));
    expect(await invoke(shortcutsList)).toMatchObject({ ok: true, data: { shortcuts: [] } });
    expect(await invoke(shortcutsSave, saveShortcuts)).toMatchObject(denied);
    await choose(shortcutsSave, true);
    expect(await invoke(shortcutsSave, saveShortcuts)).toMatchObject({ ok: true, data: { shortcuts } });
    expect(await invoke(shortcutsList)).toMatchObject({ ok: true, data: { shortcuts } });
    await choose(shortcutsList, false);
    await choose(shortcutsSave, false);
    expect(await invoke(shortcutsList)).toMatchObject(denied);
    expect(await invoke(shortcutsSave, saveShortcuts)).toMatchObject(denied);

    const input = { expectedRevision: null, change: { section: "transfer", values: { parallel: 4 } } };
    const different = { ...input, change: { ...input.change, values: { parallel: 5 } } };
    const intent = randomUUID();
    expect(await invoke(get)).toMatchObject(denied);
    expect(await invoke(update, input, intent)).toMatchObject(denied);
    expect(changes).not.toHaveBeenCalled();

    await choose(get, true);
    expect(await tools()).toContainEqual(expect.objectContaining({ name: name(get) }));
    expect(await invoke(get)).toEqual({ ok: true, data: { revision: null, values: defaultVaultPreferences } });
    expect(existsSync(preferences)).toBe(false);
    expect(await invoke(update, input, intent)).toMatchObject(denied);
    await choose(get, false);
    expect(await invoke(get)).toMatchObject(denied);
    expect(existsSync(preferences)).toBe(false);

    await choose(update, true);
    expect(await tools()).toContainEqual(expect.objectContaining({ name: name(update), ...(entry === "mcp" && { _meta: expect.objectContaining({ "huhu.dev/intent-key": "required" }) }) }));
    expect(await invoke(update, input)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(changes).not.toHaveBeenCalled();
    const [saved] = await Promise.all([invoke(update, input, intent), invoke(update, input, intent, true)]);
    expect(saved).toMatchObject({ ok: true, opId: expect.any(String), data: { revision: expect.any(String), values: { ...defaultVaultPreferences, transfer: { parallel: 4 } } } });
    expect(changes).toHaveBeenCalledTimes(1);
    expect(await invoke(update, input, intent)).toEqual(saved);
    expect(await invoke(update, different, intent)).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    expect(await invoke(update, different, randomUUID())).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(changes).toHaveBeenCalledTimes(2);
    const written = readFileSync(preferences);

    await choose(get, true);
    expect(await invoke(get)).toEqual({ ok: true, data: saved?.ok ? saved.data : undefined });
    expect(readFileSync(preferences)).toEqual(written);
    await choose(get, false);
    expect(await tools()).not.toContainEqual(expect.objectContaining({ name: name(get) }));
    expect(await invoke(get)).toMatchObject(denied);

    await engine.shutdown();
    engine = await boot({ vaultPath: vault, desktopUserData: profile, moduleCredentialProtection: protection });
    if (session) {
      expect((await mcpRequest(endpoint(), token, mcpRpc("tools/list"), session.handle)).status).toBe(404);
      session = await openRecoverableMcpSession(endpoint(), token, session.recovery);
    }
    expect(await invoke(update, input, intent)).toEqual(saved);
    await choose(update, false);
    expect(await tools()).not.toContainEqual(expect.objectContaining({ name: name(update) }));
    expect(await invoke(update, input, intent)).toMatchObject(denied);
    expect(readFileSync(preferences)).toEqual(written);
    expect(changes).toHaveBeenCalledTimes(2);
    for (const sideEffect of [core, dial, credentials, schedule]) expect(sideEffect).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    await engine?.shutdown();
    rmSync(root, { force: true, recursive: true });
  }
});
