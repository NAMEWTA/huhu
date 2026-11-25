import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import path from "node:path";
import type { CapabilityCatalogEntry, CapabilityResult } from "@huhu/contracts";
import { exportPackage, importPackage } from "@huhu/vault";
import { assert, expect, test, vi } from "vitest";
import { run } from "../../../apps/cli/src/main.js";
import { mcpRequest, mcpRpc, openRecoverableMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { HerdrCore } from "../../agent-cli/src/engine/index.js";
import { createMailOAuth, mailCapabilityDescriptors, openMailAccounts, type MailDraftAttachments } from "../src/engine/index.js";
import type { MailAiReview } from "../src/engine/ai-settings.js";
import type { MailLocationTarget } from "../src/engine/conversations.js";
import manifest from "../huhu-plugin.json" with { type: "json" };
import { aiFixture, aiFixtureCert } from "./fixtures/ai.js";
import { boot, type RunningEngine } from "./fixtures/engine.js";
import { openImapFixture } from "./fixtures/imap.js";
import { loopbackSmtp } from "./fixtures/smtp.js";

const services = vi.hoisted(() => new Map<string, MailDraftAttachments>());
vi.mock("@huhu/plugin-mail/engine", async (original) => {
  const mail = await original<typeof import("../src/engine/index.js")>();
  return {
    ...mail,
    apply: ((ctx, api, owner, transport, sync, oauth, options) =>
      mail.apply(
        ctx,
        {
          ...api,
          provide(name, service) {
            api.provide(name, service);
            if (name === mail.MAIL_DRAFT_ATTACHMENTS_SERVICE) services.set(api.vault.files.root, service as MailDraftAttachments);
          },
        },
        owner,
        transport,
        sync,
        oauth,
        options,
      )) satisfies typeof mail.apply,
  };
});

const entries = ["CLI", "HTTP MCP"] as const;
type Entry = (typeof entries)[number];
type Call = <T = unknown>(capability: string, input?: unknown) => Promise<CapabilityResult<T>>;
const closed = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
const sender = "mail-matrix@example.invalid";
const receiver = "public-reader@example.invalid";
const blind = "private-bcc@example.invalid";
const password = "synthetic-exposure-password";
const aiKey = "synthetic-tool-ai-key";
const selected = "selected synthetic AI excerpt";
const privateText = "second paragraph stays local";
const question = "synthetic AI question";
const responseText = "synthetic AI output stays transient";
const body = `${selected}\r\n${privateText}`;
const accountAuth = (imap: number, smtp: number, email: string) => ({
  provider: "custom_imap" as const,
  email,
  label: "matrix",
  auth: "password" as const,
  imap: { host: "127.0.0.1", port: imap, security: "none" as const },
  smtp: { host: "127.0.0.1", port: smtp, security: "none" as const },
  smtpEnabled: true,
});
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function unwrap<T>(result: CapabilityResult<T>) {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.data;
}

function asWorkbench(engine: RunningEngine, caller: "desktop" | `web:${string}` = "desktop"): Call {
  return async <T>(capability: string, input: unknown = {}) => (await engine.dispatcher.call(caller, { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() })) as CapabilityResult<T>;
}

async function external(entry: Entry, engine: RunningEngine, token: string, recovery?: string) {
  if (entry === "CLI") {
    const cli = async <T>(...args: string[]) => {
      const output: string[] = [];
      await run([...args, "--vault", engine.vault.root, "--json"], { out: (line) => output.push(line), err: (line) => output.push(line) });
      return JSON.parse(output.join("")) as CapabilityResult<T>;
    };
    return {
      call: <T = unknown>(name: string, input: unknown = {}, intentKey?: string) => cli<T>("call", name, "--input-json", JSON.stringify(input), ...(intentKey ? ["--intent-key", intentKey] : [])),
      list: async () => unwrap(await cli<{ name: string }[]>("capabilities", "list")).map(({ name }) => name),
      recovery: undefined,
    };
  }
  const endpoint = `http://127.0.0.1:${engine.port}/mcp`;
  const session = await openRecoverableMcpSession(endpoint, token, recovery);
  const rpc = async (method: string, params: unknown) => {
    const response = await mcpRequest(endpoint, token, mcpRpc(method, params), session.handle);
    expect(response.status).toBe(200);
    return ((await response.json()) as { result: { tools?: { name: string; inputSchema: object }[]; isError?: boolean; content?: { text: string }[]; structuredContent?: { data: unknown } } }).result;
  };
  return {
    call: async <T = unknown>(name: string, input: unknown = {}, intentKey?: string): Promise<CapabilityResult<T>> => {
      const result = await rpc("tools/call", { name: name.replaceAll(".", "_"), arguments: input, ...(intentKey && { _meta: { "huhu.dev/intent-key": intentKey } }) });
      return result.isError ? { ok: false, error: JSON.parse(result.content![0]!.text) } : { ok: true, data: result.structuredContent!.data as T };
    },
    list: async () =>
      (await rpc("tools/list", {})).tools!.map(({ name, inputSchema }) => {
        expect(inputSchema).toBeTypeOf("object");
        return name.replaceAll("_", ".");
      }),
    recovery: session.recovery,
  };
}

function snapshot(root: string, dirs: string[]) {
  return dirs.flatMap((name) => {
    const dir = path.join(root, name);
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => ({ path: path.join(entry.parentPath, entry.name), hash: sha(readFileSync(path.join(entry.parentPath, entry.name)).toString("base64")) }))
      .sort((a, b) => a.path.localeCompare(b.path));
  });
}

function readText(root: string, predicate: (name: string) => boolean) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => readFileSync(path.join(entry.parentPath, entry.name), "utf8"))
    .join("\n");
}

test("Mail 静态目录完整，默认关闭且秘密编辑和工作台批准不可外授", () => {
  const catalog = mailCapabilityDescriptors.map(({ name }) => name).sort();
  expect(catalog).toEqual([...new Set(manifest.contributes.capabilities)].sort());
  expect(mailCapabilityDescriptors.every(({ defaultExposed }) => defaultExposed === false)).toBe(true);
  expect(
    mailCapabilityDescriptors
      .filter(({ exposable }) => !exposable)
      .map(({ name }) => name)
      .sort(),
  ).toEqual(["mail.ai.approvals.approve", "mail.ai.approvals.cancel", "mail.ai.approvals.review", "mail.ai.saveSettings", "mail.ai.verifyConnection", "mail.drafts.beginAttachmentUpload", "mail.drafts.cancelAttachmentUpload"]);
});

test.each(entries)(
  "保险箱锁定时 Mail 仍可按授权认证，整库包恢复定义和受管附件（%s）",
  async (entry) => {
    const root = mkdtempSync(path.join(tmpdir(), "huhu-portable-vault-"));
    const vaultPath = path.join(root, "vault");
    const desktopUserData = path.join(root, "desktop");
    mkdirSync(vaultPath);
    mkdirSync(desktopUserData);
    const message = { uidValidity: 31, uid: 9, subject: "备份夹具", source: "From: sender@example.invalid\r\nSubject: backup fixture\r\n\r\nBody" };
    const imap = await openImapFixture({ windows: { INBOX: { uidValidity: 31, messages: [message] } }, acceptPassword: (value) => value === password });
    const smtp = await loopbackSmtp(password);
    const engines: RunningEngine[] = [];
    const start = async (vaultPath: string, create = false) => {
      const engine = await boot({ vaultPath, desktopUserData, create });
      engines.push(engine);
      return engine;
    };
    try {
      const engine = await start(vaultPath, true);
      const desktop = asWorkbench(engine);
      const changeAccess = async (capability: string, exposed: boolean) => unwrap(await desktop("gateway.update", { capability, exposed }));
      const { token } = unwrap(await desktop<{ token: string }>("gateway.tokens.create", { name: "临时包测试" }));
      unwrap(await desktop("gateway.mcp.update", { enabled: true }));
      const tool = await external(entry, engine, token);
      expect(await tool.list()).not.toContain("mail.sync.refresh");
      expect(await tool.call("mail.accounts.list")).toMatchObject(closed);
      expect(await tool.call("safe.accounts.reveal")).toMatchObject(closed);

      const { setupId } = unwrap(await desktop<{ setupId: string }>("mail.accounts.testConnection", { requestId: randomUUID(), settings: accountAuth(imap.port, smtp.port, sender), password }));
      const { accountId } = unwrap(await desktop<{ accountId: string }>("mail.accounts.save", { setupId, folders: ["INBOX"] }));
      type AccountList = { accounts: { accountId: string; revision: string; authState: Record<string, string> }[] };
      const { revision } = unwrap(await desktop<AccountList>("mail.accounts.list")).accounts[0]!;
      const sshSecret = `ssh-${randomUUID()}`;
      const { hostId } = unwrap(
        await desktop<{ hostId: string }>("ssh.hosts.configure", {
          name: "备份测试主机",
          host: "127.0.0.1",
          user: "fixture",
          authKind: "password",
          expectedRevision: null,
          credentials: [{ purpose: "password", action: "replace", value: sshSecret }],
        }),
      );
      const safePassword = `safe-${randomUUID()}`;
      const safeSecrets = [randomUUID(), randomUUID(), randomUUID()];
      const accounts = safeSecrets.map((password, i) => ({ account: `账号 ${i + 1}`, password }));
      unwrap(await desktop("safe.setup", { password: safePassword }));
      const session = unwrap(await desktop("safe.status"));
      const { tagId } = unwrap(await desktop<{ tagId: string }>("safe.tags.create", { session, expectedRevision: 0, name: "归档夹具", color: "purple" }));
      const { entryId, accountIds } = unwrap(await desktop<{ entryId: string; accountIds: string[] }>("safe.entries.create", { session, expectedRevision: 1, name: "恢复夹具", accounts, tagIds: [tagId] }));
      unwrap(await desktop("safe.lock"));
      expect(unwrap(await desktop("safe.status"))).toMatchObject({ initialized: true, locked: true });

      const logins = () => imap.commands.filter((command) => command === "LOGIN").length;
      const refresh = () => ({ accountId, folder: "INBOX", expectedRevision: revision, requestId: randomUUID() });
      expect(await tool.call("mail.sync.refresh", refresh())).toMatchObject(closed);
      await changeAccess("mail.accounts.list", true);
      await changeAccess("mail.sync.refresh", true);
      expect(unwrap(await tool.call<AccountList>("mail.accounts.list")).accounts).toMatchObject([{ accountId }]);
      const before = logins();
      expect(unwrap(await tool.call("mail.sync.refresh", refresh()))).toMatchObject({ message: { localMessageId: expect.any(String) } });
      expect(logins()).toBeGreaterThan(before);
      await changeAccess("mail.sync.refresh", false);
      expect(await tool.list()).not.toContain("mail.sync.refresh");
      const after = logins();
      expect(await tool.call("mail.sync.refresh", refresh())).toMatchObject(closed);
      expect(logins()).toBe(after);
      expect(unwrap(await desktop("mail.sync.refresh", refresh()))).toMatchObject({ message: { localMessageId: expect.any(String) } });
      expect(unwrap(await desktop("safe.status"))).toMatchObject({ locked: true });

      const draftId = randomUUID();
      const { revision: draftRevision } = unwrap(await desktop<{ revision: string }>("mail.drafts.save", { draftId, expectedRevision: null, draft: { accountId, subject: "恢复附件", to: [], cc: [], bcc: [], body: { type: "doc" } } }));
      const managed = services.get(vaultPath);
      assert(managed);
      const bytes = Buffer.from("只保存已引用的合成附件。");
      const attachmentDigest = createHash("sha256").update(bytes).digest("hex");
      const attachment = `.huhu/mail/attachments/${attachmentDigest}`;
      await managed.addAttachment(
        { draftId, expectedRevision: draftRevision },
        {
          name: "fixture.txt",
          size: bytes.length,
          async *read() {
            yield bytes;
          },
        },
      );

      const packageId = randomUUID();
      const extraDefinition = ".huhu/module-credentials/fixture-private.json";
      await engine.vault.files.write(extraDefinition, Buffer.from("仅用于测试范围的合成文件"));
      expect(await tool.call("vault.exportPackage", { packageId })).toMatchObject(closed);
      await changeAccess("vault.exportPackage", true);
      await changeAccess("vault.importPackage", true);
      const backup = unwrap(await tool.call<{ path: string; sha256: string }>("vault.exportPackage", { packageId, includeAttachments: false }, randomUUID()));
      expect(backup.sha256).toBe(createHash("sha256").update(readFileSync(backup.path)).digest("hex"));
      const restore = unwrap(await tool.call<{ vaultId: string; targetDir: string }>("vault.importPackage", { packageId, expectedSha256: backup.sha256, restoreId: randomUUID() }, randomUUID()));
      expect(restore.vaultId).not.toBe(engine.vault.id);
      expect(readFileSync(path.join(restore.targetDir, attachment))).toEqual(bytes);
      expect(existsSync(path.join(restore.targetDir, ".huhu/gateways.json"))).toBe(false);
      expect(existsSync(path.join(restore.targetDir, ".huhu/runtime"))).toBe(false);
      expect(existsSync(path.join(restore.targetDir, extraDefinition))).toBe(false);
      const exported = readText(restore.targetDir, () => true);
      for (const secret of [password, sshSecret, safePassword, ...safeSecrets]) expect(exported).not.toContain(secret);

      const reopened = asWorkbench(await start(restore.targetDir));
      expect(unwrap(await reopened<AccountList>("mail.accounts.list")).accounts).toMatchObject([{ accountId, authState: { "account-password": "needs-reconfiguration" } }]);
      expect(unwrap(await reopened("mail.drafts.get", { draftId }))).toMatchObject({ draft: { accountId, attachments: [{ digest: attachmentDigest }] } });
      expect(unwrap(await reopened("ssh.hosts.list"))).toMatchObject([{ id: hostId, configured: false }]);
      unwrap(await reopened("safe.unlock", { password: safePassword }));
      const restoredSession = unwrap(await reopened("safe.status"));
      expect(unwrap(await reopened("safe.entries.get", { session: restoredSession, entryId }))).toMatchObject({ tagIds: [tagId], accounts: accounts.map(({ account }) => ({ account })) });
      for (const [i, accountId] of accountIds.entries()) expect(unwrap(await reopened("safe.accounts.reveal", { session: restoredSession, entryId, accountId }))).toMatchObject({ password: safeSecrets[i] });
      expect(smtp.counts.data).toBe(0);

      if (entry === "CLI") {
        for (const [name, omitted, problem] of [
          ["safe", ".huhu/safe/current/keyring.json", "保险箱"],
          ["mail", attachment, "邮件"],
        ]) {
          const incomplete = path.join(root, `${name}-missing.zip`);
          await exportPackage(vaultPath, incomplete, { includeFile: (file) => file !== omitted });
          const targetDir = path.join(root, `${name}-rejected`);
          mkdirSync(targetDir);
          expect(await desktop("vault.importPackage", { zipPath: incomplete, targetDir })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", message: expect.stringContaining(problem!) } });
          expect(readdirSync(targetDir)).toEqual([]);
        }

        const newSafePassword = `safe-${randomUUID()}`;
        unwrap(await desktop("safe.unlock", { password: safePassword }));
        const beforeRotation = unwrap(await desktop("safe.status"));
        unwrap(await desktop("safe.changePassword", { session: beforeRotation, oldPassword: safePassword, newPassword: newSafePassword }));
        unwrap(await desktop("safe.lock"));
        const zipPath = path.join(root, "after-password-change.zip");
        unwrap(await desktop("vault.exportPackage", { dest: zipPath }));
        const targetDir = path.join(root, "after-password-change");
        unwrap(await desktop("vault.importPackage", { zipPath, targetDir }));
        const rotated = asWorkbench(await start(targetDir));
        expect(await rotated("safe.unlock", { password: safePassword })).toMatchObject({ ok: false, error: { code: "SAFE_BAD_PASSWORD" } });
        unwrap(await rotated("safe.unlock", { password: newSafePassword }));
        const afterRotation = unwrap(await rotated("safe.status"));
        expect(unwrap(await rotated("safe.entries.get", { session: afterRotation, entryId }))).toMatchObject({ tagIds: [tagId], accounts: accounts.map(({ account }) => ({ account })) });
        for (const [i, accountId] of accountIds.entries()) expect(unwrap(await rotated("safe.accounts.reveal", { session: afterRotation, entryId, accountId }))).toMatchObject({ password: safeSecrets[i] });
      }
    } finally {
      await Promise.all(engines.map((engine) => engine.shutdown()));
      services.clear();
      await imap.close();
      await smtp.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  },
  60_000,
);

test.each(entries)(
  "Mail 逐项默认关、开放、撤销、领域重交及 AI 一次性批准（%s）",
  async (entry) => {
    const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-tools-"));
    const desktopUserData = path.join(root, "desktop");
    const vaultPath = path.join(root, "vault");
    const sourcePath = path.join(root, "source");
    const restoredPath = path.join(root, "export");
    for (const dir of [desktopUserData, vaultPath, sourcePath, restoredPath]) mkdirSync(dir);

    const mail = {
      uidValidity: 32,
      uid: 11,
      subject: "public exposure fixture",
      source: [`From: ${receiver}`, `To: ${sender}`, `Bcc: ${blind}`, "Message-ID: <external-fixture@example.invalid>", "Subject: public exposure fixture", "", body].join("\r\n"),
    };
    const inbox = { uidValidity: 32, messages: [mail] };
    const imap = await openImapFixture({ windows: { INBOX: inbox }, acceptPassword: (value) => value === password });
    const smtp = await loopbackSmtp(password);
    const ca = getCACertificates("default");
    setDefaultCACertificates([...ca, readFileSync(aiFixtureCert, "utf8")]);
    const ai = await aiFixture(true);
    const otherAi = await aiFixture();
    const oauthOpens: string[] = [];
    const oauth = createMailOAuth(
      { google: { clientId: "synthetic-mail-client" } },
      {
        hostLabel: "synthetic Engine",
        openBrowser: async (url) => {
          oauthOpens.push(url);
        },
      },
    );
    const ensure = vi.spyOn(HerdrCore.prototype, "ensure");
    const engines = new Set<RunningEngine>();
    async function start(location: string, create: boolean) {
      const engine = await boot({ vaultPath: location, create, desktopUserData, mailOAuth: oauth });
      engines.add(engine);
      return engine;
    }
    async function stop(engine: RunningEngine) {
      await engine.shutdown();
      engines.delete(engine);
    }
    const businessDirs = [".huhu/mail", ".huhu/cache/mail", ".huhu/module-credentials"];
    const effects = () => [imap.commands.length, smtp.counts.connections, smtp.counts.data, ai.requests.length, otherAi.requests.length, oauthOpens.length, ensure.mock.calls.length];

    try {
      let engine = await start(vaultPath, true);
      const events: unknown[] = [];
      engine.events.subscribe((event) => events.push(event));
      let desktop = asWorkbench(engine);
      const { token } = unwrap(await desktop<{ token: string }>("gateway.tokens.create", { name: "Mail matrix" }));
      unwrap(await desktop("gateway.mcp.update", { enabled: true }));
      let tool = await external(entry, engine, token);
      const configure = async (capability: string, exposed: boolean) => unwrap(await desktop<{ revision: number }>("gateway.update", { capability, exposed }));
      const catalog = unwrap(await desktop<CapabilityCatalogEntry[]>("capabilities.list", { includeInactive: true })).filter(({ plugin }) => plugin === "mail");
      const names = catalog.map(({ name }) => name).sort();
      expect(names).toEqual([...manifest.contributes.capabilities].sort());
      expect(names).toEqual(mailCapabilityDescriptors.map(({ name }) => name).sort());
      expect(catalog.every(({ selected, exposed, risk }) => exposed === false && selected === false && risk)).toBe(true);
      expect((await tool.list()).filter((id) => id.startsWith("mail."))).toEqual([]);
      const tested = new Set<string>();
      const retry = new Map<string, { input: unknown; expected: unknown; transient?: boolean }>();

      async function exercise<T>(id: string, input: unknown, check?: (data: T) => void | Promise<void>, options: { replay?: boolean; duplicate?: boolean; transient?: boolean; pending?: boolean } = {}) {
        const descriptor = mailCapabilityDescriptors.find(({ name }) => name === id);
        assert(descriptor);
        const initial = effects();
        expect(await tool.list()).not.toContain(id);
        expect(await tool.call(id, input)).toMatchObject(closed);
        expect(effects()).toEqual(initial);
        await configure(id, true);
        expect(await tool.list()).toContain(id);
        const before = snapshot(vaultPath, businessDirs);
        const results = options.duplicate ? await Promise.all([tool.call<T>(id, input), tool.call<T>(id, input)]) : [await tool.call<T>(id, input)];
        expect(results[0], id).toMatchObject({ ok: true });
        const value = unwrap(results[0]!);
        expect(descriptor.output.safeParse(value).success, id).toBe(true);
        for (const result of results.slice(1)) expect(unwrap(result)).toEqual(value);
        if (descriptor.scope === "read") {
          expect(snapshot(vaultPath, businessDirs)).toEqual(before);
          expect(effects(), id).toEqual(initial);
        }
        await check?.(value);
        if (options.replay) retry.set(id, { input, expected: value, ...(options.transient && { transient: true }) });
        const settled = effects();
        const committed = snapshot(vaultPath, businessDirs);
        if (!options.pending) await configure(id, false);
        if (!options.pending) {
          expect(await tool.list()).not.toContain(id);
          expect(await tool.call(id, input)).toMatchObject(closed);
          expect(effects(), id).toEqual(settled);
          expect(snapshot(vaultPath, businessDirs)).toEqual(committed);
        }
        tested.add(id);
        return value;
      }

      const blocked = catalog.filter(({ exposable }) => !exposable);
      for (const { name } of blocked) {
        expect(await tool.call(name, {})).toMatchObject(closed);
        expect(await desktop("gateway.update", { capability: name, exposed: true })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      }
      const bulk = catalog.filter(({ exposable }) => exposable).map(({ name }) => ({ capability: name, exposed: true }));
      const bulkCheck = unwrap(await desktop<{ targets: { capability: string }[] }>("gateway.policy.preview", { changes: bulk }));
      expect(bulkCheck.targets.map(({ capability }) => capability).sort()).toEqual(bulk.map(({ capability }) => capability).sort());
      expect(await desktop("gateway.policy.preview", { changes: [...bulk, { capability: "mail.ai.saveSettings", exposed: true }] })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

      await exercise("mail.accounts.list", {}, (data) => {
        expect(data).toMatchObject({ accounts: [] });
      });
      await exercise("mail.cache.usage", {}, (data) => {
        expect(data).toMatchObject({ files: 0 });
      });
      await exercise("mail.oauth.availability", {}, (data) => {
        expect(data).toMatchObject({ gmail: true });
      });
      const setupInput = { requestId: randomUUID(), settings: accountAuth(imap.port, smtp.port, sender), password };
      const { setupId } = await exercise<{ setupId: string }>(
        "mail.accounts.testConnection",
        setupInput,
        () => {
          expect(imap.commands.filter((verb) => verb === "LOGIN")).toHaveLength(1);
        },
        { duplicate: true, replay: true, transient: true },
      );
      if (entry === "HTTP MCP") {
        await configure("mail.accounts.save", true);
        const sibling = await external(entry, engine, token);
        expect(await sibling.call("mail.accounts.save", { setupId, folders: ["INBOX"] })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
        await configure("mail.accounts.save", false);
      }
      const { accountId } = await exercise<{ accountId: string }>("mail.accounts.save", { setupId, folders: ["INBOX"] }, undefined, { duplicate: true, replay: true });
      const accounts = async () => unwrap(await desktop<{ accounts: { accountId: string; revision: string }[] }>("mail.accounts.list"));
      const { revision: initialRevision } = (await accounts()).accounts[0]!;
      const { revision } = await exercise<{ revision: string }>("mail.accounts.rename", { accountId, expectedRevision: initialRevision, label: "new matrix label" }, undefined, { duplicate: true, replay: true });
      await configure("mail.accounts.testConnection", true);
      const { setupId: cancelSetupId } = unwrap(await tool.call<{ setupId: string }>("mail.accounts.testConnection", { ...setupInput, requestId: randomUUID(), settings: accountAuth(imap.port, smtp.port, "cancel@example.invalid") }));
      await configure("mail.accounts.testConnection", false);
      await exercise("mail.accounts.cancelSetup", { setupId: cancelSetupId }, undefined, { duplicate: true, replay: true });
      await exercise(
        "mail.oauth.begin",
        { requestId: randomUUID(), provider: "gmail", email: "oauth-matrix@example.invalid" },
        (data) => {
          expect(data).toMatchObject({ phase: "waiting" });
          expect(oauthOpens).toHaveLength(1);
        },
        { duplicate: true },
      );
      await configure("mail.oauth.begin", true);
      const beginInput = { requestId: randomUUID(), provider: "gmail", email: "cancel-oauth-matrix@example.invalid" };
      const { sessionId } = unwrap(await tool.call<{ sessionId: string }>("mail.oauth.begin", beginInput));
      await configure("mail.oauth.begin", false);
      await exercise("mail.oauth.status", { sessionId }, (data) => {
        expect(data).toMatchObject({ phase: "waiting" });
      });
      const cancelOAuth = { sessionId, requestId: randomUUID() };
      await exercise(
        "mail.oauth.cancel",
        cancelOAuth,
        (data) => {
          expect(data).toMatchObject({ phase: "cancelled" });
        },
        { duplicate: true, replay: true },
      );

      const box = { accountId, folder: "INBOX" };
      const refreshInput = { ...box, requestId: randomUUID(), expectedRevision: revision };
      const { message } = await exercise<{ message: { localMessageId: string } }>("mail.sync.refresh", refreshInput, undefined, { duplicate: true });
      await configure("mail.sync.refresh", true);
      const refreshEffects = effects();
      expect(unwrap(await tool.call("mail.sync.refresh", refreshInput))).toMatchObject({ message });
      expect(effects()).toEqual(refreshEffects);
      await configure("mail.sync.refresh", false);
      const key = { ...box, localMessageId: message.localMessageId };
      await exercise("mail.messages.latest", box, (data) => {
        expect(data).toMatchObject({ message: key });
      });
      await exercise("mail.messages.loadSource", key, (data) => {
        expect(data).toMatchObject({ state: "ready" });
      });
      const { sourceDigest, body: loadedBody } = await exercise<{ sourceDigest: string; body: { text: string } }>("mail.messages.loadBody", key);
      expect(loadedBody.text).toContain(privateText);
      await exercise("mail.messages.loadRemoteImages", { ...key, sourceDigest, view: "mailbox" }, (data) => {
        expect(data).toEqual({ images: [], failed: 0 });
      });
      await exercise("mail.conversations.loadBody", key, (data) => {
        expect(data).toMatchObject({ state: "ready" });
      });
      const { conversations } = await exercise<{ conversations: { conversationId: string; latest: { uid: number; uidValidity: string } }[] }>("mail.conversations.list", { accountId }, (data) => {
        expect(JSON.stringify(data)).not.toContain(blind);
      });
      const { conversationId } = conversations[0]!;
      await exercise("mail.conversations.messages", { accountId, conversationId }, (data) => {
        expect(data).toMatchObject({ total: 1 });
      });
      const { hits } = await exercise<{ hits: { target: MailLocationTarget }[] }>("mail.conversations.search", { accountId, text: "synthetic AI" });
      await exercise("mail.conversations.findMessage", { target: hits[0]!.target }, (data) => {
        expect(data).toMatchObject({ conversationId });
      });
      await exercise("mail.messages.prepareReply", { ...key, mode: "reply-all" }, (data) => {
        expect(JSON.stringify(data)).not.toContain(blind);
      });
      await exercise("mail.messages.prepareForward", key, (data) => {
        expect(data).toMatchObject({ accountId });
      });
      await exercise("mail.messages.prepareNewTopic", key, (data) => {
        expect(data).toMatchObject({ to: [receiver] });
      });
      await exercise("mail.sync.status", box, (data) => {
        expect(data).toMatchObject({ transport: "imap" });
      });
      const notice = `ntf-mail-${sha([engine.vault.id, engine.vault.root, key.localMessageId])}`;
      await exercise("mail.notifications.target", { id: notice }, (data) => {
        expect(data).toMatchObject(key);
      });
      await exercise(
        "mail.messages.markRead",
        { ...key, requestId: randomUUID(), expectedRevision: revision },
        () => {
          expect(imap.storeRequests).toHaveLength(1);
        },
        { duplicate: true, replay: true },
      );
      const schedule = await exercise<{ revision: string | null }>("mail.sync.settings", {});
      await exercise("mail.sync.setInterval", { minutes: 0, expectedRevision: schedule.revision }, undefined, { duplicate: true, replay: true });

      const settings = { enabled: true, expectedRevision: null, endpoint: ai.url, model: "fixture-ai", key: { action: "replace", value: aiKey } };
      const { revision: settingsRevision } = unwrap(await desktop<{ revision: string }>("mail.ai.saveSettings", settings));
      await exercise("mail.ai.getSettings", {}, (data) => {
        expect(data).toMatchObject({ revision: settingsRevision, model: settings.model });
      });
      const prepare = "mail.ai.prepare";
      const chat = "mail.ai.chat";
      const source = { ...key, accountRevision: revision, sourceDigest, start: 0, end: selected.length };
      const prepareInput = { requestId: randomUUID(), source, settingsRevision, question, mode: "chat" };
      expect(await tool.call(chat, { approvalId: randomUUID() })).toMatchObject(closed);
      await configure(chat, true);
      const { approvalId } = await exercise<{ approvalId: string }>(
        prepare,
        prepareInput,
        (data) => {
          expect(data).toMatchObject({ state: "pending" });
          expect(ai.requests).toHaveLength(1);
        },
        { duplicate: true, pending: true },
      );
      const chatInput = { approvalId };
      expect(await tool.call(chat, chatInput)).toMatchObject({ ok: false, error: { details: { reason: "approval-required" } } });
      expect(await tool.call(chat, { ...chatInput, confirmed: true, mode: "chat", excerpt: selected, question })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(ai.requests).toHaveLength(1);
      const reviewer = entry === "CLI" ? desktop : asWorkbench(engine, "web:mail-exposure-fixture");
      const review = unwrap(await reviewer<{ requests: MailAiReview[] }>("mail.ai.approvals.review")).requests[0]!;
      expect(review).toMatchObject({ approvalId, email: sender, source, excerpt: selected, question, settingsRevision });
      const decision = { approvalId, digest: review.digest };
      expect(await reviewer("mail.ai.approvals.approve", { ...decision, digest: "0".repeat(64) })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      unwrap(await reviewer("mail.ai.approvals.approve", decision));
      if (entry === "HTTP MCP") {
        const sibling = await external(entry, engine, token);
        expect(await sibling.call(chat, chatInput)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      }
      ai.behavior.text = responseText;
      const [reply, duplicate] = await Promise.all([tool.call(chat, chatInput), tool.call(chat, chatInput)]);
      expect(reply).toEqual({ ok: true, data: { text: responseText } });
      expect(duplicate).toMatchObject({ ok: true });
      expect(await tool.call(chat, chatInput)).toEqual({ ok: true, data: { state: "completed" } });
      expect(ai.requests).toHaveLength(2);
      expect(ai.requests[1]?.authorization).toBe(`Bearer ${aiKey}`);
      expect(JSON.stringify(ai.requests[1]?.body)).toContain(selected);
      expect(JSON.stringify(ai.requests[1]?.body)).toContain(question);
      expect(JSON.stringify(ai.requests[1]?.body)).not.toContain(privateText);
      retry.set(chat, { input: chatInput, expected: { state: "completed" } });
      retry.set(prepare, { input: prepareInput, expected: undefined, transient: true });
      tested.add(chat);
      const pending = unwrap(await tool.call<{ approvalId: string }>(prepare, { ...prepareInput, requestId: randomUUID() }));
      const reviewed = unwrap(await reviewer<{ requests: MailAiReview[] }>("mail.ai.approvals.review")).requests[0]!;
      unwrap(await reviewer("mail.ai.approvals.approve", { approvalId: pending.approvalId, digest: reviewed.digest }));
      await configure(chat, false);
      expect(await tool.call(chat, chatInput)).toMatchObject(closed);
      expect(await tool.call(chat, { approvalId: pending.approvalId })).toMatchObject(closed);
      await configure(chat, true);
      expect(await tool.call(chat, { approvalId: pending.approvalId })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      const cancelled = unwrap(await tool.call<{ approvalId: string }>(prepare, { ...prepareInput, requestId: randomUUID() }));
      const cancelReview = unwrap(await reviewer<{ requests: MailAiReview[] }>("mail.ai.approvals.review")).requests[0]!;
      unwrap(await reviewer("mail.ai.approvals.cancel", { approvalId: cancelled.approvalId, digest: cancelReview.digest }));
      expect(await tool.call(chat, { approvalId: cancelled.approvalId })).toMatchObject({ ok: false });
      const preparedForOldSettings = unwrap(await tool.call<{ approvalId: string }>(prepare, { ...prepareInput, requestId: randomUUID() }));
      const oldReview = unwrap(await reviewer<{ requests: MailAiReview[] }>("mail.ai.approvals.review")).requests[0]!;
      unwrap(await reviewer("mail.ai.approvals.approve", { approvalId: preparedForOldSettings.approvalId, digest: oldReview.digest }));
      unwrap(await desktop("mail.ai.saveSettings", { ...settings, expectedRevision: settingsRevision, endpoint: otherAi.url, key: { action: "clear" } }));
      expect(await tool.call(chat, { approvalId: preparedForOldSettings.approvalId })).toMatchObject({ ok: false });
      expect(otherAi.requests).toHaveLength(1);
      await configure(chat, false);
      await configure(prepare, false);
      expect(await tool.call(prepare, prepareInput)).toMatchObject(closed);
      expect((await tool.list()).filter((id) => id === prepare || id === chat)).toEqual([]);
      expect(ai.requests).toHaveLength(2);

      const regularDraft = { accountId, to: [receiver], cc: [], bcc: [blind], subject: "matrix draft", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "synthetic draft body" }] }] } };
      const draftId = randomUUID();
      const draft = await exercise<{ revision: string }>("mail.drafts.save", { draftId, expectedRevision: null, draft: regularDraft }, undefined, { duplicate: true });
      await exercise("mail.drafts.list", {}, (data) => {
        expect(data).toMatchObject({ drafts: [{ draftId }] });
      });
      await exercise("mail.drafts.get", { draftId }, (data) => {
        expect(data).toMatchObject({ draft: { draftId } });
      });
      const attachment = Buffer.from("synthetic attachment");
      const attach = await services.get(vaultPath)!.addAttachment(
        { draftId, expectedRevision: draft.revision },
        {
          name: "fixture.txt",
          size: attachment.length,
          async *read() {
            yield attachment;
          },
        },
      );
      const updated = await exercise<{ revision: string }>("mail.drafts.removeAttachment", { draftId, expectedRevision: attach.draft.revision, digest: attach.draft.attachments![0]!.digest }, undefined, { duplicate: true, replay: true });
      smtp.configure("lose-reply");
      const unknownInput = { draftId, expectedRevision: updated.revision };
      const unknown = await exercise<{ operationId: string }>(
        "mail.outbox.submit",
        unknownInput,
        async ({ operationId }) => {
          await expect.poll(async () => unwrap(await desktop("mail.outbox.status", { operationId }))).toMatchObject({ state: "unknown" });
          expect(smtp.counts.data).toBe(1);
        },
        { duplicate: true, replay: true },
      );
      await exercise("mail.outbox.status", { operationId: unknown.operationId }, (data) => {
        expect(data).toMatchObject({ state: "unknown", retryableRecipients: [] });
      });
      await exercise("mail.outbox.list", {}, (data) => {
        expect(data).toMatchObject({ operations: [{ operationId: unknown.operationId }] });
      });
      await configure("mail.outbox.retry", true);
      expect(await tool.call("mail.outbox.retry", { parentOperationId: unknown.operationId, expectedRevision: updated.revision, recipients: [receiver] })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      await configure("mail.outbox.retry", false);
      expect(smtp.counts.data).toBe(1);
      const retryDraftId = randomUUID();
      const { revision: sendRevision } = unwrap(await desktop<{ revision: string }>("mail.drafts.save", { draftId: retryDraftId, expectedRevision: null, draft: { ...regularDraft, to: [receiver, "refused@example.invalid"] } }));
      smtp.configure("partial");
      const parent = unwrap(await desktop<{ operationId: string }>("mail.outbox.submit", { draftId: retryDraftId, expectedRevision: sendRevision }));
      await expect.poll(async () => unwrap(await desktop("mail.outbox.status", { operationId: parent.operationId }))).toMatchObject({ state: "partially-accepted" });
      await exercise("mail.conversations.sentBody", { operationId: parent.operationId, accountId }, (data) => {
        expect(data).toEqual({ text: "synthetic draft body\n" });
      });
      smtp.configure("accept");
      const child = await exercise<{ operationId: string }>(
        "mail.outbox.retry",
        { parentOperationId: parent.operationId, expectedRevision: sendRevision, recipients: ["refused@example.invalid"] },
        async ({ operationId }) => {
          await expect.poll(async () => unwrap(await desktop("mail.outbox.status", { operationId }))).toMatchObject({ state: "accepted" });
          expect(smtp.counts.data).toBe(3);
        },
        { duplicate: true, replay: true },
      );
      await configure("mail.outbox.status", true);
      const childStatus = unwrap(await tool.call<{ recordVersion: string }>("mail.outbox.status", { operationId: child.operationId }));
      await configure("mail.outbox.status", false);
      await exercise("mail.outbox.deleteLocal", { operationId: child.operationId, expectedVersion: childStatus.recordVersion }, undefined, { duplicate: true, replay: true });
      const discardId = randomUUID();
      const { revision: discardRevision } = unwrap(await desktop<{ revision: string }>("mail.drafts.save", { draftId: discardId, expectedRevision: null, draft: regularDraft }));
      await exercise("mail.drafts.discard", { draftId: discardId, expectedRevision: discardRevision }, undefined, { duplicate: true, replay: true });

      await exercise("mail.subset.create", { accountIds: [accountId] }, (data) => {
        expect(data).toMatchObject({ content: expect.any(String) });
      });
      const original = await start(sourcePath, true);
      assert(original.moduleCredentialHost);
      const sourceAccount = openMailAccounts({ ...original.moduleCredentialHost, vault: original.vault }, async () => [{ path: "INBOX", name: "INBOX", delimiter: "/", flags: [], specialUse: null }]);
      const separate = sourceAccount.begin(accountAuth(imap.port, smtp.port, "portable@example.invalid"), password);
      await separate.testConnection();
      const portable = await separate.save();
      const packet = unwrap(await asWorkbench(original)<{ content: string }>("mail.subset.create", { accountIds: [portable.accountId] }));
      await stop(original);
      const previewInput = { ...packet, requestId: randomUUID() };
      const preview = await exercise<{ previewId: string }>("mail.subset.preview", previewInput, undefined, { duplicate: true, replay: true, transient: true });
      await configure("mail.subset.preview", true);
      const cancellable = unwrap(await tool.call<{ previewId: string }>("mail.subset.preview", { ...packet, requestId: randomUUID() }));
      await configure("mail.subset.preview", false);
      await exercise("mail.subset.cancel", { previewId: cancellable.previewId }, undefined, { duplicate: true, replay: true });
      await exercise("mail.subset.restore", { previewId: preview.previewId, accountIds: [portable.accountId], confirm: true }, undefined, { duplicate: true, replay: true });
      const imported = (await accounts()).accounts.find((account) => account.accountId === portable.accountId);
      assert(imported);
      assert(engine.moduleCredentialHost);
      const removableAccount = openMailAccounts({ ...engine.moduleCredentialHost, vault: engine.vault }, async () => [{ path: "INBOX", name: "INBOX", delimiter: "/", flags: [], specialUse: null }]);
      const toRemove = removableAccount.begin(accountAuth(imap.port, smtp.port, "removable@example.invalid"), password);
      await toRemove.testConnection();
      const restored = await toRemove.save();
      const removal = await exercise<{ impactKey: string }>("mail.accounts.previewRemoval", { accountId: restored.accountId, expectedRevision: restored.revision });
      await exercise("mail.accounts.remove", { accountId: restored.accountId, expectedRevision: restored.revision, impactKey: removal.impactKey }, undefined, { duplicate: true, replay: true });
      const archive = path.join(root, "vault.zip");
      await exportPackage(engine.vault.root, archive);
      await importPackage(archive, restoredPath);
      const exported = readText(restoredPath, () => true);
      for (const secret of [password, aiKey, selected, question, responseText, privateText]) expect(exported).not.toContain(secret);

      await configure("mail.cache.usage", true);
      const { revision: cacheRevision } = unwrap(await tool.call<{ revision: string }>("mail.cache.usage"));
      await configure("mail.cache.usage", false);
      await exercise("mail.cache.clear", { confirm: true, expectedRevision: cacheRevision, requestId: randomUUID() }, undefined, { duplicate: true, replay: true });

      expect([...tested].sort()).toEqual(
        catalog
          .filter(({ exposable }) => exposable)
          .map(({ name }) => name)
          .sort(),
      );
      expect(await tool.call("mail.accounts.list")).toMatchObject(closed);
      expect(ensure).not.toHaveBeenCalled();
      const secretFiles = () => readText(root, (name) => name.endsWith(".ndjson") || name.endsWith(".log"));
      for (const secret of [password, aiKey, selected, question, responseText, privateText]) {
        expect(secretFiles()).not.toContain(secret);
        expect(JSON.stringify(events)).not.toContain(secret);
      }

      for (const id of [...retry.keys(), "mail.accounts.list", "mail.oauth.status", "mail.outbox.status"]) await configure(id, true);
      const totals = effects();
      await stop(engine);
      engine = await start(vaultPath, false);
      desktop = asWorkbench(engine);
      tool = await external(entry, engine, token, tool.recovery);
      const disk = snapshot(vaultPath, businessDirs);
      for (const [name, { input, expected, transient }] of retry) {
        const result = await tool.call(name, input);
        if (entry === "HTTP MCP") expect(result, name).toMatchObject({ ok: false, error: { details: { outcome: "unknown" } } });
        else if (transient) expect(result, name).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
        else expect(result, name).toEqual({ ok: true, data: expected });
      }
      const reopened = unwrap(await tool.call<{ available: boolean; accounts: { accountId: string }[] }>("mail.accounts.list"));
      const folder = { path: "INBOX", name: "INBOX" };
      const visibleDefinition = (email: string, label: string) => ({
        settings: { email, label, provider: "custom_imap", auth: "password", smtpEnabled: true },
        folders: [folder],
      });
      expect(reopened).toEqual({
        available: true,
        accounts: expect.arrayContaining([
          { accountId, revision, authState: { "account-password": "configured" }, definition: visibleDefinition(sender, "new matrix label") },
          { accountId: imported.accountId, revision: imported.revision, authState: { "account-password": "unconfigured" }, definition: visibleDefinition("portable@example.invalid", "matrix") },
        ]),
      });
      expect(reopened.accounts).toHaveLength(2);
      expect(await tool.call("mail.oauth.status", { sessionId })).toMatchObject({ ok: true, data: { phase: "cancelled" } });
      expect(await tool.call("mail.outbox.status", { operationId: unknown.operationId })).toMatchObject({ ok: true, data: { state: "unknown" } });
      expect(effects()).toEqual(totals);
      expect(snapshot(vaultPath, businessDirs)).toEqual(disk);
      console.log(
        JSON.stringify({
          entry,
          tested: tested.size,
          closed: blocked.length,
          replayed: retry.size,
          smtpData: smtp.counts.data,
          imapStores: imap.storeRequests.length,
          aiSends: ai.requests.length - 1,
          coreLaunches: ensure.mock.calls.length,
        }),
      );
    } finally {
      setDefaultCACertificates(ca);
      await Promise.allSettled([...engines].map((engine) => engine.shutdown()));
      await Promise.all([imap.close(), smtp.close(), ai.close(), otherAi.close()]);
      services.clear();
      ensure.mockRestore();
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  },
  120_000,
);
