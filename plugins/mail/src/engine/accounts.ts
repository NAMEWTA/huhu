import { randomUUID } from "node:crypto";
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
import type { MailEndpoint } from "./presets.js";

type MailAccountOwner = Pick<CredentialOwner<MailAccountDefinition>, "vault" | "localRoot" | "localVaultInstanceId" | "protection">;
type DraftInput = Readonly<{ settings: MailAccountSettings; password: string | undefined }>;
type FolderDiscovery = {
  readonly input: DraftInput;
  readonly settings: MailAccountDefinition["settings"];
  readonly password: string;
  controller: AbortController | undefined;
};

export type MailAccount = Omit<CredentialSummary, "entityId"> & { accountId: string; definition: MailAccountDefinition };

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
  return {
    list: async () => (await credentials.list()).map((entry) => mailAccount(entry, entry.definition)),
    recover: () => credentials.recover(),
    begin: (settings: MailAccountSettings, password?: string) => new MailAccountDraft(credentials, discover, settings, password),
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
      this.#assertCurrentDiscovery(discovery);
      discovery.controller = undefined;
      this.#folders = folders;
      this.#selected.add("INBOX");
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

  async save() {
    this.#assertEditable();
    const { settings, password } = this.#assertDiscovered();
    const definition: MailAccountDefinition = {
      format: 1,
      settings,
      folders: [...this.#folders.values()].filter((folder) => this.#selected.has(folder.path)),
    };
    this.#saving = true;
    try {
      const saved = await this.credentials.save({
        entityId: this.#id,
        expectedRevision: null,
        definition,
        actions: [{ purpose: accountPasswordPurpose, action: "replace", value: password }],
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
