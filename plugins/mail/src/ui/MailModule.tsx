import { Banner, Button, PageHead, useWorkbenchFeedback, WorkbenchToaster } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine, useQueryClient, type ModuleProps } from "@huhu/workbench";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";
import { mailPreset, type MailProvider } from "../engine/presets.js";
import { MailAccountDialog } from "./MailAccountDialog.js";
import { MailAccountNameDialog } from "./MailAccountNameDialog.js";
import { MailComposer } from "./MailComposer.js";
import { MailReader, type MessageSummary } from "./MailReader.js";
import { deliveryLabels, MailOutbox } from "./MailOutbox.js";
import type { DeliverySummary, Draft, DraftSummary, MailAccount } from "./mail-types.js";

const tabs = [
  { id: "mail", label: "邮箱" },
  { id: "drafts", label: "草稿" },
  { id: "outbox", label: "发件箱" },
] as const;
const emptyAccounts: MailAccount[] = [];
const accountTitle = ({ definition: { settings } }: MailAccount) => settings.label || settings.email;
type AccountDialog = { kind: "add" } | { kind: "repair" | "rename"; account: MailAccount };

export function MailModule({ registerLeaveGuard }: Pick<ModuleProps, "registerLeaveGuard">) {
  const engine = useEngine();
  return <MailWorkspace key={engine.vaultId} {...(registerLeaveGuard && { registerLeaveGuard })} />;
}

function MailWorkspace({ registerLeaveGuard }: Pick<ModuleProps, "registerLeaveGuard">) {
  const engine = useEngine();
  const query = useQueryClient();
  const access = useCapability<{ readOnly: boolean }>("vault.info");
  const accounts = useCapability<{ available: boolean; accounts: MailAccount[] }>("mail.accounts.list");
  const drafts = useCapability<{ drafts: DraftSummary[] }>("mail.drafts.list");
  const deliveries = useCapability<{ operations: DeliverySummary[] }>("mail.outbox.list");
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("mail");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<AccountDialog | null>(null);
  const [accountView, setAccountView] = useState<"accounts" | "mailbox">("accounts");
  const [collapsed, setCollapsed] = useState<Set<MailProvider>>(() => new Set());
  const [composer, setComposer] = useState<{ draft: Draft | null } | null>(null);
  const feedbackScope = `mail-${engine.vaultId}`;
  const feedback = useWorkbenchFeedback(feedbackScope);
  const [error, setError] = useState("");
  const composeTrigger = useRef<HTMLElement | null>(null);
  const accountActionTrigger = useRef<HTMLButtonElement | null>(null);
  const accountList = useRef<HTMLElement>(null);
  const backAccounts = useRef<HTMLButtonElement>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const rows = accounts.data?.accounts ?? emptyAccounts;
  const account = rows.find((row) => row.accountId === accountId);
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

  const changed = useCallback(
    (message: string, kind: "success" | "info" = "success") => {
      if (message) feedback(message, kind);
      void query.invalidateQueries({ predicate: (entry) => entry.queryKey[0] === engine.vaultId && String(entry.queryKey[1]).startsWith("mail.") });
    },
    [engine, feedback, query],
  );

  function closeComposer() {
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
    const frame = requestAnimationFrame(() => trigger.focus());
    return () => cancelAnimationFrame(frame);
  }, [dialog]);

  function expandProvider(provider: MailProvider) {
    setCollapsed((current) => (current.has(provider) ? new Set([...current].filter((entry) => entry !== provider)) : current));
  }

  function chooseAccount(row: MailAccount) {
    expandProvider(row.definition.settings.provider);
    setAccountId(row.accountId);
    setAccountView("mailbox");
    requestAnimationFrame(() => {
      if (backAccounts.current?.getClientRects().length) backAccounts.current.focus();
    });
  }

  function returnToAccounts() {
    if (account) expandProvider(account.definition.settings.provider);
    setAccountView("accounts");
    const id = accountId;
    requestAnimationFrame(() => {
      if (id) accountList.current?.querySelector<HTMLElement>(`[data-mail-account="${CSS.escape(id)}"]`)?.focus();
    });
  }

  function showComposer(draft: Draft | null) {
    if (composer) {
      document.querySelector<HTMLElement>('.hu-mail-compose [name="accountId"]')?.focus();
      feedback("请先完成当前草稿。", "info");
      return;
    }
    composeTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setComposer({ draft });
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

  return (
    <div className="hu-mail-workspace">
      <PageHead
        title="邮件"
        actions={
          <>
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
      <nav className="hu-mail-row" aria-label="邮件工作区">
        {tabs.map(({ id, label }) => (
          <Button
            key={id}
            variant={tab === id ? "primary" : "ghost"}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setTab(id);
              setError("");
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
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
        <div className="hu-mail-columns hu-mail-account-columns" data-account-view={account ? accountView : "accounts"}>
          <aside ref={accountList} aria-label="邮箱账号" className="hu-mail-list hu-mail-account-sidebar">
            <Button
              aria-pressed={!account}
              onClick={() => {
                setAccountId(null);
                setAccountView("accounts");
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
                    <Button key={row.accountId} data-mail-account={row.accountId} aria-pressed={row.accountId === account?.accountId} onClick={() => chooseAccount(row)}>
                      {accountTitle(row)}
                      {row.authState["account-password"] !== "configured" && <span className="hu-mail-help"> · 凭据待检查</span>}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </aside>
          {account ? (
            <Mailbox
              key={account.accountId}
              account={account}
              readOnly={readOnly}
              backAccounts={backAccounts}
              onBack={returnToAccounts}
              {...(accountSetupAvailable && {
                onAccountAction: (kind: "repair" | "rename", trigger: HTMLButtonElement) => {
                  accountActionTrigger.current = trigger;
                  setDialog({ kind, account });
                },
              })}
            />
          ) : (
            <article className="hu-mail-detail hu-mail-account-overview">
              <h2>{rows.length ? "全部账号" : "添加第一个邮箱"}</h2>
              <p>
                {rows.length
                  ? "选择邮箱查看已配置的目录。"
                  : !desktop
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
                  {row.subject || "未填写主题"} · {deliveryLabels[row.state]}
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
      {composer && (
        <MailComposer
          draft={composer.draft}
          accounts={rows}
          initialAccountId={account?.definition.settings.smtpEnabled ? account.accountId : null}
          readOnly={readOnly}
          previousDelivery={!!composer.draft && !!deliveries.data?.operations.some((record) => record.draftId === composer.draft?.draftId)}
          {...(registerLeaveGuard && { registerLeaveGuard })}
          onChanged={changed}
          onClose={closeComposer}
          onSent={(id) => {
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
  readOnly,
  backAccounts,
  onBack,
  onAccountAction,
}: {
  account: MailAccount;
  readOnly: boolean;
  backAccounts: Ref<HTMLButtonElement>;
  onBack(): void;
  onAccountAction?(kind: "repair" | "rename", trigger: HTMLButtonElement): void;
}) {
  const engine = useEngine();
  const [selected, setSelected] = useState("INBOX");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const messageTrigger = useRef<HTMLButtonElement | null>(null);
  const backMessages = useRef<HTMLButtonElement>(null);
  const folder = account.definition.folders.some(({ path }) => path === selected) ? selected : "INBOX";
  const input = { accountId: account.accountId, folder };
  const latest = useCapability<{ message: MessageSummary | null }>("mail.messages.latest", input);
  const { message } = latest.data ?? {};
  const reading = !!message && opened === message.localMessageId;

  useEffect(() => {
    setError("");
    setRefreshing(false);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [engine, account.revision]);

  async function refresh() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    setError("");
    try {
      const result = await engine.call<{ mailboxChanged: boolean }>("mail.sync.refresh", input, { write: true, signal: controller.signal });
      if (controller.signal.aborted) return;
      await latest.refetch();
      if (!controller.signal.aborted && result.mailboxChanged) setOpened(null);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof CapabilityError ? err.message : "无法刷新此目录。");
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }

  return (
    <article className="hu-mail-detail hu-mail-account-detail" data-reading={reading}>
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
              setOpened(null);
              requestAnimationFrame(() => messageTrigger.current?.focus());
            }}
          >
            返回邮件列表
          </button>
        </div>
      )}
      <div className="hu-mail-detail hu-mail-mailbox-toolbar">
        <h2>{accountTitle(account)}</h2>
        <p>
          {account.definition.settings.email}
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
        </div>
        {account.authState["account-password"] !== "configured" && <p>本机邮箱凭据当前不可用，已有缓存仍可查看。</p>}
        {onAccountAction && (
          <div className="hu-mail-row">
            <Button onClick={(event) => onAccountAction("repair", event.currentTarget)}>修复认证</Button>
            <Button variant="ghost" onClick={(event) => onAccountAction("rename", event.currentTarget)}>
              更改名称
            </Button>
          </div>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
        {latest.isError && (
          <Banner tone="danger" action={<Button onClick={() => void latest.refetch()}>重试读取</Button>}>
            无法读取本机邮件缓存。
          </Banner>
        )}
      </div>
      {latest.data &&
        (message ? (
          <div className="hu-mail-detail">
            <div className="hu-mail-row hu-mail-mailbox-nav">
              <Button
                aria-expanded={reading}
                onClick={(event) => {
                  messageTrigger.current = event.currentTarget;
                  setOpened(reading ? null : message.localMessageId);
                  if (!reading)
                    requestAnimationFrame(() => {
                      if (backMessages.current?.getClientRects().length) backMessages.current.focus();
                    });
                }}
              >
                {message.subject || "无主题"}
              </Button>
              {message.readState === "unread" && <span>未读</span>}
            </div>
            {opened === message.localMessageId && <MailReader key={message.localMessageId} message={message} readOnly={readOnly} onRead={latest.refetch} onRefresh={refresh} />}
          </div>
        ) : (
          <p>此目录暂无已缓存的邮件。</p>
        ))}
    </article>
  );
}
