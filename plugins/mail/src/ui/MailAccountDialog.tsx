import { Button, Dialog, Field } from "@huhu/ui";
import { CapabilityError, host, useEngine } from "@huhu/workbench";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import type { MailAccountSettings, MailFolder } from "../engine/account-definition.js";
import { mailPreset, mailProviderSchema, type MailEndpoint, type MailProvider } from "../shared/presets.js";
import type { MailAccount } from "./mail-types.js";
import { MailOAuthControls } from "./MailOAuthControls.js";

type Connection = { setupId: string; folders: (MailFolder & { selectable: boolean; selected: boolean })[] };
type EndpointFields = Omit<MailEndpoint, "port"> & { port: string };
type AccountForm = Omit<MailAccountSettings, "imap" | "smtp"> & { imap: EndpointFields; smtp: EndpointFields };

function defaults(provider: MailProvider, email = "", label = ""): AccountForm {
  const preset = mailPreset(provider, email);
  return fromSettings({ ...preset, email, label, auth: preset.credentials[0]!.method });
}

function fromSettings(settings: MailAccountSettings): AccountForm {
  const { provider, email, label, auth, imap, smtpEnabled, smtp } = settings;
  return { provider, email, label, auth, imap: { ...imap, port: String(imap.port) }, smtpEnabled, smtp: { ...smtp, port: String(smtp.port) } };
}

export function MailField({ label, control }: { label: string; control(id: string): ReactElement }) {
  const id = useId();
  return (
    <Field label="">
      <label htmlFor={id}>{label}</label>
      {control(id)}
    </Field>
  );
}

function ServerFields({ label, endpoint, onChange, disabled }: { label: string; endpoint: EndpointFields; onChange(value: EndpointFields): void; disabled?: boolean }) {
  return (
    <fieldset className="hu-mail-group" disabled={disabled}>
      <legend>{label}</legend>
      <div className="hu-mail-server">
        <MailField
          label={`${label} 主机`}
          control={(id) => <input id={id} name={`${label}-host`} value={endpoint.host} required={!disabled} spellCheck={false} autoCapitalize="none" onChange={(e) => onChange({ ...endpoint, host: e.target.value })} />}
        />
        <MailField
          label={`${label} 端口`}
          control={(id) => <input id={id} name={`${label}-port`} type="number" min={1} max={65535} value={endpoint.port} required={!disabled} onChange={(e) => onChange({ ...endpoint, port: e.target.value })} />}
        />
        <MailField
          label={`${label} 安全模式`}
          control={(id) => (
            <select id={id} name={`${label}-security`} value={endpoint.security} onChange={(e) => onChange({ ...endpoint, security: e.target.value as MailEndpoint["security"] })}>
              <option value="tls">TLS</option>
              <option value="starttls">STARTTLS</option>
              <option value="none">无加密</option>
            </select>
          )}
        />
      </div>
    </fieldset>
  );
}

export function MailAccountDialog({ repair, onClose, onSaved }: { repair?: MailAccount; onClose(): void; onSaved(accountId: string): void }) {
  const engine = useEngine();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const serverDetails = useRef<HTMLDetailsElement>(null);
  const testing = useRef<AbortController | null>(null);
  const session = useRef<string | null>(null);
  const saving = useRef<AbortController | null>(null);
  const [form, setForm] = useState(() => (repair ? fromSettings(repair.definition.settings) : defaults("custom_imap")));
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guideFeedback, setGuideFeedback] = useState("");

  function cancelActivity() {
    const controller = testing.current;
    testing.current = null;
    controller?.abort();
    saving.current?.abort();
    saving.current = null;
    const setupId = session.current;
    session.current = null;
    if (setupId) void engine.call("mail.accounts.cancelSetup", { setupId }, { write: true }).catch(() => undefined);
  }
  useEffect(() => cancelActivity, [engine]);

  function invalidate() {
    testing.current?.abort();
    testing.current = null;
    setConnection(null);
    setBusy(null);
    setError(null);
    const setupId = session.current;
    session.current = null;
    if (setupId) void engine.call("mail.accounts.cancelSetup", { setupId }, { write: true }).catch(() => undefined);
  }

  function change(update: AccountForm) {
    invalidate();
    setForm(update);
  }

  function changeEmail(email: string) {
    const before = mailPreset(form.provider, form.email);
    const next = mailPreset(form.provider, email);
    const imap = form.imap.host === before.imap.host ? { ...form.imap, host: next.imap.host } : form.imap;
    const smtp = form.smtp.host === before.smtp.host ? { ...form.smtp, host: next.smtp.host } : form.smtp;
    change({ ...form, email, imap, smtp });
  }

  async function testConnection() {
    if (form.auth === "oauth2" || !formRef.current || saving.current) return;
    if (serverDetails.current?.querySelector(":invalid")) serverDetails.current.open = true;
    if (!formRef.current.reportValidity()) return;
    const password = String(new FormData(formRef.current).get("password") ?? "");
    const settings = { ...form, imap: { ...form.imap, port: Number(form.imap.port) }, smtp: { ...form.smtp, port: Number(form.smtp.port) || 465 } };
    invalidate();
    const controller = new AbortController();
    testing.current = controller;
    setBusy("test");
    try {
      const input = repair ? { accountId: repair.accountId, expectedRevision: repair.revision, password } : { settings, password };
      const result = await engine.call<Connection>("mail.accounts.testConnection", input, { write: true, signal: controller.signal });
      if (testing.current !== controller) {
        void engine.call("mail.accounts.cancelSetup", { setupId: result.setupId }, { write: true }).catch(() => undefined);
        return;
      }
      session.current = result.setupId;
      setConnection(result);
    } catch (err) {
      if (testing.current === controller)
        setError(err instanceof CapabilityError && err.code !== "INVALID_INPUT" ? err.message : err instanceof CapabilityError && err.details?.reason ? err.message : "连接测试失败，请检查邮箱地址、凭据及服务器设置。");
    } finally {
      if (testing.current === controller) {
        testing.current = null;
        setBusy(null);
      }
    }
  }

  async function save() {
    if (saving.current) return;
    if (!connection) return testConnection();
    const { setupId, folders } = connection;
    const selected = folders.filter(({ selected }) => selected).map(({ path }) => path);
    if (!selected.includes("INBOX")) {
      setError("请至少选择 INBOX。");
      return;
    }
    const controller = new AbortController();
    saving.current = controller;
    setBusy("save");
    setError(null);
    try {
      const input = repair ? { setupId } : { setupId, folders: selected };
      const { accountId } = await engine.call<{ accountId: string }>("mail.accounts.save", input, { write: true, signal: controller.signal });
      if (saving.current === controller) onSaved(accountId);
    } catch (err) {
      if (saving.current !== controller) return;
      if (err instanceof CapabilityError && (err.details?.reason === "discovery-required" || err.code === "VERSION_CONFLICT")) invalidate();
      setError(err instanceof CapabilityError ? err.message : "暂时无法确认保存结果，请重试或查看邮箱列表。");
    } finally {
      if (saving.current === controller) {
        saving.current = null;
        setBusy(null);
      }
    }
  }

  const preset = mailPreset(form.provider, form.email);
  const desktopHost = host();
  const credential = preset.credentials.find(({ method }) => method === form.auth)?.label ?? "邮箱密码";
  const close = () => {
    if (!repair && saving.current) return;
    cancelActivity();
    onClose();
  };

  return (
    <Dialog
      open
      title={repair ? "修复邮箱认证" : "添加邮箱"}
      {...(repair && { description: `只更新 ${repair.definition.settings.email} 的邮箱凭据。` })}
      onClose={close}
      wide
      error={error}
      actions={
        <>
          <Button disabled={!repair && busy === "save"} onClick={close}>
            取消
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={!connection} loading={busy === "save"}>
            {repair ? "保存新认证" : "保存邮箱"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        ref={formRef}
        className="hu-mail-form"
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onInvalidCapture={(e) => {
          const details = (e.target as HTMLElement).closest("details");
          if (details) details.open = true;
        }}
      >
        <fieldset className="hu-mail-fields" disabled={busy === "save"}>
          {repair ? (
            <p>
              IMAP {form.imap.host}:{form.imap.port}
            </p>
          ) : (
            <>
              <MailField
                label="邮箱提供商"
                control={(id) => (
                  <select
                    id={id}
                    name="provider"
                    value={form.provider}
                    onChange={(e) => {
                      change(defaults(e.target.value as MailProvider, form.email, form.label));
                      if (serverDetails.current) serverDetails.current.open = e.target.value === "custom_imap";
                    }}
                  >
                    {mailProviderSchema.options.map((provider) => (
                      <option key={provider} value={provider}>
                        {mailPreset(provider).label}
                      </option>
                    ))}
                  </select>
                )}
              />
              <MailField label="显示名称" control={(id) => <input id={id} name="label" value={form.label} maxLength={80} onChange={(e) => change({ ...form, label: e.target.value })} />} />
              <MailField
                label="邮箱地址（必填）"
                control={(id) => <input id={id} name="email" type="email" autoComplete="username" spellCheck={false} autoCapitalize="none" required value={form.email} onChange={(e) => changeEmail(e.target.value)} />}
              />
              <MailField
                label="认证方式"
                control={(id) => (
                  <select id={id} name="auth" value={form.auth} onChange={(e) => change({ ...form, auth: e.target.value as AccountForm["auth"] })}>
                    {preset.credentials.map((option) => (
                      <option key={option.method} value={option.method}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
              />
            </>
          )}
          {form.auth !== "oauth2" && (
            <MailField
              label={`${repair ? "新" : ""}${credential}（必填）`}
              control={(id) => <input key={`${form.provider}:${form.auth}`} id={id} name="password" required type="password" autoComplete="current-password" maxLength={4096} onChange={invalidate} />}
            />
          )}
          {!repair && form.auth !== "oauth2" && (
            <details ref={serverDetails} open>
              <summary>收发服务器</summary>
              <ServerFields label="IMAP" endpoint={form.imap} onChange={(imap) => change({ ...form, imap })} />
              <label className="hu-mail-check">
                <input type="checkbox" name="smtpEnabled" checked={form.smtpEnabled} onChange={(e) => change({ ...form, smtpEnabled: e.target.checked })} />
                启用 SMTP 发送
              </label>
              <ServerFields label="SMTP" endpoint={form.smtp} disabled={!form.smtpEnabled} onChange={(smtp) => change({ ...form, smtp })} />
            </details>
          )}
          <div className="hu-mail-help">
            {!repair && preset.hint}{" "}
            {desktopHost ? (
              <Button
                variant="ghost"
                onClick={() =>
                  void desktopHost.copyText(preset.guideUrl).then(
                    () => setGuideFeedback("配置指南链接已复制。"),
                    () => setGuideFeedback(preset.guideUrl),
                  )
                }
              >
                复制配置指南链接
              </Button>
            ) : (
              <a href={preset.guideUrl} target="_blank" rel="noopener noreferrer">
                邮箱配置指南
              </a>
            )}
            <div role="status">{guideFeedback}</div>
          </div>
          {form.auth === "oauth2" && (form.provider === "gmail" || form.provider === "outlook") ? (
            <>
              <label className="hu-mail-check">
                <input type="checkbox" checked={form.smtpEnabled} onChange={(event) => change({ ...form, smtpEnabled: event.currentTarget.checked })} />
                授权包含发送权限时启用发送
              </label>
              <MailOAuthControls
                key={JSON.stringify([form.provider, form.email, form.label, form.smtpEnabled, repair?.revision])}
                input={{ provider: form.provider, email: form.email, label: form.label, smtp: form.smtpEnabled, ...(repair && { repair: { accountId: repair.accountId, expectedRevision: repair.revision } }) }}
                valid={() => formRef.current?.reportValidity() ?? false}
                onSaved={onSaved}
              />
            </>
          ) : (
            <div>
              <Button type={connection ? "button" : "submit"} onClick={connection ? () => void testConnection() : undefined} loading={busy === "test"}>
                {repair ? (connection ? "重新测试新认证" : "测试新认证") : connection ? "重新测试连接" : "测试连接并发现文件夹"}
              </Button>
            </div>
          )}
          <div role="status">{connection ? (repair ? "新凭据已通过 IMAP 测试，保存后在当前账号生效。" : "IMAP 连接成功。选择要同步的文件夹。") : ""}</div>
          {connection && !repair && (
            <fieldset className="hu-mail-group">
              <legend>已发现的文件夹</legend>
              {connection.folders.map((folder) => (
                <label className="hu-mail-check" key={folder.path}>
                  <input
                    type="checkbox"
                    name="folders"
                    disabled={!folder.selectable}
                    checked={folder.selected}
                    onChange={(e) => {
                      const selected = e.target.checked;
                      setError(null);
                      setConnection({ ...connection, folders: connection.folders.map((item) => (item.path === folder.path ? { ...item, selected } : item)) });
                    }}
                  />
                  {folder.path}
                  {!folder.selectable && "（不可选择）"}
                </label>
              ))}
            </fieldset>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}
