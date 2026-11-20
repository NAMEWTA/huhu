import { Banner, Button, Dialog } from "@huhu/ui";
import { CapabilityError, createRequestId, registerExitParticipant, useEngine, type ModuleProps } from "@huhu/workbench";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import type { DraftContent } from "../engine/draft-content.js";
import { MailField } from "./MailAccountDialog.js";
import type { Draft, MailAccount } from "./mail-types.js";

const emailAddress = z.email();
const emptyBody: Draft["body"] = { type: "doc", content: [{ type: "paragraph" }] };
const extensions = [StarterKit.configure({ link: { openOnClick: false, autolink: false } })];
const addressFields = [
  { key: "to", label: "收件人" },
  { key: "cc", label: "抄送" },
  { key: "bcc", label: "密送" },
] as const;

function newDraftId() {
  const id = createRequestId();
  if (id.includes("-")) return id;
  const variant = ((Number.parseInt(id[16]!, 16) & 3) | 8).toString(16);
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-${variant}${id.slice(17, 20)}-${id.slice(20)}`;
}

function sameContent(saved: Draft, outgoing: DraftContent) {
  const { accountId, to, cc, bcc, subject, body } = saved;
  return JSON.stringify({ accountId, to, cc, bcc, subject, body }) === JSON.stringify(outgoing);
}

export function MailComposer({
  draft,
  accounts,
  initialAccountId,
  readOnly,
  previousDelivery,
  registerLeaveGuard,
  onChanged,
  onClose,
  onSent,
}: {
  draft: Draft | null;
  accounts: MailAccount[];
  initialAccountId: string | null;
  readOnly: boolean;
  previousDelivery: boolean;
  registerLeaveGuard?: ModuleProps["registerLeaveGuard"];
  onChanged(message: string): void;
  onClose(): void;
  onSent(operationId: string): void;
}) {
  const engine = useEngine();
  const titleId = useId();
  const recipientsId = useId();
  const senderControl = useRef<HTMLSelectElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [draftId] = useState(() => draft?.draftId ?? newDraftId());
  const [revision, setRevision] = useState(draft?.revision ?? null);
  const revisionRef = useRef(revision);
  const [accountId, setAccountId] = useState((draft ? draft.accountId : initialAccountId) ?? "");
  const [addresses, setAddresses] = useState({ to: draft?.to.join(", ") ?? "", cc: draft?.cc.join(", ") ?? "", bcc: draft?.bcc.join(", ") ?? "" });
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const originalBody = useRef(draft?.body ?? emptyBody);
  const body = useRef(originalBody.current);
  const [editorError, setEditorError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "send" | "discard" | null>(null);
  const busyRef = useRef(false);
  const [discard, setDiscard] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const setEdited = () => {
    dirtyRef.current = true;
    setDirty(true);
    setError(null);
  };
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: originalBody.current as JSONContent,
    editable: !readOnly,
    enableContentCheck: true,
    onContentError: ({ editor: currentEditor }) => {
      currentEditor.setEditable(false, false);
      setEditorError(true);
    },
    onUpdate: ({ editor: currentEditor }) => {
      body.current = currentEditor.getJSON() as Draft["body"];
      setEdited();
    },
    editorProps: { attributes: { role: "textbox", "aria-multiline": "true", "aria-label": "正文" } },
  });
  useEffect(() => {
    editor?.setEditable(!readOnly && !busy && !editorError, false);
  }, [editor, readOnly, busy, editorError]);
  useLayoutEffect(() => {
    (readOnly ? title.current : senderControl.current)?.focus();
  }, [readOnly]);

  async function persist() {
    if (!dirtyRef.current && revisionRef.current) return revisionRef.current;
    const seen = new Set<string>();
    const destination = (key: keyof typeof addresses) =>
      addresses[key]
        .split(/[,，;；\s]+/)
        .filter(Boolean)
        .map((address) => address.toLowerCase())
        .filter((address) => {
          if (seen.has(address)) return false;
          if (!emailAddress.safeParse(address).success) {
            throw new Error(`请检查${addressFields.find((field) => field.key === key)?.label ?? ""}的邮箱地址。`);
          }
          seen.add(address);
          return true;
        });
    const outgoing = { accountId: accountId || null, to: destination("to"), cc: destination("cc"), bcc: destination("bcc"), subject, body: body.current };
    let saved: Draft;
    try {
      saved = await engine.call<Draft>("mail.drafts.save", { draftId, expectedRevision: revisionRef.current, draft: outgoing }, { write: true });
    } catch (error) {
      const current = await engine.call<{ draft: Draft | null }>("mail.drafts.get", { draftId }).catch(() => null);
      if (!current?.draft || !sameContent(current.draft, outgoing)) throw error;
      saved = current.draft;
    }
    revisionRef.current = saved.revision;
    setRevision(saved.revision);
    dirtyRef.current = false;
    setDirty(false);
    return saved.revision;
  }

  async function run(action: "save" | "send" | "discard", close = false) {
    if (busyRef.current || readOnly) return false;
    busyRef.current = true;
    setBusy(action);
    setError(null);
    try {
      if (action === "discard") {
        if (revisionRef.current) await engine.call("mail.drafts.discard", { draftId, expectedRevision: revisionRef.current }, { write: true });
        onChanged("草稿已丢弃");
        onClose();
        return true;
      }
      const expectedRevision = await persist();
      if (action === "send") {
        const { operationId } = await engine.call<{ operationId: string }>("mail.outbox.submit", { draftId, expectedRevision }, { write: true });
        onSent(operationId);
      } else {
        onChanged("草稿已保存");
        if (close) onClose();
      }
      return true;
    } catch (err) {
      if (action === "send") onChanged("");
      const message =
        err instanceof CapabilityError && err.code === "VERSION_CONFLICT"
          ? "草稿已在别处更新。当前编辑仍保留，可先保存正文副本。"
          : err instanceof CapabilityError && err.message === "输入不符合要求"
            ? "请核对收件人及正文大小后重试。"
            : err instanceof Error && (err instanceof CapabilityError || err.message.startsWith("请检查"))
              ? err.message
              : "暂时无法确认操作结果，请重试或查看记录。";
      setError(message);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  useEffect(() => {
    const check = async () => {
      if (busyRef.current) return false;
      if (!dirtyRef.current) return true;
      return run("save");
    };
    const exit = registerExitParticipant(check);
    const leave = registerLeaveGuard?.(check);
    return () => {
      leave?.();
      exit();
    };
  });

  function close() {
    if (busyRef.current) return;
    if (dirtyRef.current && !readOnly) void run("save", true);
    else onClose();
  }

  const sender = accounts.find((account) => account.accountId === accountId);
  const canSend = sender?.definition.settings.smtpEnabled && sender.authState["account-password"] === "configured";
  const attachmentIssue = draft?.attachments?.some(({ state }) => state !== "ready");
  const senderInList = accounts.some((account) => account.accountId === accountId && account.definition.settings.smtpEnabled);
  const blocked = !canSend || previousDelivery || attachmentIssue || !subject.trim() || ![addresses.to, addresses.cc, addresses.bcc].some((value) => value.trim());

  function applyLink() {
    try {
      const url = new URL(link?.trim() ?? "");
      if (!["https:", "http:", "mailto:"].includes(url.protocol)) throw new Error();
      editor?.chain().focus().setLink({ href: url.href }).run();
      setLink(null);
    } catch {
      setError("请输入有效的 HTTPS、HTTP 或 mailto 链接。");
    }
  }

  return (
    <section
      className="hu-mail-compose"
      data-expanded={expanded}
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented && !e.nativeEvent.isComposing && !discard) {
          e.preventDefault();
          close();
        }
      }}
    >
      <form
        className="hu-mail-form"
        aria-labelledby={titleId}
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked) void run("send");
        }}
      >
        <header className="hu-mail-row hu-mail-spread">
          <h2 id={titleId} ref={title} tabIndex={-1}>
            写信
          </h2>
          <div className="hu-mail-row">
            <Button variant="ghost" aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>
              {expanded ? "还原" : "扩大"}
            </Button>
            <Button variant="ghost" disabled={busy !== null} onClick={close}>
              关闭写信
            </Button>
          </div>
        </header>
        {readOnly && <Banner>当前 Vault 为只读，草稿可查看。</Banner>}
        {previousDelivery && <Banner>这份草稿已有投递记录。请在发件箱核对或重试明确未投递的收件人。</Banner>}
        {sender && !canSend && <Banner>{sender.definition.settings.smtpEnabled ? "发件邮箱需要重新配置凭据。" : "该账号只接收邮件。请选择可发送的发件人。"}</Banner>}
        {error && <Banner tone="danger">{error}</Banner>}
        <fieldset className="hu-mail-fields" disabled={readOnly || busy !== null}>
          <MailField
            label="发件人"
            control={(id) => (
              <select
                id={id}
                ref={senderControl}
                name="accountId"
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setEdited();
                }}
              >
                <option value="">稍后选择发件人</option>
                {accountId && !senderInList && (
                  <option value={accountId} disabled>
                    {sender?.definition.settings.email ?? "原邮箱不可用"}
                  </option>
                )}
                {accounts
                  .filter(({ definition }) => definition.settings.smtpEnabled)
                  .map(({ accountId, definition: { settings } }) => (
                    <option key={accountId} value={accountId}>
                      {settings.label ? `${settings.label} · ` : ""}
                      {settings.email}
                    </option>
                  ))}
              </select>
            )}
          />
          <p id={recipientsId} className="hu-mail-help">
            多个邮箱地址用逗号分隔。
          </p>
          <div className="hu-mail-addresses">
            {addressFields.map(({ key, label }) => (
              <MailField
                key={key}
                label={label}
                control={(id) => (
                  <input
                    id={id}
                    name={key}
                    inputMode="email"
                    aria-describedby={recipientsId}
                    autoCapitalize="none"
                    spellCheck={false}
                    value={addresses[key]}
                    onChange={(e) => {
                      setAddresses({ ...addresses, [key]: e.target.value });
                      setEdited();
                    }}
                  />
                )}
              />
            ))}
          </div>
          <MailField
            label="主题"
            control={(id) => (
              <input
                id={id}
                name="subject"
                value={subject}
                maxLength={8192}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setEdited();
                }}
              />
            )}
          />
          <div className="hu-mail-row" aria-label="正文格式" role="group">
            <Button disabled={editorError || !editor} onClick={() => editor?.chain().focus().toggleBold().run()}>
              粗体
            </Button>
            <Button disabled={editorError || !editor} onClick={() => setLink(link === null ? "" : null)} aria-expanded={link !== null}>
              添加链接
            </Button>
          </div>
          {link !== null && (
            <div className="hu-mail-row">
              <MailField label="链接地址" control={(id) => <input id={id} name="link" value={link} onChange={(e) => setLink(e.target.value)} />} />
              <Button onClick={applyLink}>插入链接</Button>
            </div>
          )}
          {editorError && <Banner>此草稿的正文格式无法在当前编辑器中修改，原正文仍保留。</Banner>}
          <EditorContent className="hu-mail-editor" editor={editor} />
          {!!draft?.attachments?.length && (
            <ul aria-label="已有附件">
              {draft.attachments.map(({ digest, name, state }) => (
                <li key={digest}>
                  {name}
                  {state !== "ready" ? " · 待重新绑定" : ""}
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        {attachmentIssue && <Banner>请先处理无法读取的附件。</Banner>}
        <footer className="hu-mail-row">
          <Button disabled={readOnly || busy !== null || (!dirty && revision !== null)} loading={busy === "save"} onClick={() => void run("save")}>
            保存草稿
          </Button>
          <Button variant="danger" disabled={readOnly || busy !== null} onClick={() => setDiscard(true)}>
            丢弃
          </Button>
          <Button type="submit" variant="primary" disabled={readOnly || busy !== null || !!blocked} loading={busy === "send"}>
            发送邮件
          </Button>
        </footer>
      </form>
      {discard && (
        <Dialog
          open
          title="丢弃草稿？"
          description="本机的草稿将被丢弃。"
          onClose={() => setDiscard(false)}
          actions={
            <>
              <Button onClick={() => setDiscard(false)}>取消</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setDiscard(false);
                  void run("discard");
                }}
              >
                丢弃草稿
              </Button>
            </>
          }
        >
          已提交的投递记录仍可在发件箱查看。
        </Dialog>
      )}
    </section>
  );
}
