import { Banner, Button, PageHead, useWorkbenchFeedback, WorkbenchToaster } from "@huhu/ui";
import { CapabilityError, host, useCapability, useEngine, useEngineEvents, useQueryClient, type ModuleProps } from "@huhu/workbench";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { DraftContent } from "../engine/draft-content.js";
import type { ConversationMessage, ConversationMessagesPage, ConversationSummary, ConversationsPage, LocatedMessage, MailLocationTarget } from "../engine/conversations.js";
import type { MailFolderSyncStatus } from "../engine/message-cache.js";
import { mailPreset, type MailProvider } from "../engine/presets.js";
import { mailDayWindow, type MailPeriod } from "../mail-calendar.js";
import { isPublicMailFolder } from "../mail-folder-visibility.js";
import { MailAccountDialog } from "./MailAccountDialog.js";
import { MailAccountNameDialog } from "./MailAccountNameDialog.js";
import { MailAccountRemovalDialog, type RemovalTarget } from "./MailAccountRemovalDialog.js";
import { MailCacheSettings } from "./MailCacheSettings.js";
import { MailAiSettings } from "./MailAiSettings.js";
import { MailComposer } from "./MailComposer.js";
import { MailReader, type MessageSummary, type RelatedDraft } from "./MailReader.js";
import { deliveryLabels, MailOutbox } from "./MailOutbox.js";
import { MailSearch } from "./MailSearch.js";
import { MailSyncSettings } from "./MailSyncSettings.js";
import { MailSubsetSettings } from "./MailSubsetSettings.js";
import { onMailNotificationRequest } from "./mail-notification-command.js";
import { onMailSearchRequest } from "./mail-search-command.js";
import type { DeliverySummary, Draft, DraftSummary, MailAccount } from "./mail-types.js";

const tabs = [
  { id: "mail", label: "邮箱" },
  { id: "drafts", label: "草稿" },
  { id: "outbox", label: "发件箱" },
] as const;
const emptyAccounts: MailAccount[] = [];
const isMailboxQuery = (name: unknown) => name === "mail.messages.latest" || name === "mail.sync.status" || String(name).startsWith("mail.conversations.");
const refreshErrors: Record<string, string> = {
  "oauth-reauthorize": "服务已拒绝当前授权，请重新授权。",
  "oauth-not-configured": "当前 Engine 主机没有此邮箱的授权客户端配置。",
  "gmail-api-account": "Gmail 返回的账号与当前邮箱不一致。",
  "gmail-api-unavailable": "Gmail API 暂时不可用，已同步邮件仍可查看，请稍后重试。",
};

function syncLabel(sync: MailFolderSyncStatus | null | undefined, exchange: boolean) {
  if (!sync) return "等待首次同步";
  if (sync.transport === "gmail") {
    const recovery = sync.recovery === "history-expired" ? " · 历史游标失效，已重新扫描" : sync.recovery === "history-window" ? " · 待同步变更较多，已重新扫描" : "";
    return `Gmail API · 收件箱 · 最近最多 ${sync.limit} 封${recovery}`;
  }
  const fallback = sync.fallback === "gmail-api-permission" ? " · Gmail API 权限不足或未启用" : sync.fallback === "gmail-api-auth" ? " · Gmail API 未接受当前授权" : "";
  return `${exchange ? "Exchange IMAP" : "IMAP"} · 所选目录 · 最近最多 ${sync.limit} 封${fallback}`;
}
const accountTitle = ({ definition: { settings } }: MailAccount) => settings.label || settings.email;
type AccountDialog = { kind: "add" } | { kind: "repair" | "rename"; account: MailAccount } | { kind: "remove"; target: RemovalTarget };
type ConversationSelection = { id: string; offset: number };
type MailTimeWindow = ReturnType<typeof mailDayWindow>;
const conversationPageSize = 20;

function relatedDraft({ kind, seed }: RelatedDraft, original: string): DraftContent {
  const empty: DraftContent = { accountId: seed.accountId, to: [], cc: [], bcc: [], subject: "", body: { type: "doc", content: [{ type: "paragraph" }] } };
  if (kind === "new-topic") return { ...empty, ...seed };
  const excerpt = original.trimEnd().slice(0, 24_000).split(/\r?\n/);
  const lines = excerpt.slice(0, 300);
  if (original.length > 24_000 || excerpt.length > 300) lines.push("…（引用已截短）");
  const makeParagraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
  const attribution = kind === "forward" ? (seed.forward.from ? `转发自 ${seed.forward.from}` : "转发的原邮件") : "引用原邮件";
  const quoted = original.trim() ? [makeParagraph(attribution), ...lines.map((line) => makeParagraph(`> ${line}`))] : [];
  return { ...empty, ...seed, body: { type: "doc", content: [{ type: "paragraph" }, ...quoted] } };
}

export function MailModule({ registerLeaveGuard }: Pick<ModuleProps, "registerLeaveGuard">) {
  const engine = useEngine();
  return <MailWorkspace key={engine.vaultId} {...(registerLeaveGuard && { registerLeaveGuard })} />;
}

function MailWorkspace({ registerLeaveGuard }: Pick<ModuleProps, "registerLeaveGuard">) {
  const engine = useEngine();
  const query = useQueryClient();
  const access = useCapability<{ readOnly: boolean }>("vault.info");
  const accounts = useCapability<{ available: boolean; accounts: MailAccount[]; pendingRemovals?: RemovalTarget[] }>("mail.accounts.list");
  const drafts = useCapability<{ drafts: DraftSummary[] }>("mail.drafts.list");
  const deliveries = useCapability<{ operations: DeliverySummary[] }>("mail.outbox.list");
  const settings = useCapability<{ dateTime: { zone: string } }>("settings.get");
  const zone = settings.data?.dateTime.zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [clock, setClock] = useState(() => new Date());
  const [period, setPeriod] = useState<MailPeriod>("today");
  const time = useMemo(() => mailDayWindow(period, zone, clock), [period, zone, clock]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [navigation, setNavigation] = useState<{ revision: number; location: LocatedMessage | null }>({ revision: 0, location: null });
  const noticeNavigation = useRef<AbortController | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("mail");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<AccountDialog | null>(null);
  const [accountView, setAccountView] = useState<"accounts" | "mailbox">("accounts");
  const [collapsed, setCollapsed] = useState<Set<MailProvider>>(() => new Set());
  const [composer, setComposer] = useState<{ draft: Draft | null; seed?: DraftContent } | null>(null);
  const [readingMessage, setReadingMessage] = useState<string | null>(null);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const composing = useRef(false);
  const composerSender = useRef<string | null>(null);
  const feedbackScope = `mail-${engine.vaultId}`;
  const feedback = useWorkbenchFeedback(feedbackScope);
  const [error, setError] = useState("");
  const composeTrigger = useRef<HTMLElement | null>(null);
  const accountActionTrigger = useRef<HTMLButtonElement | null>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const periodControl = useRef<HTMLSelectElement>(null);
  const accountList = useRef<HTMLElement>(null);
  const rememberedConversations = useRef(new Map<string, ConversationSelection>());
  const backAccounts = useRef<HTMLButtonElement>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const rows = accounts.data?.accounts ?? emptyAccounts;
  const accountVersions = JSON.stringify(rows.map(({ accountId, revision }) => [accountId, revision]).sort());
  const account = rows.find((row) => row.accountId === accountId);
  const conversationScope = account?.accountId ?? "";
  const selectionKey = JSON.stringify([conversationScope, time]);
  const location = navigation.location?.message.accountId === accountId && period === "all" ? navigation.location : null;
  const groups = new Map<MailProvider, MailAccount[]>();
  for (const row of rows) {
    const { provider } = row.definition.settings;
    const members = groups.get(provider);
    if (members) members.push(row);
    else groups.set(provider, [row]);
  }
  const draft = drafts.data?.drafts.find((row) => row.draftId === draftId) ?? drafts.data?.drafts[0];
  const operation = deliveries.data?.operations.find((row) => row.operationId === operationId) ?? deliveries.data?.operations[0];
  const activeOperationId = operationId ?? operation?.operationId;
  const readOnly = access.data?.readOnly !== false;
  const desktop = !!engine.endpoint.token;

  const refetchAccounts = accounts.refetch;
  useEngineEvents((event) => {
    if (event.type !== "entity.changed" || !("kind" in event.payload)) return;
    if (event.payload.kind === "mail-account") {
      noticeNavigation.current?.abort();
      setAccountEpoch((epoch) => epoch + 1);
      void refetchAccounts();
    }
    if (event.payload.kind === "mail-mailbox") {
      noticeNavigation.current?.abort();
      setAccountEpoch((epoch) => epoch + 1);
      setNavigation(({ revision }) => ({ revision, location: null }));
    }
    if (event.payload.kind === "mail-cache") {
      noticeNavigation.current?.abort();
      setAccountEpoch((epoch) => epoch + 1);
      setNavigation(({ revision }) => ({ revision: revision + 1, location: null }));
      const predicate = (entry: { queryKey: readonly unknown[] }) => entry.queryKey[0] === engine.vaultId && isMailboxQuery(entry.queryKey[1]);
      void query.cancelQueries({ predicate });
      void query.resetQueries({ predicate });
    }
    if (event.payload.kind === "mail-message" || event.payload.kind === "mail-mailbox") {
      void query.invalidateQueries({ predicate: (entry) => entry.queryKey[0] === engine.vaultId && isMailboxQuery(entry.queryKey[1]) });
    }
  });
  useEffect(() => {
    if (!readingMessage && !searchOpen) return;
    const timer = setInterval(() => void refetchAccounts(), 1500);
    return () => clearInterval(timer);
  }, [readingMessage, refetchAccounts, searchOpen]);
  useEffect(() => {
    void query.invalidateQueries({ predicate: (entry) => entry.queryKey[0] === engine.vaultId && String(entry.queryKey[1]).startsWith("mail.conversations.") });
  }, [accountVersions, engine, query]);
  useEffect(() => onMailSearchRequest(() => setSearchOpen(true)), []);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const changed = useCallback(
    (message: string, kind: "success" | "info" = "success") => {
      if (message) feedback(message, kind);
      void query.invalidateQueries({ predicate: (entry) => entry.queryKey[0] === engine.vaultId && String(entry.queryKey[1]).startsWith("mail.") });
    },
    [engine, feedback, query],
  );

  function closeComposer() {
    composing.current = false;
    composerSender.current = null;
    setComposer(null);
    requestAnimationFrame(() => composeTrigger.current?.focus());
  }

  function closeAccountDialog() {
    if (dialog?.kind !== "add") void accounts.refetch();
    setDialog(null);
  }

  useLayoutEffect(() => {
    if (dialog || !accountActionTrigger.current) return;
    const trigger = accountActionTrigger.current;
    accountActionTrigger.current = null;
    const frame = requestAnimationFrame(() => (trigger.isConnected && trigger.getClientRects().length ? trigger : accountList.current?.querySelector<HTMLElement>("[data-mail-all-accounts]"))?.focus());
    return () => cancelAnimationFrame(frame);
  }, [dialog]);

  function expandProvider(provider: MailProvider) {
    setCollapsed((current) => (current.has(provider) ? new Set([...current].filter((entry) => entry !== provider)) : current));
  }

  function chooseAccount(row: MailAccount, focus = true) {
    expandProvider(row.definition.settings.provider);
    setAccountId(row.accountId);
    setAccountView("mailbox");
    if (focus)
      requestAnimationFrame(() => {
        if (backAccounts.current?.getClientRects().length) backAccounts.current.focus();
      });
  }

  async function locate(target: MailLocationTarget, signal: AbortSignal) {
    const result = await engine.call<LocatedMessage | null>("mail.conversations.findMessage", { target, limit: conversationPageSize }, { signal });
    const owner = rows.find(({ accountId }) => accountId === target.accountId);
    if (!result || !owner || signal.aborted) return false;
    rememberedConversations.current.set(JSON.stringify([target.accountId, undefined]), { id: result.conversationId, offset: result.contactOffset });
    chooseAccount(owner, false);
    setError("");
    setTab("mail");
    setPeriod("all");
    setNavigation(({ revision }) => ({ revision: revision + 1, location: result }));
    return true;
  }

  const locateNotice = useRef(locate);
  locateNotice.current = locate;
  useEffect(() => {
    if (!accounts.isSuccess) return;
    const unregister = onMailNotificationRequest({ vaultId: engine.vaultId, endpoint: engine.endpoint.baseUrl }, (id) => {
      noticeNavigation.current?.abort();
      const controller = new AbortController();
      noticeNavigation.current = controller;
      void (async () => {
        try {
          const target = await engine.call<MailLocationTarget | null>("mail.notifications.target", { id }, { signal: controller.signal });
          if (target && (await locateNotice.current(target, controller.signal))) return;
        } catch {
          // Show one unavailable state for a retired account, folder or message.
        }
        if (!controller.signal.aborted) setError("这条邮件通知的目标已不可用。");
      })();
    });
    return () => {
      unregister();
      noticeNavigation.current?.abort();
    };
  }, [engine, accounts.isSuccess]);

  function clearLocation() {
    if (navigation.location) setNavigation(({ revision }) => ({ revision, location: null }));
  }

  function returnToAccounts() {
    if (account) expandProvider(account.definition.settings.provider);
    setAccountView("accounts");
    const id = accountId;
    requestAnimationFrame(() => {
      const selector = id ? `[data-mail-account="${CSS.escape(id)}"]` : "[data-mail-all-accounts]";
      accountList.current?.querySelector<HTMLElement>(selector)?.focus();
    });
  }

  function showComposer(draft: Draft | null, seed?: DraftContent, trigger = document.activeElement) {
    if (composing.current) {
      document.querySelector<HTMLElement>('.hu-mail-compose [contenteditable="true"]')?.focus();
      feedback("请先完成当前草稿。", "info");
      return;
    }
    composing.current = true;
    composerSender.current = draft ? draft.accountId : seed ? seed.accountId : account?.definition.settings.smtpEnabled ? account.accountId : null;
    composeTrigger.current = trigger instanceof HTMLElement ? trigger : null;
    setComposer({ draft, ...(seed && { seed }) });
  }

  function composeFromMessage(draft: RelatedDraft, quote: string, trigger: HTMLElement | null) {
    showComposer(null, relatedDraft(draft, quote), trigger);
  }

  async function resume(id: string) {
    setError("");
    setLoadingDraft(true);
    try {
      const { draft: saved } = await engine.call<{ draft: Draft | null }>("mail.drafts.get", { draftId: id });
      if (!saved) throw new Error("此草稿已被丢弃或移除。");
      showComposer(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法打开草稿。");
    } finally {
      setLoadingDraft(false);
    }
  }

  function showDelivery(id: string) {
    setOperationId(id);
    setTab("outbox");
    changed("投递请求已受理，请查看逐收件人结果。", "info");
  }

  const accountSetupAvailable = desktop && !readOnly && accounts.data?.available;
  const currentQuery = tab === "mail" ? accounts : tab === "drafts" ? drafts : deliveries;
  const original = (composer?.draft ?? composer?.seed)?.reply;

  return (
    <div
      className="hu-mail-workspace"
      onKeyDown={(event) => {
        if (searchOpen && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") event.preventDefault();
      }}
    >
      <PageHead
        title="邮件"
        actions={
          <>
            <button type="button" className="hu-btn" ref={searchTrigger} onClick={() => setSearchOpen(true)}>
              搜索邮件
            </button>
            <Button disabled={readOnly} onClick={() => showComposer(null)}>
              写信
            </Button>
            <Button
              variant="primary"
              disabled={!accountSetupAvailable}
              onClick={(e) => {
                accountActionTrigger.current = e.currentTarget;
                setDialog({ kind: "add" });
              }}
            >
              添加邮箱
            </Button>
          </>
        }
      />
      <MailSyncSettings readOnly={readOnly} accountNames={new Map(rows.map((row) => [row.accountId, accountTitle(row)]))} />
      <MailAiSettings key={engine.endpoint.baseUrl} readOnly={readOnly} desktop={desktop} />
      <MailCacheSettings readOnly={readOnly} />
      <MailSubsetSettings readOnly={readOnly} canRestore={accounts.data?.available === true} accounts={new Map(rows.map((row) => [row.accountId, accountTitle(row)]))} />
      <nav className="hu-mail-row" aria-label="邮件工作区">
        {tabs.map(({ id, label }) => (
          <Button
            key={id}
            variant={tab === id ? "primary" : "ghost"}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setTab(id);
              if (id !== tab) clearLocation();
              setError("");
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
      <MailSearch
        open={searchOpen}
        zone={zone}
        accounts={rows}
        sourceRevision={`${accountEpoch}:${accountVersions}`}
        onClose={(located) => {
          setSearchOpen(false);
          if (!located)
            requestAnimationFrame(() => {
              if (document.activeElement === document.body) searchTrigger.current?.focus();
            });
        }}
        onLocate={locate}
      />
      <WorkbenchToaster scope={feedbackScope} />
      {error && <Banner tone="danger">{error}</Banner>}
      {currentQuery.isError && (
        <Banner tone="danger" action={<Button onClick={() => void currentQuery.refetch()}>重试</Button>}>
          无法读取邮件工作区。
        </Banner>
      )}
      {access.isError && (
        <Banner tone="danger" action={<Button onClick={() => void access.refetch()}>重试</Button>}>
          无法确认 Vault 的写入状态。
        </Banner>
      )}
      {currentQuery.isPending && <p>正在读取邮件工作区…</p>}
      {tab === "mail" && !currentQuery.isPending && (
        <div className="hu-mail-columns hu-mail-account-columns" data-account-view={rows.length ? accountView : "accounts"}>
          <aside ref={accountList} aria-label="邮箱账号" className="hu-mail-list hu-mail-account-sidebar">
            <Button
              data-mail-all-accounts=""
              aria-pressed={!account}
              onClick={() => {
                setAccountId(null);
                clearLocation();
                if (rows.length) {
                  setAccountView("mailbox");
                  requestAnimationFrame(() => {
                    if (backAccounts.current?.getClientRects().length) backAccounts.current.focus();
                  });
                }
              }}
            >
              全部账号
            </Button>
            {[...groups].map(([provider, members]) => (
              <div key={provider} className="hu-mail-provider">
                <Button
                  variant="ghost"
                  aria-expanded={!collapsed.has(provider)}
                  onClick={() => setCollapsed((current) => (current.has(provider) ? new Set([...current].filter((item) => item !== provider)) : new Set([...current, provider])))}
                >
                  {mailPreset(provider).label}
                </Button>
                <div className="hu-mail-provider-accounts" hidden={collapsed.has(provider)}>
                  {members.map((row) => (
                    <Button
                      key={row.accountId}
                      data-mail-account={row.accountId}
                      aria-pressed={row.accountId === account?.accountId}
                      onClick={() => {
                        if (row.accountId !== accountId) clearLocation();
                        chooseAccount(row);
                      }}
                    >
                      {accountTitle(row)}
                      {row.authState["account-password"] !== "configured" && <span className="hu-mail-help"> · 凭据待检查</span>}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {accountSetupAvailable &&
              accounts.data?.pendingRemovals?.map((target) => (
                <Button
                  key={target.accountId}
                  onClick={(event) => {
                    accountActionTrigger.current = event.currentTarget;
                    setDialog({ kind: "remove", target });
                  }}
                >
                  继续清理 {target.label}
                </Button>
              ))}
          </aside>
          {rows.length ? (
            <Mailbox
              key={`${selectionKey}:${navigation.revision}`}
              account={account}
              accounts={rows}
              zone={zone}
              period={period}
              time={time}
              location={location}
              periodControl={periodControl}
              onPeriod={(next) => {
                clearLocation();
                setPeriod(next);
                requestAnimationFrame(() => periodControl.current?.focus());
              }}
              readOnly={readOnly}
              onCompose={composeFromMessage}
              onReading={setReadingMessage}
              remembered={rememberedConversations.current.get(selectionKey)}
              onConversation={(selection) => rememberedConversations.current.set(selectionKey, selection)}
              backAccounts={backAccounts}
              onBack={returnToAccounts}
              {...(account &&
                accountSetupAvailable && {
                  onAccountAction: (kind: "repair" | "rename" | "remove", trigger: HTMLButtonElement) => {
                    accountActionTrigger.current = trigger;
                    if (kind === "remove") setDialog({ kind, target: { accountId: account.accountId, expectedRevision: account.revision, label: accountTitle(account) } });
                    else setDialog({ kind, account });
                  },
                })}
            />
          ) : (
            <article className="hu-mail-detail hu-mail-account-overview">
              <h2>添加第一个邮箱</h2>
              <p>
                {!desktop
                  ? "请在桌面端添加邮箱，再回到这里查看账号和草稿。"
                  : access.data?.readOnly
                    ? "此 Vault 为只读。"
                    : accounts.data?.available === false
                      ? "此主机的本机邮箱凭据存储不可用。"
                      : "添加邮箱并测试 IMAP 连接后，即可选择要同步的目录。"}
              </p>
            </article>
          )}
        </div>
      )}
      {tab === "drafts" && !currentQuery.isPending && (
        <>
          <p className="hu-mail-help">本机草稿与服务商 Drafts 独立。</p>
          <div className="hu-mail-columns">
            <aside className="hu-mail-list" aria-label="草稿列表">
              {drafts.data?.drafts.map((row) => (
                <Button key={row.draftId} aria-pressed={row.draftId === draft?.draftId} onClick={() => setDraftId(row.draftId)}>
                  {row.subject || "未填写主题"}
                </Button>
              ))}
              {!draft && <p>暂无草稿。</p>}
            </aside>
            {draft && (
              <article className="hu-mail-detail">
                <h2>{draft.subject || "未填写主题"}</h2>
                <p>{rows.find((row) => row.accountId === draft.accountId)?.definition.settings.email ?? "未选发件人"}</p>
                <Button variant="primary" loading={loadingDraft} onClick={() => void resume(draft.draftId)}>
                  {readOnly ? "查看草稿" : "继续编辑"}
                </Button>
              </article>
            )}
          </div>
        </>
      )}
      {tab === "outbox" && !currentQuery.isPending && (
        <>
          <p className="hu-mail-help">本机投递记录与服务商 Sent 独立。</p>
          <div className="hu-mail-columns">
            <aside className="hu-mail-list" aria-label="投递记录列表">
              {deliveries.data?.operations.map((row) => (
                <Button key={row.operationId} aria-pressed={row.operationId === activeOperationId} onClick={() => setOperationId(row.operationId)}>
                  {row.retained ? "保留的投递记录" : row.subject || "未填写主题"} · {deliveryLabels[row.state]}
                </Button>
              ))}
              {!activeOperationId && <p>暂无投递记录。</p>}
            </aside>
            {activeOperationId && (
              <MailOutbox
                key={activeOperationId}
                operationId={activeOperationId}
                readOnly={readOnly}
                onChanged={changed}
                onRetry={showDelivery}
                onDeleted={() => {
                  setOperationId(null);
                  changed("已删除本机投递记录。");
                }}
              />
            )}
          </div>
        </>
      )}
      {dialog?.kind === "add" && (
        <MailAccountDialog
          onClose={closeAccountDialog}
          onSaved={(id) => {
            closeAccountDialog();
            setTab("mail");
            setAccountId(id);
            setAccountView("mailbox");
            changed("邮箱已保存。");
          }}
        />
      )}
      {dialog?.kind === "repair" && (
        <MailAccountDialog
          key={dialog.account.accountId}
          repair={dialog.account}
          onClose={closeAccountDialog}
          onSaved={() => {
            closeAccountDialog();
            changed("邮箱认证已更新。");
          }}
        />
      )}
      {dialog?.kind === "rename" && (
        <MailAccountNameDialog
          key={dialog.account.accountId}
          account={dialog.account}
          onClose={closeAccountDialog}
          onSaved={() => {
            closeAccountDialog();
            changed("邮箱名称已更新。");
          }}
        />
      )}
      {dialog?.kind === "remove" && (
        <MailAccountRemovalDialog
          key={dialog.target.accountId}
          target={dialog.target}
          onClose={closeAccountDialog}
          onProgress={(state) => {
            if (state) {
              if (composerSender.current === dialog.target.accountId) {
                composing.current = false;
                composerSender.current = null;
                setComposer(null);
              }
              if (accountId === dialog.target.accountId) {
                setAccountId(null);
                setAccountView("accounts");
              }
            }
            if (state === "removed") {
              accountActionTrigger.current = accountList.current?.querySelector<HTMLButtonElement>("[data-mail-all-accounts]") ?? null;
              closeAccountDialog();
            }
            changed(state === "removed" ? "已删除该邮箱的本机资料。" : "");
          }}
        />
      )}
      {composer && (
        <MailComposer
          draft={composer.draft}
          {...(composer.seed && { seed: composer.seed })}
          inline={tab === "mail" && !!original && original.localMessageId === readingMessage}
          accounts={rows}
          initialAccountId={account?.definition.settings.smtpEnabled ? account.accountId : null}
          readOnly={readOnly}
          previousDelivery={!!composer.draft && !!deliveries.data?.operations.some((record) => record.draftId === composer.draft?.draftId)}
          {...(registerLeaveGuard && { registerLeaveGuard })}
          onChanged={changed}
          onSenderChange={(sender) => {
            composerSender.current = sender;
          }}
          onClose={closeComposer}
          onSent={(id) => {
            composing.current = false;
            composerSender.current = null;
            setComposer(null);
            showDelivery(id);
          }}
        />
      )}
    </div>
  );
}

function Mailbox({
  account,
  accounts,
  zone,
  period,
  time,
  location,
  periodControl,
  onPeriod,
  readOnly,
  backAccounts,
  onBack,
  onReading,
  remembered,
  onConversation,
  onCompose,
  onAccountAction,
}: {
  account: MailAccount | undefined;
  accounts: MailAccount[];
  zone: string;
  period: MailPeriod;
  time: MailTimeWindow;
  location: LocatedMessage | null;
  periodControl: Ref<HTMLSelectElement>;
  onPeriod(period: MailPeriod): void;
  readOnly: boolean;
  backAccounts: Ref<HTMLButtonElement>;
  onBack(): void;
  onReading(id: string | null): void;
  remembered?: ConversationSelection | undefined;
  onConversation(selection: ConversationSelection): void;
  onCompose(draft: RelatedDraft, quote: string, trigger: HTMLElement | null): void;
  onAccountAction?(kind: "repair" | "rename" | "remove", trigger: HTMLButtonElement): void;
}) {
  const engine = useEngine();
  const query = useQueryClient();
  const [selected, setSelected] = useState(location && location.message.source !== "sent" ? location.message.folder : "INBOX");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<ConversationMessage | null>(location?.message ?? null);
  const [ordinary, setOrdinary] = useState<MessageSummary | null>(null);
  const [offset, setOffset] = useState(location?.contactOffset ?? remembered?.offset ?? 0);
  const [conversationId, setConversationId] = useState(location?.conversationId ?? remembered?.id ?? "");
  const request = useRef<AbortController | null>(null);
  const messageTrigger = useRef<HTMLButtonElement | null>(null);
  const backMessages = useRef<HTMLButtonElement>(null);
  const contactsHeading = useRef<HTMLHeadingElement>(null);
  const mailbox = useRef<HTMLElement>(null);
  const folder = account?.definition.folders.some(({ path }) => path === selected) ? selected : "INBOX";
  const sync = useCapability<MailFolderSyncStatus | null>("mail.sync.status", { accountId: account?.accountId, folder }, { enabled: !!account });
  const list = useCapability<ConversationsPage>("mail.conversations.list", { ...(account && { accountId: account.accountId }), ...(time && { time }), offset, limit: conversationPageSize });
  const conversations = list.data?.conversations ?? [];
  const conversation = conversations.find((row) => row.conversationId === conversationId) ?? conversations[0];
  const owner = opened && accounts.find((row) => row.accountId === opened.accountId);
  const visible = opened && owner && (opened.source === "sent" || owner.definition.folders.some((row) => row.path === opened.folder && isPublicMailFolder(row)));
  const activeMessage = visible && conversation?.conversationId === conversationId ? opened : null;
  const ordinaryMessage = ordinary && ordinary.accountId === account?.accountId && account.definition.folders.some(({ path }) => path === ordinary.folder) ? ordinary : null;
  const reading = !!(activeMessage || ordinaryMessage);

  const revokeOpened = useCallback(() => {
    setOpened(null);
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) contactsHeading.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (opened && (!visible || (list.isSuccess && !list.isFetching && activeMessage === null))) revokeOpened();
  }, [activeMessage, list.isFetching, list.isSuccess, opened, revokeOpened, visible]);
  useEffect(() => {
    if (ordinary && !ordinaryMessage) setOrdinary(null);
  }, [ordinary, ordinaryMessage]);

  useEffect(() => {
    onReading(ordinaryMessage?.localMessageId ?? (activeMessage && activeMessage.source !== "sent" ? activeMessage.localMessageId : null));
    return () => onReading(null);
  }, [onReading, activeMessage, ordinaryMessage]);

  useEffect(() => {
    setError("");
    setRefreshing(false);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [engine, account?.revision]);

  async function refresh(sourceFolder = folder, sourceAccount = account?.accountId) {
    if (request.current || !sourceAccount) return;
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    setError("");
    try {
      const result = await engine.call<{ mailboxChanged: boolean }>("mail.sync.refresh", { accountId: sourceAccount, folder: sourceFolder }, { write: true, signal: controller.signal });
      if (controller.signal.aborted) return;
      await query.invalidateQueries({ predicate: (entry) => entry.queryKey[0] === engine.vaultId && isMailboxQuery(entry.queryKey[1]) });
      if (!controller.signal.aborted && result.mailboxChanged) {
        setOpened((current) => (current && current.source !== "sent" && current.accountId === sourceAccount && current.folder === sourceFolder ? null : current));
        setOrdinary((current) => (current?.accountId === sourceAccount && current.folder === sourceFolder ? null : current));
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof CapabilityError ? (refreshErrors[String(err.details?.reason)] ?? err.message) : "无法刷新此目录。");
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }

  function changePage(nextOffset: number) {
    setOpened(null);
    setConversationId("");
    setOffset(nextOffset);
    onConversation({ id: "", offset: nextOffset });
    contactsHeading.current?.focus();
  }

  return (
    <article ref={mailbox} className="hu-mail-detail hu-mail-account-detail" data-reading={reading}>
      <div className="hu-mail-narrow-back hu-mail-mailbox-nav">
        <button type="button" className="hu-btn" ref={backAccounts} onClick={onBack}>
          返回账号
        </button>
      </div>
      {reading && (
        <div className="hu-mail-narrow-back">
          <button
            type="button"
            className="hu-btn"
            ref={backMessages}
            onClick={() => {
              const message = activeMessage && conversationMessageKey(activeMessage);
              const target = message && mailbox.current?.querySelector<HTMLButtonElement>(`[data-mail-timeline-message="${CSS.escape(message)}"]`);
              setOpened(null);
              setOrdinary(null);
              requestAnimationFrame(() => {
                const trigger = target || messageTrigger.current;
                if (trigger?.getClientRects().length) trigger.focus();
                else contactsHeading.current?.focus();
              });
            }}
          >
            返回邮件列表
          </button>
        </div>
      )}
      <div className="hu-mail-detail hu-mail-mailbox-toolbar">
        <h2>{account ? accountTitle(account) : "全部账号"}</h2>
        <div className="hu-mail-row">
          <label>
            时间{" "}
            <select ref={periodControl} value={period} onChange={(event) => onPeriod(event.target.value as MailPeriod)}>
              <option value="all">全部时间</option>
              <option value="today">今天</option>
              <option value="yesterday">昨天</option>
              <option value="last3">近三天</option>
            </select>
          </label>
        </div>
        {account && (
          <>
            <p>
              {account.definition.settings.email}
              {account.definition.oauth && " · OAuth"}
              {account.definition.settings.smtpEnabled ? "" : " · 只接收"}
            </p>
            <div className="hu-mail-row">
              <label>
                目录{" "}
                <select
                  value={folder}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setError("");
                    setOpened(null);
                    setOrdinary(null);
                  }}
                  disabled={refreshing}
                >
                  {account.definition.folders.map(({ path }) => (
                    <option key={path}>{path}</option>
                  ))}
                </select>
              </label>
              <Button loading={refreshing} disabled={readOnly || account.authState["account-password"] !== "configured"} onClick={() => void refresh()}>
                同步目录
              </Button>
              <FolderLatestButton
                accountId={account.accountId}
                folder={folder}
                onOpen={(message, trigger) => {
                  setOpened(null);
                  messageTrigger.current = trigger;
                  setOrdinary(message);
                  requestAnimationFrame(() => {
                    if (backMessages.current?.getClientRects().length) backMessages.current.focus();
                  });
                }}
              />
            </div>
            <p role="status">{sync.isError ? "无法读取目录同步状态" : syncLabel(sync.data, account.definition.settings.provider === "outlook" && !!account.definition.oauth)}</p>
            {account.authState["account-password"] !== "configured" && <p>本机邮箱凭据当前不可用，已有缓存仍可查看。</p>}
          </>
        )}
        {onAccountAction && (
          <div className="hu-mail-row">
            <Button onClick={(event) => onAccountAction("repair", event.currentTarget)}>{account?.definition.oauth ? "重新授权" : "修复认证"}</Button>
            <Button variant="ghost" onClick={(event) => onAccountAction("rename", event.currentTarget)}>
              更改名称
            </Button>
            <Button variant="danger" onClick={(event) => onAccountAction("remove", event.currentTarget)}>
              删除邮箱
            </Button>
          </div>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
        {list.isError && (
          <Banner tone="danger" action={<Button onClick={() => void list.refetch()}>重试读取</Button>}>
            无法读取本机邮件缓存。
          </Banner>
        )}
      </div>
      <div className="hu-mail-contact-columns">
        <aside className="hu-mail-list hu-mail-mailbox-nav" aria-label="联系人对话">
          <h3 ref={contactsHeading} tabIndex={-1}>
            联系人
          </h3>
          <p className="hu-mail-help">已选可见目录和本机已发的缓存</p>
          {list.isPending && <p role="status">正在读取联系人。</p>}
          {conversations.map((row) => (
            <Button
              key={row.conversationId}
              aria-pressed={row.conversationId === conversation?.conversationId}
              onClick={() => {
                setOpened(null);
                setOrdinary(null);
                setConversationId(row.conversationId);
                onConversation({ id: row.conversationId, offset });
              }}
            >
              <span className="hu-mail-contact-label">
                <strong>
                  {row.participants.join("、")}
                  {row.unread ? ` · ${row.unread} 封未读` : ""}
                </strong>
                <span className="hu-mail-help">
                  {row.latest.subject || "无主题"}
                  {row.latest.date ? ` · ${new Date(row.latest.date).toLocaleDateString(undefined, { timeZone: zone })}` : ""}
                </span>
              </span>
            </Button>
          ))}
          {list.data && !conversations.length && <p>{period === "all" ? "此邮箱暂无已缓存的公开对话。" : "所选时间没有缓存对话，可切换到全部时间。"}</p>}
          {list.data && (offset > 0 || list.data.nextOffset !== null) && (
            <nav className="hu-mail-row" aria-label="联系人分页">
              <Button disabled={!offset} onClick={() => changePage(Math.max(0, offset - conversationPageSize))}>
                上页
              </Button>
              <Button disabled={list.data.nextOffset === null} onClick={() => changePage(list.data!.nextOffset!)}>
                下页
              </Button>
            </nav>
          )}
        </aside>
        {ordinaryMessage ? (
          <MailReader
            key={ordinaryMessage.localMessageId}
            view="mailbox"
            message={ordinaryMessage}
            readOnly={readOnly}
            onCompose={onCompose}
            onRefresh={refresh}
            onRevoked={() => setOrdinary(null)}
            onRead={async () => {
              const latest = await engine.call<{ message: MessageSummary | null }>("mail.messages.latest", { accountId: ordinaryMessage.accountId, folder: ordinaryMessage.folder });
              setOrdinary((current) => (current?.localMessageId === latest.message?.localMessageId ? latest.message : current));
              return list.refetch();
            }}
          />
        ) : (
          conversation && (
            <ConversationTimeline
              key={conversation.conversationId}
              conversation={conversation}
              accountId={account?.accountId}
              accounts={accounts}
              time={time}
              location={location?.conversationId === conversation.conversationId ? location : null}
              opened={activeMessage}
              readOnly={readOnly}
              onCompose={onCompose}
              onRefresh={refresh}
              onChanged={list.refetch}
              onRevoked={revokeOpened}
              onOpen={(message, trigger) => {
                setConversationId(conversation.conversationId);
                onConversation({ id: conversation.conversationId, offset });
                messageTrigger.current = trigger;
                setOpened(message);
                if (message)
                  requestAnimationFrame(() => {
                    if (backMessages.current?.getClientRects().length) backMessages.current.focus();
                  });
              }}
            />
          )
        )}
      </div>
    </article>
  );
}

function FolderLatestButton({ accountId, folder, onOpen }: { accountId: string; folder: string; onOpen(message: MessageSummary, trigger: HTMLButtonElement): void }) {
  const latest = useCapability<{ message: MessageSummary | null }>("mail.messages.latest", { accountId, folder });
  return (
    <Button
      disabled={!latest.data?.message}
      onClick={(event) => {
        if (latest.data?.message) onOpen(latest.data.message, event.currentTarget);
      }}
    >
      阅读目录最新邮件
    </Button>
  );
}

function conversationMessageKey(message: ConversationMessage) {
  return message.source === "sent" ? message.operationId : message.localMessageId;
}

function ConversationTimeline({
  conversation,
  accountId,
  accounts,
  time,
  location,
  opened,
  readOnly,
  onCompose,
  onRefresh,
  onChanged,
  onOpen,
  onRevoked,
}: {
  conversation: ConversationSummary;
  accountId: string | undefined;
  accounts: MailAccount[];
  time: MailTimeWindow;
  location: LocatedMessage | null;
  opened: ConversationMessage | null;
  readOnly: boolean;
  onCompose(draft: RelatedDraft, quote: string, trigger: HTMLElement | null): void;
  onRefresh(folder: string, accountId: string): Promise<void>;
  onChanged(): Promise<unknown>;
  onOpen(message: ConversationMessage | null, trigger: HTMLButtonElement): void;
  onRevoked(): void;
}) {
  const [offset, setOffset] = useState(location?.messageOffset ?? 0);
  const [copyStatus, setCopyStatus] = useState("");
  const [highlighted, setHighlighted] = useState(false);
  const targetReader = useRef<HTMLDivElement>(null);
  const hasFocused = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const page = useCapability<ConversationMessagesPage>("mail.conversations.messages", { ...(accountId && { accountId }), ...(time && { time }), conversationId: conversation.conversationId, offset, limit: conversationPageSize });
  const current = opened && conversationMessageKey(opened);
  const reader = current ? page.data?.messages.find((message) => conversationMessageKey(message) === current) : null;
  const isTarget = !!reader && !!location && current === conversationMessageKey(location.message);

  useEffect(() => {
    if (current && page.isSuccess && !page.isFetching && !reader) onRevoked();
  }, [current, onRevoked, page.isFetching, page.isSuccess, reader]);

  useLayoutEffect(() => {
    if (!isTarget || hasFocused.current) return;
    const frame = requestAnimationFrame(() => {
      targetReader.current?.scrollIntoView({ block: "center" });
      targetReader.current?.focus({ preventScroll: true });
      hasFocused.current = true;
      setHighlighted(true);
    });
    const timer = setTimeout(() => setHighlighted(false), 4300);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [isTarget]);

  async function copy(address: string) {
    try {
      const desktop = host();
      if (desktop?.copyText) await desktop.copyText(address);
      else await navigator.clipboard.writeText(address);
      setCopyStatus(`已复制 ${address}`);
    } catch {
      setCopyStatus("无法复制地址。");
    }
  }

  function movePage(next: number, trigger: HTMLButtonElement) {
    onOpen(null, trigger);
    setOffset(next);
    heading.current?.focus();
  }

  return (
    <section className="hu-mail-detail" aria-label="缓存邮件往来">
      <div className="hu-mail-mailbox-nav hu-mail-detail">
        <h3 tabIndex={-1} ref={heading}>
          往来 · {conversation.count} 封邮件
        </h3>
        {(host()?.copyText || navigator.clipboard) && (
          <div className="hu-mail-row" aria-label="公开参与者" role="group">
            {conversation.participants.map((address) => (
              <Button key={address} type="button" variant="ghost" aria-label={`复制 ${address}`} onClick={() => void copy(address)}>
                {address}
              </Button>
            ))}
          </div>
        )}
        {copyStatus && <p role="status">{copyStatus}</p>}
        {page.isPending && <p role="status">正在读取缓存邮件。</p>}
        {page.isError && (
          <Banner tone="danger" action={<Button onClick={() => void page.refetch()}>重试读取</Button>}>
            无法读取此对话。
          </Banner>
        )}
        {page.data?.messages.map((message) => {
          const key = conversationMessageKey(message);
          const selected = key === current;
          return (
            <div className="hu-mail-row" key={key}>
              <Button data-mail-timeline-message={key} aria-expanded={selected} onClick={(event) => onOpen(selected ? null : message, event.currentTarget)}>
                {message.subject || "无主题"}
              </Button>
              {!accountId && <span className="hu-mail-help">{accounts.find((account) => account.accountId === message.accountId)?.definition.settings.email}</span>}
              <span className="hu-mail-help">{message.source === "sent" ? "本机已发" : `${message.folder} · ${message.source === "gmail" ? "Gmail API" : "IMAP"}`}</span>
              {message.source !== "sent" && message.readState === "unread" && <span>未读</span>}
            </div>
          );
        })}
        {page.data && (offset > 0 || page.data.nextOffset !== null) && (
          <nav className="hu-mail-row" aria-label="往来分页">
            <Button disabled={!offset} onClick={(event) => movePage(Math.max(0, offset - conversationPageSize), event.currentTarget)}>
              上页
            </Button>
            <Button disabled={page.data.nextOffset === null} onClick={(event) => movePage(page.data!.nextOffset!, event.currentTarget)}>
              下页
            </Button>
          </nav>
        )}
      </div>
      {reader && (
        <div ref={targetReader} {...(isTarget && { tabIndex: -1, role: "group", "aria-label": "已定位邮件", "data-mail-highlighted": highlighted })}>
          {isTarget && reader.source !== "sent" && <h3>{reader.subject || "无主题"}</h3>}
          {reader.source !== "sent" ? (
            <MailReader
              key={reader.localMessageId}
              view="conversation"
              message={reader}
              onRevoked={onRevoked}
              readOnly={readOnly}
              onRead={async () => {
                void onChanged();
                return page.refetch();
              }}
              onRefresh={() => onRefresh(reader.folder, reader.accountId)}
              onCompose={onCompose}
            />
          ) : (
            <SentConversationMessage key={reader.operationId} message={reader} />
          )}
        </div>
      )}
    </section>
  );
}

function SentConversationMessage({ message }: { message: Extract<ConversationMessage, { source: "sent" }> }) {
  const body = useCapability<{ text: string }>("mail.conversations.sentBody", { accountId: message.accountId, operationId: message.operationId });
  return (
    <section className="hu-mail-reader" aria-label="本机已发正文">
      <h3>{message.subject || "无主题"}</h3>
      {body.isPending && <p>正在读取本机已发正文…</p>}
      {body.isError && <Banner>此邮件已不在公开对话中。</Banner>}
      {body.data && <p className="hu-mail-plain">{body.data.text || "没有可显示的正文。"}</p>}
    </section>
  );
}
