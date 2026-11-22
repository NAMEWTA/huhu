import { randomUUID } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import { ModuleCredentials, type CredentialOwner, type CredentialSummary, type HuhuApi } from "@huhu/kernel";
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
import { AccountRemovals } from "./account-removals.js";
import { MailAccountError, type MailFolderDiscovery } from "./discovery.js";
import { GmailHistoryError, readGmailHistory, type GmailHistoryInput } from "./gmail-history.js";
import { GraphMailError, graphMailEndpoint, probeGraphInbox, readGraphDelta, type GraphSyncInput } from "./graph-mail.js";
import { discoverImapFolders } from "./imap-discovery.js";
import { fetchImapMessages, markImapMessageRead, waitForImapActivity, type ImapSyncCursor } from "./imap-message.js";
import {
  MailOAuthError,
  mailPermission,
  oauthMailEndpoints,
  oauthProvider,
  requestOAuthToken,
  sealedOAuthToken,
  tokenResource,
  type MailOAuthIssuer,
  type MailOAuthRuntime,
  type OAuthProvider,
  type SealedOAuthToken,
} from "./oauth-provider.js";
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
const accountsModule = "mail";

export function mailAccountPackageFile(files: HuhuApi["vault"]["files"]) {
  return ModuleCredentials.portablePackageFile(files, accountsModule, mailAccountDefinitionSchema);
}

function mailAccount({ entityId, revision, authState }: CredentialSummary, definition: MailAccountDefinition): MailAccount {
  return { accountId: entityId, revision, authState, definition };
}

/** The Engine supplies the trusted Vault owner. Keep this service in-process. */
export function openMailAccounts(
  owner: MailAccountOwner,
  discover: MailFolderDiscovery = discoverImapFolders,
  removals = new AccountRemovals(owner.vault.files),
  oauth?: MailOAuthRuntime,
  lifetime = new AbortController().signal,
  permissionsChanged?: (accountId: string) => void,
) {
  const credentials = new ModuleCredentials({
    ...owner,
    pluginId: accountsModule,
    definition: mailAccountDefinitionSchema,
    targets: ({ settings, oauth: identity }) => accountTargets(settings, identity),
  });
  const readDefinition = (id: string) => ModuleCredentials.readPortableDefinition(owner.vault.files, accountsModule, mailAccountDefinitionSchema, id);
  function current({ accountId, expectedRevision }: MailAccountVersion): RepairAccount {
    removals.assertActive(accountId);
    const found = readDefinition(accountId);
    if (!found) throw errors.notFound("邮箱账号已不存在。");
    if (found.revision !== expectedRevision) throw new HuhuError("VERSION_CONFLICT", "邮箱配置已更新，请关闭后重新打开该账号。", { details: { currentVersion: found.revision } });
    return { accountId, revision: found.revision, definition: found.definition };
  }
  const renewals = new Map<string, Promise<void>>();
  const rejectedRevisions = new Map<string, string>();
  const now = oauth?.now ?? Date.now;
  function providerEndpoints(provider: OAuthProvider, email: string, personal: boolean) {
    return oauth?.issuers[provider]?.protocol ?? oauthMailEndpoints(provider, email, personal);
  }
  function transportIssuer(definition: MailAccountDefinition) {
    const provider = oauthProvider.safeParse(definition.settings.provider);
    const issuer = provider.success ? oauth?.issuers[provider.data] : undefined;
    if (!provider.success || !issuer || definition.oauth?.clientId !== issuer.clientId) throw new MailAccountError("oauth-not-configured");
    const { imap, smtp } = providerEndpoints(provider.data, definition.settings.email, definition.oauth?.personal === true);
    const same = (a: MailEndpoint, b: MailEndpoint) => a.host === b.host && a.port === b.port && a.security === b.security;
    if (definition.oauth?.route !== "graph" && (!same(imap, definition.settings.imap) || !same(smtp, definition.settings.smtp))) throw new MailAccountError("oauth-reauthorize");
    return { provider: provider.data, issuer };
  }
  const graphReadScopes = (scopes: readonly string[]) => scopes.filter((scope) => !/\/Mail\.Send$/i.test(scope));
  function refreshGraphGrant(issuer: MailOAuthIssuer, token: SealedOAuthToken, requested: readonly string[], signal: AbortSignal) {
    const readOnly = graphReadScopes(requested);
    const redeem = (scopes: readonly string[]) => requestOAuthToken(issuer, "outlook", { grant_type: "refresh_token", refresh_token: token.refresh }, signal, now(), token, scopes);
    return redeem(requested).catch((error: unknown) => {
      signal.throwIfAborted();
      if (!readOnly.length || requested.length === readOnly.length || !(error instanceof MailOAuthError) || error.reason !== "reauthorize") throw error;
      return redeem(readOnly);
    });
  }
  async function tryGraph(issuer: MailOAuthIssuer, exchange: SealedOAuthToken, send: boolean, signal: AbortSignal) {
    const configured = issuer.preauthorizedGraphScopes;
    if (!configured) return;
    const readOnly = graphReadScopes(configured);
    if (!readOnly.length) return;
    const requested = send ? configured : readOnly;
    try {
      const { bundle } = await refreshGraphGrant(issuer, exchange, requested, signal);
      const graphInbox = await probeGraphInbox(issuer.graphApi ?? graphMailEndpoint, bundle.access, signal);
      return { token: { ...bundle, graphInbox } };
    } catch (error) {
      signal.throwIfAborted();
      // The verified Exchange exchange remains available if no usable Graph grant exists.
      if (error instanceof GraphMailError) return { fallback: error.reason };
      if (error instanceof MailOAuthError) {
        if (error.reason === "graph-metadata-only" || error.reason === "wrong-resource") return { fallback: error.reason };
        if (error.reason === "reauthorize" || error.reason === "permission-missing") return { fallback: "grant-unavailable" as const };
      }
      return { fallback: "graph-api-unavailable" as const };
    }
  }
  async function renew(accountId: string) {
    const signal = AbortSignal.any([lifetime, removals.signal(accountId)]);
    const { definition, revision, token } = await credentials.use(accountId, [accountPasswordPurpose], async (definition, values, revision) => ({
      definition,
      revision,
      token: sealedOAuthToken.parse(JSON.parse(values.get(accountPasswordPurpose)!)),
    }));
    const { issuer, provider } = transportIssuer(definition);
    if ((definition.oauth?.route === "graph") !== (tokenResource(token) === "graph")) throw new MailAccountError("oauth-reauthorize");
    if (rejectedRevisions.get(accountId) === revision) throw new MailAccountError("oauth-reauthorize");
    if (token.until > now() + 60_000) return;
    try {
      const graph = mailPermission(provider, token.scopes, tokenResource(token)).graph;
      const { bundle } = graph ? await refreshGraphGrant(issuer, token, graph.scopes, signal) : await requestOAuthToken(issuer, provider, { grant_type: "refresh_token", refresh_token: token.refresh }, signal, now(), token);
      const permission = mailPermission(provider, bundle.scopes, tokenResource(bundle));
      if ((definition.oauth?.route === "graph") !== Boolean(permission.graph)) throw new MailOAuthError("wrong-resource");
      signal.throwIfAborted();
      await removals.serialize(accountId, async () => {
        removals.assertActive(accountId);
        const identity = definition.oauth;
        const graphSend = permission.graph?.send;
        const lostGraphSend = graphSend === false && definition.settings.smtpEnabled;
        const changed = identity?.route === "graph" && (lostGraphSend || (identity.graphSend !== undefined && identity.graphSend !== graphSend));
        const next: MailAccountDefinition = changed && identity ? { ...definition, oauth: { ...identity, graphSend }, settings: { ...definition.settings, smtpEnabled: definition.settings.smtpEnabled && graphSend === true } } : definition;
        await credentials.save({
          entityId: accountId,
          expectedRevision: revision,
          definition: next,
          actions: [{ purpose: accountPasswordPurpose, action: "replace", value: JSON.stringify(bundle), ...(lostGraphSend && { reconfigure: true }) }],
          signal,
        });
        if (changed && !lifetime.aborted) permissionsChanged?.(accountId);
      });
    } catch (error) {
      if (error instanceof MailOAuthError) {
        if (error.reason === "reauthorize" || error.reason === "permission-missing" || error.reason === "wrong-resource" || error.reason === "graph-metadata-only") {
          rejectedRevisions.set(accountId, revision);
          throw new MailAccountError("oauth-reauthorize");
        }
        throw new MailAccountError("network");
      }
      throw error;
    }
  }
  async function ensureOAuthAccess(accountId: string, signal: AbortSignal) {
    signal.throwIfAborted();
    if (readDefinition(accountId)?.definition.settings.auth !== "oauth2") return;
    let pending = renewals.get(accountId);
    if (!pending) {
      pending = renew(accountId).finally(() => renewals.delete(accountId));
      renewals.set(accountId, pending);
    }
    await pending;
    signal.throwIfAborted();
  }
  async function useTransport<R>(accountId: string, signal: AbortSignal, operation: (definition: MailAccountDefinition, material: string, credential: SealedOAuthToken | undefined, revision: string) => Promise<R>) {
    await ensureOAuthAccess(accountId, signal);
    const result = await credentials.use(accountId, [accountPasswordPurpose], async (definition, values, revision) => {
      try {
        signal.throwIfAborted();
        removals.assertActive(accountId);
        const value = values.get(accountPasswordPurpose)!;
        if (definition.settings.auth !== "oauth2") return { data: await operation(definition, value, undefined, revision) } as const;
        transportIssuer(definition);
        const token = sealedOAuthToken.parse(JSON.parse(value));
        if (token.until <= now() || (definition.oauth?.route === "graph") !== (tokenResource(token) === "graph")) throw new MailAccountError("oauth-reauthorize");
        return { data: await operation(definition, token.access, token, revision) } as const;
      } catch (error) {
        return { error } as const;
      }
    });
    if ("error" in result) throw result.error;
    return result.data;
  }
  return {
    list: async () =>
      (await credentials.list())
        .filter((entry) => !removals.read(entry.entityId))
        .map((entry) => {
          const account = mailAccount(entry, entry.definition);
          if (entry.definition.oauth) {
            try {
              transportIssuer(entry.definition);
              if (rejectedRevisions.get(entry.entityId) === entry.revision) throw new MailAccountError("oauth-reauthorize");
            } catch {
              return { ...account, authState: { ...account.authState, [accountPasswordPurpose]: "needs-reconfiguration" as const } };
            }
          }
          return account;
        }),
    readDefinition,
    visibleDefinition: (id: string) => (removals.read(id) ? undefined : readDefinition(id)),
    ensureOAuthAccess,
    drainOAuth: () => Promise.allSettled(renewals.values()),
    async confirmOAuthCommit(accountId: string, sessionId: string) {
      try {
        return await credentials.use(accountId, [accountPasswordPurpose], async (definition, values) => {
          if (!definition.oauth) return undefined;
          const stored = sealedOAuthToken.safeParse(JSON.parse(values.get(accountPasswordPurpose)!));
          return stored.success && stored.data.commit?.sessionId === sessionId ? stored.data.commit : undefined;
        });
      } catch {
        return undefined;
      }
    },
    // The subset transaction holds the source ID's removal lock, and a separate copy uses a fresh ID.
    async restoreDefinition(accountId: string, definition: MailAccountDefinition, signal: AbortSignal, keepSeparate: boolean, restoredInBatch: ReadonlySet<string>) {
      return removals.serializeAddress(definition.settings.email, async () => {
        removals.assertActive(accountId);
        const existing = (await credentials.list()).find(
          ({ entityId, definition: row }) => entityId === accountId || (!keepSeparate && !restoredInBatch.has(entityId) && row.settings.email.toLowerCase() === definition.settings.email.toLowerCase()),
        );
        if (existing) throw errors.versionConflict(existing.revision);
        return credentials.save({ entityId: accountId, expectedRevision: null, definition, actions: [{ purpose: accountPasswordPurpose, action: "clear" }], signal });
      });
    },
    async saveOAuth(
      target: { sessionId: string; accountId: string; expectedRevision: string | null; provider: OAuthProvider; email: string; label: string; smtp: boolean },
      identity: { subject: string; personal: boolean },
      exchangeOrGmail: SealedOAuthToken,
      signal: AbortSignal,
    ) {
      const { accountId, provider, email, label, expectedRevision } = target;
      const issuer = oauth?.issuers[provider];
      if (!issuer) throw new MailOAuthError("not-configured");
      const repair = expectedRevision === null ? undefined : current({ accountId, expectedRevision });
      if (repair && (repair.definition.settings.provider !== provider || repair.definition.settings.email.toLowerCase() !== email.toLowerCase() || repair.definition.oauth?.subject !== identity.subject))
        throw new MailOAuthError("account-changed");
      const { imap, smtp } = providerEndpoints(provider, email, identity.personal);
      // An Inbox-only Graph grant cannot replace a user's other selected Exchange folders.
      const graph = provider === "outlook" && !repair?.definition.folders.some(({ path }) => !isInbox(path)) ? await tryGraph(issuer, exchangeOrGmail, target.smtp, signal) : undefined;
      const token = graph?.token ?? exchangeOrGmail;
      const permission = mailPermission(provider, token.scopes, tokenResource(token));
      if (!permission.imap && !permission.graph) throw new MailOAuthError(permission.problem ?? "permission-missing");
      const route = permission.graph ? "graph" : "imap";
      // smtpEnabled is the existing account-level send toggle. The protected token controls the actual route and grant.
      const settings = { provider, email, label, auth: "oauth2" as const, imap, smtp, smtpEnabled: target.smtp && (permission.graph?.send ?? token.smtp) };
      let found: readonly MailFolder[];
      if (route === "graph") {
        found = [{ path: "INBOX", name: "INBOX", delimiter: null, specialUse: "\\Inbox", flags: [] }];
      } else {
        found = await discover({ endpoint: imap, email, password: token.access, oauth: true, signal }).catch(() => {
          throw new MailOAuthError("protocol-unavailable");
        });
      }
      const paths = route === "graph" ? ["INBOX"] : (repair?.definition.folders.map(({ path }) => path) ?? ["INBOX"]);
      const folders = paths.map((path) => found.find((row) => row.path === path && isSelectable(row)));
      if (!folders.every((row) => row !== undefined)) throw new MailOAuthError("protocol-unavailable");
      const definition = mailAccountDefinitionSchema.parse({
        format: 1,
        settings,
        folders,
        oauth: {
          clientId: issuer.clientId,
          subject: identity.subject,
          route,
          ...(identity.personal && { personal: true }),
          ...(permission.graph && target.smtp && { graphSend: permission.graph.send }),
          ...(graph?.fallback && { graphFallback: graph.fallback }),
        },
        ...(repair?.definition.restoredFrom && { restoredFrom: repair.definition.restoredFrom }),
      });
      return removals.serialize(accountId, async () => {
        signal.throwIfAborted();
        removals.assertActive(accountId);
        // The witness belongs to the very same protected generation as the new token.
        const value = JSON.stringify({ ...token, commit: { sessionId: target.sessionId, smtp: settings.smtpEnabled, ...(route === "graph" && { route }) } });
        const save = () => credentials.save({ entityId: accountId, expectedRevision, definition, actions: [{ purpose: accountPasswordPurpose, action: "replace", value, reconfigure: true }], signal });
        const saved = repair
          ? await save()
          : await removals.serializeAddress(email, async () => {
              signal.throwIfAborted();
              const existing = (await credentials.list()).some(({ definition }) => definition.settings.email.toLowerCase() === email.toLowerCase());
              if (existing) throw new MailOAuthError("account-changed");
              return save();
            });
        rejectedRevisions.delete(accountId);
        return mailAccount(saved, definition);
      });
    },
    assertActive: (id: string | null) => removals.assertActive(id),
    signal: (id: string) => removals.signal(id),
    recover: () => credentials.recover(),
    async removeDefinition({ accountId, expectedRevision }: MailAccountVersion, signal: AbortSignal) {
      if (readDefinition(accountId)) await credentials.delete(accountId, expectedRevision, signal);
      rejectedRevisions.delete(accountId);
    },
    begin: (settings: MailAccountSettings, password?: string) => new MailAccountDraft(credentials, discover, settings, password),
    beginRepair(target: MailAccountVersion, password: string) {
      const account = current(target);
      return new MailAccountDraft(credentials, discover, account.definition.settings, password, account, removals);
    },
    async rename(target: MailAccountVersion, label: string, signal: AbortSignal) {
      return removals.serialize(target.accountId, async () => {
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
      });
    },
    withSmtpCredentials<R>(accountId: string, send: (settings: MailAccountDefinition["settings"], password: string) => Promise<R>, signal = lifetime) {
      removals.assertActive(accountId);
      return useTransport(accountId, signal, ({ settings, oauth: identity }, password, credential) => {
        if (identity?.route === "graph" || (credential && (!credential.smtp || (settings.provider === "outlook" && !mailPermission("outlook", credential.scopes).smtp)))) throw new MailAccountError("oauth-reauthorize");
        return send(settings, password);
      });
    },
    withGraphSendCredentials<R>(accountId: string, send: (definition: MailAccountDefinition, endpoint: string, token: string, assertCurrent: () => void) => Promise<R>, signal: AbortSignal) {
      return useTransport(accountId, signal, (definition, token, credential, revision) => {
        if (definition.oauth?.route !== "graph" || !credential) throw new MailAccountError("invalid-selection");
        if (!mailPermission("outlook", credential.scopes, tokenResource(credential)).graph?.send) throw new MailOAuthError("permission-missing");
        if (!definition.settings.smtpEnabled) throw new MailAccountError("invalid-selection");
        const assertCurrent = () => {
          signal.throwIfAborted();
          removals.assertActive(accountId);
          const current = readDefinition(accountId);
          const sender = current?.definition;
          if (sender?.oauth?.route === "graph" && (!sender.settings.smtpEnabled || sender.oauth.graphSend === false)) throw new MailOAuthError("permission-missing");
          // The revision identifies both the send setting and the grant checked above.
          if (current?.revision !== revision || rejectedRevisions.get(accountId) === revision || credential.until <= now()) throw new MailAccountError("oauth-reauthorize");
        };
        return send(definition, oauth?.issuers.outlook?.graphApi ?? graphMailEndpoint, token, assertCurrent);
      });
    },
    fetchGraphDelta(accountId: string, folder: string, previous: GraphSyncInput | undefined, signal: AbortSignal) {
      return useTransport(accountId, signal, async ({ oauth: identity, folders }, token, credential) => {
        if (identity?.route !== "graph" || !isInbox(folder) || !folders.some(({ path }) => path === folder)) throw new MailAccountError("invalid-selection");
        if (!credential || !mailPermission("outlook", credential.scopes, tokenResource(credential)).graph) {
          throw new HuhuError("INVALID_INPUT", "Microsoft Graph 读取正文和附件需要 Mail.Read 或 Mail.ReadWrite 权限。", { details: { reason: "graph-read-permission" } });
        }
        const endpoint = oauth?.issuers.outlook?.graphApi ?? graphMailEndpoint;
        const inbox = credential.graphInbox ?? (await probeGraphInbox(endpoint, token, signal));
        return readGraphDelta(endpoint, token, inbox, previous, signal);
      });
    },
    fetchGmailHistory(accountId: string, folder: string, previous: GmailHistoryInput | undefined, signal: AbortSignal) {
      const endpoint = oauth?.issuers.gmail?.gmailApi;
      if (!endpoint || !isInbox(folder)) return;
      const current = readDefinition(accountId)?.definition;
      if (current?.settings.provider !== "gmail" || !current.oauth) return;
      return useTransport(accountId, signal, async ({ settings, oauth: binding, folders }, token, credential) => {
        if (settings.provider !== "gmail" || !binding || !folders.some(({ path }) => path === folder)) throw new MailAccountError("invalid-selection");
        if (!credential || !mailPermission("gmail", credential.scopes).imap) throw new GmailHistoryError("gmail-api-permission");
        return readGmailHistory(endpoint, token, settings.email, previous, signal);
      });
    },
    async fetchMessages(accountId: string, folder: string, cursor: ImapSyncCursor | undefined, reset: (validity: string) => Promise<void>, signal: AbortSignal) {
      const result = await useTransport(accountId, signal, async ({ settings, folders, oauth: identity }, password, credential) => {
        if (!folders.some(({ path }) => path === folder)) return { error: new MailAccountError("invalid-selection") };
        if (identity?.route === "graph" || (settings.provider === "outlook" && credential && !mailPermission("outlook", credential.scopes).imap)) return { error: new MailAccountError("oauth-reauthorize") };
        try {
          return { data: await fetchImapMessages({ endpoint: settings.imap, email: settings.email, password, signal, ...(settings.auth === "oauth2" && { oauth: true }) }, folder, cursor, reset) };
        } catch (error) {
          return { error: error instanceof MailAccountError ? error : new MailAccountError("message-read") };
        }
      });
      if (result.error) throw result.error;
      return result.data;
    },
    async markRead(accountId: string, folder: string, validity: string, uid: number, signal: AbortSignal) {
      return useTransport(accountId, signal, async ({ settings, folders, oauth: identity }, password, credential) => {
        if (!folders.some(({ path }) => path === folder)) return "needs-refresh" as const;
        if (identity?.route === "graph" || (settings.provider === "outlook" && credential && !mailPermission("outlook", credential.scopes).imap)) return "local" as const;
        try {
          return await markImapMessageRead({ endpoint: settings.imap, email: settings.email, password, signal, ...(settings.auth === "oauth2" && { oauth: true }) }, folder, validity, uid);
        } catch (error) {
          if (signal.aborted) throw error;
          return "local" as const;
        }
      });
    },
    async waitForInbox(accountId: string, folder: string, cursor: { uidValidity: string; through: number }, wake: () => void, signal: AbortSignal) {
      await useTransport(accountId, signal, async ({ settings, folders, oauth: identity }, password, credential) => {
        if (signal.aborted || !folders.some(({ path }) => path === folder)) return;
        if (identity?.route === "graph" || (settings.provider === "outlook" && credential && !mailPermission("outlook", credential.scopes).imap)) return;
        await waitForImapActivity({ endpoint: settings.imap, email: settings.email, password, signal, ...(settings.auth === "oauth2" && { oauth: true }) }, folder, cursor, wake);
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
    private readonly removals?: AccountRemovals,
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
      const save = () =>
        this.credentials.save({
          entityId: this.repair?.accountId ?? this.#id,
          expectedRevision: this.repair?.revision ?? null,
          definition,
          actions: [{ purpose: accountPasswordPurpose, action: "replace", value: password, ...(this.repair && { reconfigure: true as const }) }],
          ...(signal && { signal }),
        });
      const saved =
        this.repair && this.removals
          ? await this.removals.serialize(this.repair.accountId, () => {
              this.removals!.assertActive(this.repair!.accountId);
              return save();
            })
          : await save();
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
