import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:tls";
import { ModuleCredentials } from "@huhu/kernel";
import { Vault } from "@huhu/vault";
import { afterEach, expect, test, vi } from "vitest";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { mailAccountDefinitionSchema, accountTargets, accountPasswordPurpose } from "../src/engine/account-definition.js";
import { MailAccountError, mailPreset, openMailAccounts, type MailAccountSettings, type MailFolder, type MailFolderDiscovery, type MailProvider } from "../src/engine/index.js";
import { openImapFixture } from "./fixtures/imap.js";

const password = "synthetic-app-secret";
const inbox: MailFolder = { path: "INBOX", name: "INBOX", delimiter: "/", specialUse: "\\Inbox", flags: [] };

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

async function setup(discover?: MailFolderDiscovery) {
  // Vault treats the OS temp tree as an ephemeral ownership area. Keep the
  // synthetic protection root and the test Vault in distinct sibling dirs.
  const root = await mkdtemp(path.join(tmpdir(), "huhu-mail-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const vaultRoot = path.join(root, "vault");
  const localRoot = path.join(root, "local");
  const backend = path.join(root, "backend");
  await Promise.all([vaultRoot, localRoot, backend].map((directory) => mkdir(directory)));
  const protection = new TestProtection(backend);
  const live = new Set<Vault>();
  cleanup.push(async () => {
    await Promise.all([...live].map((vault) => vault.close()));
  });
  async function open() {
    const vault = await Vault.open(vaultRoot, { create: true });
    live.add(vault);
    const owner = { vault, localRoot, localVaultInstanceId: "mail-test-instance", protection };
    async function close() {
      await vault.close();
      live.delete(vault);
    }
    return { vault, close, owner, accounts: openMailAccounts(owner, discover) };
  }
  return { ...(await open()), vaultRoot, localRoot, open, protection };
}

function settings(port = 1143): MailAccountSettings {
  return {
    provider: "custom_imap",
    email: "fixture@example.invalid",
    label: "Synthetic inbox",
    auth: "password",
    imap: { host: "127.0.0.1", port, security: "none" },
    smtpEnabled: false,
    smtp: { host: "submission.example.invalid", port: 2587, security: "starttls" },
  };
}

test("covers the 18 named Issue #8 presets, custom, and both Perfect domains", () => {
  const baseline: ReadonlyArray<[MailProvider, string, string, MailAccountSettings["auth"], number?]> = [
    ["gmail", "imap.gmail.com", "smtp.gmail.com", "oauth2"],
    ["yahoo", "imap.mail.yahoo.com", "smtp.mail.yahoo.com", "app-password"],
    ["aliyun", "imap.aliyun.com", "smtp.aliyun.com", "app-password"],
    ["aliyun_enterprise", "imap.qiye.aliyun.com", "smtp.qiye.aliyun.com", "password"],
    ["189", "imap.189.cn", "smtp.189.cn", "password"],
    ["sohu", "imap.sohu.com", "smtp.sohu.com", "app-password"],
    ["qq", "imap.qq.com", "smtp.qq.com", "app-password"],
    ["tencent_enterprise", "imap.exmail.qq.com", "smtp.exmail.qq.com", "password"],
    ["163", "imap.163.com", "smtp.163.com", "app-password"],
    ["outlook", "outlook.office365.com", "smtp.office365.com", "oauth2", 587],
    ["sina", "imap.sina.com", "smtp.sina.com", "app-password"],
    ["139", "imap.139.com", "smtp.139.com", "app-password"],
    ["21cn", "imap.21cn.com", "smtp.21cn.com", "password"],
    ["perfect", "imap.88.com", "smtp.88.com", "app-password"],
    ["icloud", "imap.mail.me.com", "smtp.mail.me.com", "app-password", 587],
    ["aol", "imap.aol.com", "smtp.aol.com", "app-password"],
    ["yandex", "imap.yandex.com", "smtp.yandex.com", "app-password"],
    ["mailru", "imap.mail.ru", "smtp.mail.ru", "app-password"],
    ["custom_imap", "", "", "password"],
  ];
  for (const [provider, imap, smtp, auth, port = 465] of baseline) {
    const preset = mailPreset(provider);
    expect(preset.imap).toEqual({ host: imap, port: 993, security: "tls" });
    expect(preset.smtp).toEqual({ host: smtp, port, security: port === 587 ? "starttls" : "tls" });
    expect(preset.credentials[0]?.method).toBe(auth);
    expect(preset.credentials[0]?.label).toBeTruthy();
    expect(preset.smtpEnabled).toBe(true);
    expect(preset.hint.length).toBeGreaterThan(0);
    expect(preset.guideUrl).toMatch(/^https:\/\//);
  }
  expect(mailPreset("gmail").credentials.map(({ method }) => method)).toEqual(["oauth2", "app-password"]);
  for (const domain of ["111.com", "email.cn"]) {
    const preset = mailPreset("perfect", `fixture@${domain.toUpperCase()} `);
    expect([preset.imap.host, preset.smtp.host]).toEqual([`imap.${domain}`, `smtp.${domain}`]);
  }
  expect(mailPreset("custom_imap", "fixture@126.com").imap.host).toBe("");
  expect(mailPreset("custom_imap", "fixture@yeah.net").smtp.host).toBe("");
});

test("discovers and selects real loopback folders, then reopens the isolated Vault", async () => {
  const fixture = await openImapFixture();
  cleanup.push(fixture.close);
  const { accounts, close, vaultRoot, protection, open } = await setup();
  const config = { ...settings(fixture.port), provider: "qq", auth: "app-password" } as const;
  const draft = accounts.begin(config, "synthetic-app- secret");
  await expect(draft.save()).rejects.toMatchObject({ code: "discovery-required" });
  const discovered = await draft.testConnection();
  await fixture.disconnected;
  expect(fixture.commands).toEqual(["LOGIN", "CAPABILITY", "NAMESPACE", "LIST"]);
  expect(discovered).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: "INBOX", selectable: true, selected: true }),
      expect.objectContaining({ path: "Container", selectable: false, selected: false }),
      expect.objectContaining({ path: "Container/Projects", selectable: true, delimiter: "/" }),
    ]),
  );
  expect(() => draft.selectFolders(["INBOX", "Container"])).toThrowError(expect.objectContaining({ code: "invalid-selection" }));
  expect(() => draft.selectFolders(["Container/Projects"])).toThrowError(expect.objectContaining({ code: "inbox-required" }));
  draft.selectFolders(["inbox", "Container/Projects"]);
  const saved = await draft.save();
  const summary = { accountId: saved.accountId, revision: saved.revision, authState: { [accountPasswordPurpose]: "configured" } };
  expect(saved).toMatchObject(summary);
  expect(saved.definition.settings).toEqual(config);
  expect(saved.definition.folders.map(({ path }) => path)).toEqual(["INBOX", "Container/Projects"]);
  expect(protection.keys()).toHaveLength(1);
  await close();

  const reopened = await open();
  expect(await reopened.accounts.recover()).toBe(true);
  expect(await reopened.accounts.list()).toEqual([saved]);
  const owner = new ModuleCredentials({
    ...reopened.owner,
    pluginId: "mail",
    definition: mailAccountDefinitionSchema,
    targets: ({ settings }) => accountTargets(settings),
  });
  expect(await owner.use(saved.accountId, [accountPasswordPurpose], async (_, values) => values.get(accountPasswordPurpose))).toBe(password);
  const definitions = path.join(vaultRoot, ".huhu", "module-credentials");
  const files = await readdir(definitions);
  expect(files).toHaveLength(1);
  expect(await readFile(path.join(definitions, files[0]!), "utf8")).not.toContain(password);
  expect(JSON.stringify(await reopened.accounts.list())).not.toContain(password);
  expect(fixture.commands.filter((command) => command === "LOGIN")).toHaveLength(1);
});

test("preserves enabled SMTP overrides and binds the password to those settings", async () => {
  const discover = vi.fn<MailFolderDiscovery>().mockResolvedValue([inbox]);
  const { accounts, owner } = await setup(discover);
  const config = { ...settings(), smtpEnabled: true };
  const draft = accounts.begin(config, password);
  await draft.testConnection();
  const saved = await draft.save();
  expect((await accounts.list())[0]?.definition.settings).toEqual(config);
  const credentials = new ModuleCredentials({
    ...owner,
    pluginId: "mail",
    definition: mailAccountDefinitionSchema,
    targets: ({ settings }) => accountTargets({ ...settings, smtp: { ...settings.smtp, port: 3587 } }),
  });
  await expect(credentials.use(saved.accountId, [accountPasswordPurpose], async () => {})).rejects.toMatchObject({ code: "corrupt" });
  expect(discover).toHaveBeenCalledTimes(1);
});

test.each(["selectable", "missing", "noselect", "nonexistent"] as const)("probes INBOX independently of a NAMESPACE prefix (%s)", async (namespacedInbox) => {
  const fixture = await openImapFixture({ namespacedInbox });
  cleanup.push(fixture.close);
  const { accounts, protection } = await setup();
  const draft = accounts.begin(settings(fixture.port), password);
  const discovery = draft.testConnection();
  if (namespacedInbox === "selectable") {
    await expect(discovery).resolves.toMatchObject([
      { path: "INBOX", delimiter: ".", selectable: true, selected: true, flags: ["\\HasChildren"] },
      { path: "INBOX.Projects", name: "Projects", delimiter: ".", selectable: true, selected: false },
    ]);
    draft.selectFolders(["INBOX", "INBOX.Projects"]);
    const saved = await draft.save();
    expect(saved.definition.folders.map(({ path, delimiter }) => [path, delimiter])).toEqual([
      ["INBOX", "."],
      ["INBOX.Projects", "."],
    ]);
    expect(await accounts.list()).toEqual([saved]);
  } else {
    await expect(discovery).rejects.toMatchObject({ code: "inbox-required" });
    await expect(draft.save()).rejects.toMatchObject({ code: "discovery-required" });
    expect(draft.snapshot().folders).toEqual([]);
    expect(await accounts.list()).toEqual([]);
    expect(protection.keys()).toEqual([]);
  }
  await fixture.disconnected;
  expect(fixture.listRequests).toEqual(['"INBOX." "*"', '"" "INBOX"']);
});

test("discards previous folders when a synchronous abort callback starts a retest during update", async () => {
  const late = Promise.withResolvers<readonly MailFolder[]>();
  const previousFolder = { ...inbox, path: "Previous/Only", name: "Only" };
  const currentFolder = { ...inbox, path: "Current/Only", name: "Only" };
  const newPassword = "new-synthetic-password";
  const discover = vi.fn<MailFolderDiscovery>(async ({ email }) => [inbox, email === "other@example.invalid" ? currentFolder : previousFolder]);
  const { accounts, owner, protection } = await setup(discover);
  const original = settings();
  const changed = { ...original, email: "other@example.invalid", imap: { ...original.imap, port: 3143 } };
  const draft = accounts.begin(original, password);
  let reentrant: Promise<unknown> | undefined;
  discover.mockImplementationOnce(({ signal }) => {
    signal.addEventListener(
      "abort",
      () => {
        reentrant = draft.testConnection().catch((error: unknown) => error);
      },
      { once: true },
    );
    return late.promise;
  });
  const pending = draft.testConnection();
  const rejected = expect(pending).rejects.toMatchObject({ code: "discovery-stale" });

  draft.update(changed, newPassword);
  expect(reentrant).toBeDefined();
  const reentrantResult = await reentrant;
  await expect(draft.save()).rejects.toMatchObject({ code: "discovery-required" });
  expect(reentrantResult).toMatchObject({ code: "discovery-stale" });
  expect(draft.snapshot()).toEqual({ settings: changed, folders: [] });
  expect(await accounts.list()).toEqual([]);
  expect(protection.keys()).toEqual([]);
  await expect(draft.testConnection()).resolves.toMatchObject([{ path: "INBOX" }, { path: "Current/Only" }]);
  late.resolve([inbox, previousFolder]);
  await rejected;
  draft.selectFolders(["INBOX", "Current/Only"]);
  const saved = await draft.save();
  expect(saved.definition).toMatchObject({ settings: changed, folders: [{ path: "INBOX" }, { path: "Current/Only" }] });
  expect(discover).toHaveBeenCalledTimes(2);
  expect(discover).toHaveBeenLastCalledWith(expect.objectContaining({ endpoint: changed.imap, email: changed.email, password: newPassword }));
  expect(await accounts.list()).toEqual([saved]);
  expect(protection.keys()).toHaveLength(1);
  const credentials = new ModuleCredentials({
    ...owner,
    pluginId: "mail",
    definition: mailAccountDefinitionSchema,
    targets: ({ settings }) => accountTargets(settings),
  });
  expect(await credentials.use(saved.accountId, [accountPasswordPurpose], async (_, values) => values.get(accountPasswordPurpose))).toBe(newPassword);
});

test.each(["update", "close"] as const)("does not start a retest superseded by a synchronous abort callback (%s)", async (action) => {
  const late = Promise.withResolvers<readonly MailFolder[]>();
  const discover = vi.fn<MailFolderDiscovery>().mockResolvedValue([inbox]);
  const { accounts, protection } = await setup(discover);
  const draft = accounts.begin(settings(), password);
  const changed = { ...settings(), label: "Updated during cancellation" };
  discover.mockImplementationOnce(({ signal }) => {
    signal.addEventListener(
      "abort",
      () => {
        if (action === "update") draft.update(changed);
        else draft.close();
      },
      { once: true },
    );
    return late.promise;
  });
  const pending = draft.testConnection();
  const rejected = expect(pending).rejects.toMatchObject({ code: "discovery-stale" });

  await expect(draft.testConnection()).rejects.toMatchObject({ code: "discovery-stale" });
  late.resolve([inbox]);
  await rejected;
  expect(discover).toHaveBeenCalledTimes(1);
  expect(draft.snapshot().folders).toEqual([]);
  await expect(draft.save()).rejects.toMatchObject({ code: action === "update" ? "discovery-required" : "draft-closed" });
  expect(await accounts.list()).toEqual([]);
  expect(protection.keys()).toEqual([]);
  if (action === "update") {
    expect(draft.snapshot().settings).toEqual(changed);
    await draft.testConnection();
    expect((await draft.save()).definition.settings).toEqual(changed);
  }
});

test.each(["address", "authentication", "port"] as const)("invalidates a late response after changing %s", async (field) => {
  const late = Promise.withResolvers<readonly MailFolder[]>();
  let firstSignal: AbortSignal | undefined;
  const discover = vi
    .fn<MailFolderDiscovery>()
    .mockImplementationOnce(({ signal }) => {
      firstSignal = signal;
      return late.promise;
    })
    .mockResolvedValue([inbox]);
  const { accounts } = await setup(discover);
  const original = settings();
  const draft = accounts.begin(original, password);
  const pending = draft.testConnection();
  const rejected = expect(pending).rejects.toMatchObject({ code: "discovery-stale" });
  const changed = field === "address" ? { ...original, email: "other@example.invalid" } : field === "port" ? { ...original, imap: { ...original.imap, port: 3143 } } : original;
  draft.update(changed, "new-synthetic-password");
  expect(firstSignal?.aborted).toBe(true);
  await expect(draft.save()).rejects.toMatchObject({ code: "discovery-required" });
  await draft.testConnection();
  late.resolve([{ ...inbox, name: "Stale INBOX" }]);
  await rejected;
  expect(draft.snapshot().folders[0]?.name).toBe("INBOX");
  expect(discover).toHaveBeenCalledTimes(2);
  expect(await accounts.list()).toEqual([]);
});

test("a changed target never receives the previous password by default", async () => {
  const discover = vi.fn<MailFolderDiscovery>().mockResolvedValue([inbox]);
  const { accounts } = await setup(discover);
  const original = settings();
  const draft = accounts.begin(original, password);
  draft.update({ ...original, imap: { ...original.imap, host: "new.example.invalid" } });
  await expect(draft.testConnection()).rejects.toMatchObject({ code: "credential-required" });
  expect(discover).not.toHaveBeenCalled();
});

test("cancelling a real loopback LIST closes the socket and leaves no account", async () => {
  const fixture = await openImapFixture({ stallList: true });
  cleanup.push(fixture.close);
  const { accounts } = await setup();
  const draft = accounts.begin(settings(fixture.port), password);
  const pending = draft.testConnection();
  const rejected = expect(pending).rejects.toMatchObject({ code: "discovery-stale" });
  await fixture.listed;
  draft.close();
  await rejected;
  await fixture.disconnected;
  expect(await accounts.list()).toEqual([]);
});

test.each([
  ["authentication", { rejectLogin: true }],
  ["folder-list", { rejectList: true }],
  ["network", { disconnectDuringList: true }],
  ["tls", {}],
] as const)("loopback %s errors leave an editable form and no account", async (code, options) => {
  const fixture = await openImapFixture(options);
  cleanup.push(fixture.close);
  const { accounts, protection } = await setup();
  const config = settings(fixture.port);
  if (code === "tls") config.imap.security = "starttls";
  const draft = accounts.begin(config, password);
  await expect(draft.testConnection()).rejects.toMatchObject({ code });
  await fixture.disconnected;
  if (code === "tls") expect(fixture.commands).not.toContain("LOGIN");
  expect(draft.snapshot()).toEqual({ settings: config, folders: [] });
  expect(await accounts.list()).toEqual([]);
  expect(protection.keys()).toEqual([]);
});

test("a self-signed TLS certificate is rejected before the IMAP session", async () => {
  const base = new URL("./fixtures/", import.meta.url);
  const [cert, key] = await Promise.all([readFile(new URL("loopback-cert.pem", base)), readFile(new URL("loopback-key.pem", base))]);
  let sessions = 0;
  const server = createServer({ cert, key }, () => {
    sessions++;
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("TLS fixture unavailable"));
      resolve(address.port);
    });
  });
  cleanup.push(() => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  const { accounts, protection } = await setup();
  const config = settings(port);
  config.imap.security = "tls";
  const draft = accounts.begin(config, password);
  await expect(draft.testConnection()).rejects.toMatchObject({ code: "tls" });
  expect(sessions).toBe(0);
  expect(draft.snapshot()).toEqual({ settings: config, folders: [] });
  expect(await accounts.list()).toEqual([]);
  expect(protection.keys()).toEqual([]);
});

test("failed discovery, protection and Vault publication leave no partial account; retry commits once", async () => {
  const discover = vi
    .fn<MailFolderDiscovery>()
    .mockRejectedValueOnce(new MailAccountError("timeout"))
    .mockResolvedValueOnce([{ ...inbox, flags: ["\\Noselect"] }])
    .mockResolvedValue([inbox]);
  const { accounts, protection, localRoot, vault, close, open } = await setup(discover);
  const config = settings();
  const draft = accounts.begin(config, password);
  await expect(draft.testConnection()).rejects.toMatchObject({ code: "timeout" });
  await expect(draft.testConnection()).rejects.toMatchObject({ code: "inbox-required" });
  expect(draft.snapshot()).toEqual({ settings: config, folders: [] });
  await draft.testConnection();

  protection.unavailable = "locked";
  await expect(draft.save()).rejects.toMatchObject({ code: "locked" });
  expect(await accounts.list()).toEqual([]);
  expect(protection.keys()).toEqual([]);
  expect(draft.snapshot().folders[0]?.selected).toBe(true);
  protection.unavailable = undefined;

  const write = vi.spyOn(vault.files, "write").mockRejectedValueOnce(new Error("synthetic write failure"));
  try {
    await expect(draft.save()).rejects.toMatchObject({ code: "storage-failed" });
    expect(await accounts.list()).toEqual([]);
    expect(protection.keys()).toEqual([]);
    const staged = await readdir(localRoot, { recursive: true });
    expect(staged.filter((entry) => /\.(bin|json)$/.test(entry))).toEqual([]);
  } finally {
    write.mockRestore();
  }

  const pending = draft.save();
  await expect(draft.save()).rejects.toMatchObject({ code: "draft-busy" });
  const saved = await pending;
  await expect(draft.save()).rejects.toMatchObject({ code: "draft-closed" });
  expect(discover).toHaveBeenCalledTimes(3);
  await close();
  expect(await (await open()).accounts.list()).toEqual([saved]);
});

test("OAuth templates use a distinct path before any password discovery", async () => {
  const discover = vi.fn<MailFolderDiscovery>();
  const { accounts } = await setup(discover);
  const draft = accounts.begin({ ...settings(), provider: "gmail", auth: "oauth2" });
  await expect(draft.testConnection()).rejects.toMatchObject({ code: "oauth-required" });
  expect(discover).not.toHaveBeenCalled();
  expect(await accounts.list()).toEqual([]);
});
