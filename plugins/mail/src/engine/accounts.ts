import { randomUUID } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import { ModuleCredentials, type CredentialOwner, type CredentialSummary } from "@huhu/kernel";
import {
  accountPasswordPurpose,
  accountTargets,
  imapTarget,
  isInbox,
  isSelectable,
  mailAccountDefinitionSchema,
  mailFolderSchema,
  parseAccountSettings,
  type MailAccountDefinition,
  type MailAccountSettings,
  type MailFolder,
} from "./account-definition.js";
import { MailAccountError, type MailFolderDiscovery } from "./discovery.js";
import { discoverImapFolders } from "./imap-discovery.js";
import { fetchLatestImapMessage, markImapMessageRead } from "./imap-message.js";
import type { MailEndpoint } from "./presets.js";

export type MailAccountOwner = Pick<CredentialOwner<MailAccountDefinition>, "vault" | "localRoot" | "localVaultInstanceId" | "protection">;
type DraftInput = Readonly<{ settings: MailAccountSettings; password: string | undefined }>;
type FolderDiscovery = {
  readonly input: DraftInput;
  readonly settings: MailAccountDefinition["settings"];
  readonly password: string;
  controller: AbortController | undefined;
};

export type MailAccount = Omit<CredentialSummary, "entityId"> & { accountId: string; definition: MailAccountDefinition };
export type MailAccountVersion = { accountId: string; expectedRevision: string };
type RepairAccount = Pick<MailAccount, "accountId" | "revision" | "definition">;

function mailAccount({ entityId, revision, authState }: CredentialSummary, definition: MailAccountDefinition): MailAccount {
  return { accountId: entityId, revision, authState, definition };
}

/** The Engine supplies the trusted Vault owner. Keep this service in-process. */
export function openMailAccounts(owner: MailAccountOwner, discover: MailFolderDiscovery = discoverImapFolders) {
  const credentials = new ModuleCredentials({
    ...owner,
    pluginId: "mail",
    definition: mailAccountDefinitionSchema,
    targets: ({ settings }) => accountTargets(settings),
  });
  function current({ accountId, expectedRevision }: MailAccountVersion): RepairAccount {
    const found = ModuleCredentials.readPortableDefinition(owner.vault.files, "mail", mailAccountDefinitionSchema, accountId);
    if (!found) throw errors.notFound("邮箱账号已不存在。");
    if (found.revision !== expectedRevision) throw new HuhuError("VERSION_CONFLICT", "邮箱配置已更新，请关闭后重新打开该账号。", { details: { currentVersion: found.revision } });
    return { accountId, revision: found.revision, definition: found.definition };
  }
  return {
    list: async () => (await credentials.list()).map((entry) => mailAccount(entry, entry.definition)),
    recover: () => credentials.recover(),
    begin: (settings: MailAccountSettings, password?: string) => new MailAccountDraft(credentials, discover, settings, password),
    beginRepair(target: MailAccountVersion, password: string) {
      const account = current(target);
      return new MailAccountDraft(credentials, discover, account.definition.settings, password, account);
    },
    async rename(target: MailAccountVersion, label: string, signal: AbortSignal) {
      signal.throwIfAborted();
      const { accountId, revision, definition } = current(target);
      const saved = await credentials.save({
        entityId: accountId,
        expectedRevision: revision,
        definition: { ...definition, settings: { ...definition.settings, label } },
        actions: [{ purpose: accountPasswordPurpose, action: "keep" }],
        signal,
      });
      return { accountId, revision: saved.revision };
    },
    withSmtpCredentials<R>(accountId: string, send: (settings: MailAccountDefinition["settings"], password: string) => Promise<R>) {
      return credentials.use(accountId, [accountPasswordPurpose], ({ settings }, values) => {
        const password = values.get(accountPasswordPurpose);
        if (!password) throw new MailAccountError("credential-required");
        return send(settings, password);
      });
    },
    async fetchLatest(accountId: string, folder: string, signal: AbortSignal) {
      const result = await credentials.use(accountId, [accountPasswordPurpose], async ({ settings, folders }, values) => {
        if (!folders.some(({ path }) => path === folder)) return { error: new MailAccountError("invalid-selection") };
        const password = values.get(accountPasswordPurpose);
        if (!password) return { error: new MailAccountError("credential-required") };
        try {
          return { data: await fetchLatestImapMessage({ endpoint: settings.imap, email: settings.email, password, signal }, folder) };
        } catch (error) {
          return { error: error instanceof MailAccountError ? error : new MailAccountError("message-read") };
        }
      });
      if (result.error) throw result.error;
      return result.data;
    },
    async markRead(accountId: string, folder: string, validity: string, uid: number, signal: AbortSignal) {
      return credentials.use(accountId, [accountPasswordPurpose], async ({ settings, folders }, values) => {
        if (!folders.some(({ path }) => path === folder)) return "needs-refresh" as const;
        const password = values.get(accountPasswordPurpose);
        if (!password) return "local" as const;
        try {
          return await markImapMessageRead({ endpoint: settings.imap, email: settings.email, password, signal }, folder, validity, uid);
        } catch (error) {
          if (signal.aborted) throw error;
          return "local" as const;
        }
      });
    },
  };
}

export class MailAccountDraft {
  readonly #id = randomUUID();
  #input: DraftInput;
  #discovery: FolderDiscovery | undefined;
  #cancellingDiscovery = false;
  #folders = new Map<string, MailFolder>();
  #selected = new Set<string>();
  #saving = false;
  #closed = false;

  constructor(
    private readonly credentials: ModuleCredentials<MailAccountDefinition>,
    private readonly discover: MailFolderDiscovery,
    settings: MailAccountSettings,
    password?: string,
    private readonly repair?: RepairAccount,
  ) {
    this.#input = { settings: structuredClone(settings), password };
  }

  snapshot() {
    const { provider, email, label, auth, imap, smtpEnabled, smtp } = this.#input.settings;
    const endpoint = ({ host, port, security }: MailEndpoint): MailEndpoint => ({ host, port, security });
    return {
      settings: { provider, email, label, auth, imap: endpoint(imap), smtpEnabled, smtp: endpoint(smtp) },
      folders: [...this.#folders.values()].map((folder) => ({
        ...structuredClone(folder),
        selectable: isSelectable(folder),
        selected: this.#selected.has(folder.path),
      })),
    };
  }

  /** A changed IMAP identity requires the caller to explicitly supply a password again. */
  update(settings: MailAccountSettings, password?: string) {
    this.#assertEditable();
    const nextSettings = structuredClone(settings);
    const previousPassword = imapTarget(this.#input.settings) === imapTarget(nextSettings) ? this.#input.password : undefined;
    this.#input = { settings: nextSettings, password: password === undefined ? previousPassword : password };
    this.#replaceDiscovery();
  }

  async testConnection() {
    this.#assertEditable();
    if (this.#cancellingDiscovery) throw new MailAccountError("discovery-stale");
    const input = this.#input;
    const { settings, password } = this.#validatedInput(input);
    const controller = new AbortController();
    const discovery: FolderDiscovery = { input, settings, password, controller };
    this.#replaceDiscovery(discovery);
    try {
      this.#assertCurrentDiscovery(discovery);
      const results = await this.discover({ endpoint: { ...settings.imap }, email: settings.email, password, signal: controller.signal });
      this.#assertCurrentDiscovery(discovery);
      const folders = new Map<string, MailFolder>();
      for (const result of results) {
        const parsed = mailFolderSchema.safeParse(result);
        if (!parsed.success) throw new MailAccountError("folder-list");
        const folder = parsed.data;
        if (isInbox(folder.path)) folder.path = "INBOX";
        if (folders.has(folder.path)) throw new MailAccountError("folder-list");
        folders.set(folder.path, folder);
      }
      const inbox = folders.get("INBOX");
      if (!inbox || !isSelectable(inbox)) throw new MailAccountError("inbox-required");
      const selected = this.repair?.definition.folders.map(({ path }) => path) ?? ["INBOX"];
      if (
        selected.some((path) => {
          const folder = folders.get(path);
          return !folder || !isSelectable(folder);
        })
      )
        throw new MailAccountError("saved-folders-unavailable");
      this.#assertCurrentDiscovery(discovery);
      discovery.controller = undefined;
      this.#folders = folders;
      this.#selected = new Set(selected);
      return this.snapshot().folders;
    } catch (error) {
      this.#assertCurrentDiscovery(discovery);
      this.#discovery = undefined;
      throw error instanceof MailAccountError ? error : new MailAccountError("folder-list");
    }
  }

  selectFolders(paths: readonly string[]) {
    this.#assertEditable();
    this.#assertDiscovered();
    const next = new Set(paths.map((path) => (isInbox(path) ? "INBOX" : path)));
    if (!next.has("INBOX")) throw new MailAccountError("inbox-required");
    for (const path of next) {
      const folder = this.#folders.get(path);
      if (!folder || !isSelectable(folder)) throw new MailAccountError("invalid-selection");
    }
    this.#selected = next;
  }

  async save(signal?: AbortSignal) {
    this.#assertEditable();
    const { settings, password } = this.#assertDiscovered();
    const definition: MailAccountDefinition = this.repair?.definition ?? {
      format: 1,
      settings,
      folders: [...this.#folders.values()].filter((folder) => this.#selected.has(folder.path)),
    };
    this.#saving = true;
    try {
      const saved = await this.credentials.save({
        entityId: this.repair?.accountId ?? this.#id,
        expectedRevision: this.repair?.revision ?? null,
        definition,
        actions: [{ purpose: accountPasswordPurpose, action: "replace", value: password, ...(this.repair && { reconfigure: true as const }) }],
        ...(signal && { signal }),
      });
      this.#closed = true;
      this.#input = { settings: this.#input.settings, password: undefined };
      this.#discovery = undefined;
      return mailAccount(saved, definition);
    } finally {
      this.#saving = false;
    }
  }

  close() {
    if (this.#closed) return;
    this.#assertEditable();
    this.#closed = true;
    this.#input = { settings: this.#input.settings, password: undefined };
    this.#replaceDiscovery();
  }

  #validatedInput(input: DraftInput) {
    const parsed = parseAccountSettings(input.settings);
    if (!parsed.success) throw new MailAccountError("invalid-settings");
    if (parsed.data.auth === "oauth2") throw new MailAccountError("oauth-required");
    const password = parsed.data.auth === "app-password" ? input.password?.replace(/\s+/g, "") : input.password;
    if (!password) throw new MailAccountError("credential-required");
    return { settings: { ...parsed.data, auth: parsed.data.auth }, password };
  }

  #assertDiscovered() {
    const discovery = this.#discovery;
    if (!discovery || discovery.input !== this.#input || !this.#folders.has("INBOX")) throw new MailAccountError("discovery-required");
    return discovery;
  }

  #assertCurrentDiscovery(discovery: FolderDiscovery) {
    if (this.#discovery !== discovery || discovery.input !== this.#input) throw new MailAccountError("discovery-stale");
  }

  #assertEditable() {
    if (this.#closed) throw new MailAccountError("draft-closed");
    if (this.#saving) throw new MailAccountError("draft-busy");
  }

  #replaceDiscovery(discovery?: FolderDiscovery) {
    const previous = this.#discovery?.controller;
    this.#discovery = discovery;
    this.#folders.clear();
    this.#selected.clear();
    if (!previous) return;

    // Abort listeners run synchronously. A retest can start after cancellation returns.
    const wasCancelling = this.#cancellingDiscovery;
    this.#cancellingDiscovery = true;
    try {
      previous.abort();
    } finally {
      this.#cancellingDiscovery = wasCancelling;
    }
  }
}
