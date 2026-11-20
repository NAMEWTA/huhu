import { Banner, Button, Dialog } from "@huhu/ui";
import { CapabilityError, createRequestId, host, registerExitParticipant, useEngine, type ModuleProps } from "@huhu/workbench";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import type { DesktopDraftAttachmentHost, DraftAttachmentError, DraftAttachmentState } from "../desktop-attachments.js";
import type { DraftContent } from "../engine/draft-content.js";
import { missingForwardAttachments } from "../engine/forward-context.js";
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
const attachmentError: Record<DraftAttachmentError, string> = {
  "too-large": "单个附件不能超过 25 MiB。",
  "draft-limit": "附件总大小或数量已达上限。",
  "source-missing": "所选文件已不存在，请重新选择。",
  interrupted: "附件导入中断，请重新选择。",
  conflict: "草稿已在别处更新，请重新打开后再处理附件。",
  unavailable: "当前桌面或 Vault 无法导入附件。",
  failed: "无法导入附件，请重试。",
};
const attachmentStatus = { ready: "已保存", missing: "字节缺失", corrupt: "字节已损坏", unreadable: "无法读取" };

function draftError(err: unknown) {
  if (err instanceof CapabilityError && err.code === "VERSION_CONFLICT") return "草稿已在别处更新。当前编辑仍保留，可先保存正文副本。";
  if (err instanceof CapabilityError && err.message === "输入不符合要求") return "请核对收件人及正文大小后重试。";
  if (err instanceof Error && (err instanceof CapabilityError || err.message.startsWith("请检查"))) return err.message;
  return "暂时无法确认操作结果，请重试或查看记录。";
}

function newDraftId() {
  const id = createRequestId();
  if (id.includes("-")) return id;
  const variant = ((Number.parseInt(id[16]!, 16) & 3) | 8).toString(16);
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-${variant}${id.slice(17, 20)}-${id.slice(20)}`;
}

function sameContent(saved: Draft, outgoing: DraftContent) {
  const { accountId, to, cc, bcc, subject, body, reply, forward } = saved;
  return JSON.stringify({ accountId, to, cc, bcc, subject, body, reply, forward }) === JSON.stringify(outgoing);
}

export function MailComposer({
  draft,
  seed,
  inline = false,
  accounts,
  initialAccountId,
  readOnly,
  previousDelivery,
  registerLeaveGuard,
  onChanged,
  onSenderChange,
  onClose,
  onSent,
}: {
  draft: Draft | null;
  seed?: DraftContent;
  inline?: boolean;
  accounts: MailAccount[];
  initialAccountId: string | null;
  readOnly: boolean;
  previousDelivery: boolean;
  registerLeaveGuard?: ModuleProps["registerLeaveGuard"];
  onChanged(message: string): void;
  onSenderChange(accountId: string | null): void;
  onClose(): void;
  onSent(operationId: string): void;
}) {
  const engine = useEngine();
  const titleId = useId();
  const recipientsId = useId();
  const attachmentsId = useId();
  const senderControl = useRef<HTMLSelectElement>(null);
  const recipientControl = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const attachmentsGroup = useRef<HTMLElement>(null);
  const restoreAttachmentFocus = useRef(false);
  const selection = useRef<AbortController | null>(null);
  const initial = draft ?? seed;
  const reply = initial?.reply;
  const [forward, setForward] = useState(initial?.forward);
  const forwarding = !!forward;
  const newTopic = !!seed && !reply && !forwarding;
  const explicitSend = !!reply || forwarding || newTopic;
  const [draftId] = useState(() => draft?.draftId ?? newDraftId());
  const [revision, setRevision] = useState(draft?.revision ?? null);
  const revisionRef = useRef(revision);
  const [attachments, setAttachments] = useState(draft?.attachments ?? []);
  const [accountId, setAccountId] = useState((initial ? initial.accountId : initialAccountId) ?? "");
  const [addresses, setAddresses] = useState({ to: initial?.to.join(", ") ?? "", cc: initial?.cc.join(", ") ?? "", bcc: initial?.bcc.join(", ") ?? "" });
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [dirty, setDirty] = useState(!!seed);
  const dirtyRef = useRef(!!seed);
  const originalBody = useRef(initial?.body ?? emptyBody);
  const body = useRef(originalBody.current);
  const [editorError, setEditorError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const [busy, setBusy] = useState<"save" | "send" | "discard" | "prepare-attachment" | "attach" | "remove" | null>(null);
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
    if (readOnly) title.current?.focus();
    else if (forwarding || newTopic) recipientControl.current?.focus();
    else if (!reply) senderControl.current?.focus();
  }, [readOnly, reply, forwarding, newTopic]);
  useEffect(() => {
    if (reply && !readOnly) editor?.commands.focus("start");
  }, [editor, readOnly, reply]);
  useLayoutEffect(() => () => selection.current?.abort(), []);
  useLayoutEffect(() => {
    if (busy !== null || !restoreAttachmentFocus.current) return;
    restoreAttachmentFocus.current = false;
    if (document.activeElement !== document.body) return;
    const group = attachmentsGroup.current;
    (group?.querySelector<HTMLButtonElement>("button:not([disabled])") ?? group ?? recipientControl.current)?.focus();
  }, [busy, forward]);

  const desktop = !!engine.endpoint.token;
  const picker = desktop ? (host() as { mailDraftAttachments?: DesktopDraftAttachmentHost } | undefined)?.mailDraftAttachments : undefined;
  function acceptDraftState(saved: DraftAttachmentState) {
    revisionRef.current = saved.revision;
    setRevision(saved.revision);
    setAttachments(saved.attachments ?? []);
  }

  async function persist(signal?: AbortSignal) {
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
    const outgoing = { accountId: accountId || null, to: destination("to"), cc: destination("cc"), bcc: destination("bcc"), subject, body: body.current, reply, forward };
    let saved: Draft;
    try {
      saved = await engine.call<Draft>("mail.drafts.save", { draftId, expectedRevision: revisionRef.current, draft: outgoing }, { write: true, ...(signal && { signal }) });
    } catch (error) {
      signal?.throwIfAborted();
      const current = await engine.call<{ draft: Draft | null }>("mail.drafts.get", { draftId }, signal ? { signal } : undefined).catch(() => null);
      if (!current?.draft || !sameContent(current.draft, outgoing)) throw error;
      saved = current.draft;
    }
    signal?.throwIfAborted();
    acceptDraftState(saved);
    dirtyRef.current = false;
    setDirty(false);
    return saved.revision;
  }

  async function addAttachment() {
    if (!picker || readOnly || busyRef.current) return;
    const operationId = createRequestId();
    const controller = new AbortController();
    const { signal } = controller;
    const cancel = () => void picker.cancel(operationId).catch(() => undefined);
    selection.current = controller;
    busyRef.current = true;
    setBusy("prepare-attachment");
    setError(null);
    setAttachmentNotice("");
    try {
      const expectedRevision = await persist(signal);
      signal.throwIfAborted();
      onChanged("");
      setBusy("attach");
      signal.addEventListener("abort", cancel, { once: true });
      const result = await picker.selectAndAdd({ operationId, vaultId: engine.vaultId, draftId, expectedRevision });
      if (signal.aborted || result.status === "cancelled") return;
      if (result.status === "failed") setError(attachmentError[result.reason]);
      else if (result.draft.draftId !== draftId) setError(attachmentError.failed);
      else {
        acceptDraftState(result.draft);
        setAttachmentNotice(result.deduped ? "此附件已存在。" : "附件已保存。");
        onChanged("");
      }
    } catch (err) {
      if (!signal.aborted) setError(draftError(err));
    } finally {
      signal.removeEventListener("abort", cancel);
      selection.current = null;
      if (!signal.aborted) {
        busyRef.current = false;
        restoreAttachmentFocus.current = true;
        setBusy(null);
      }
    }
  }

  async function removeAttachment(digest: string) {
    if (!desktop || readOnly || busyRef.current || !revisionRef.current) return;
    busyRef.current = true;
    setBusy("remove");
    setError(null);
    setAttachmentNotice("");
    try {
      const saved = await engine.call<Draft>("mail.drafts.removeAttachment", { draftId, digest, expectedRevision: revisionRef.current }, { write: true });
      acceptDraftState(saved);
      setAttachmentNotice("附件已移除。");
      onChanged("");
    } catch (err) {
      setError(draftError(err));
    } finally {
      busyRef.current = false;
      restoreAttachmentFocus.current = true;
      setBusy(null);
    }
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
      setError(draftError(err));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  useEffect(() => {
    const check = async () => {
      if (busy === "attach") {
        close();
        return true;
      }
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
    if (busy === "attach") {
      selection.current?.abort();
      onClose();
      return;
    }
    if (busyRef.current) return;
    if (dirtyRef.current && !readOnly) void run("save", true);
    else onClose();
  }

  const sender = accounts.find((account) => account.accountId === accountId);
  const canSend = sender?.definition.settings.smtpEnabled && sender.authState["account-password"] === "configured";
  const attachmentIssue = attachments.some(({ state }) => state !== "ready");
  const missingSource = missingForwardAttachments(
    forward,
    attachments.filter(({ state }) => state === "ready"),
  );
  const originalAttachments = (forward?.sourceAttachments ?? []).flatMap((item, index) => {
    if (forward?.omitted.includes(index)) return [];
    if (item.available ? revision !== null : !missingSource.includes(item)) return [];
    return [{ ...item, index }];
  });
  const senderOptions = accounts.filter((account) => (reply ? account.accountId === accountId : account.definition.settings.smtpEnabled));
  const senderInList = senderOptions.some((account) => account.accountId === accountId);
  const blocked = !canSend || previousDelivery || attachmentIssue || missingSource.length > 0 || !subject.trim() || ![addresses.to, addresses.cc, addresses.bcc].some((value) => value.trim());

  function omitSourceAttachment(index: number) {
    if (!forward || readOnly || busyRef.current) return;
    restoreAttachmentFocus.current = true;
    setForward({ ...forward, omitted: [...forward.omitted, index] });
    setEdited();
  }

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
      data-inline={inline}
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
          if (!explicitSend && !blocked) void run("send");
        }}
      >
        <header className="hu-mail-row hu-mail-spread">
          <h2 id={titleId} ref={title} tabIndex={-1}>
            {reply ? (reply.mode === "reply-all" ? "回复全部" : "回复邮件") : forward ? "转发邮件" : newTopic ? "新话题" : "写信"}
          </h2>
          <div className="hu-mail-row">
            {!inline && (
              <Button variant="ghost" aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>
                {expanded ? "还原" : "扩大"}
              </Button>
            )}
            <Button variant="ghost" disabled={busy !== null && busy !== "attach"} onClick={close}>
              关闭写信
            </Button>
          </div>
        </header>
        {reply && <p className="hu-mail-help">回复原邮件「{reply.subject || "无主题"}」，发件人沿用来源邮箱。</p>}
        {forward && <p className="hu-mail-help">转发原邮件「{forward.subject || "无主题"}」</p>}
        {readOnly && <Banner>当前 Vault 为只读，草稿可查看。</Banner>}
        {previousDelivery && <Banner>这份草稿已有投递记录。请在发件箱核对或重试明确未投递的收件人。</Banner>}
        {sender && !canSend && <Banner>{sender.definition.settings.smtpEnabled ? "发件邮箱需要重新配置凭据。" : reply ? "原邮箱只接收邮件，回复可以保存为草稿。" : "该账号只接收邮件。请选择可发送的发件人。"}</Banner>}
        {reply && !sender && <Banner>此回复的来源邮箱当前不可用。</Banner>}
        {error && <Banner tone="danger">{error}</Banner>}
        <fieldset className="hu-mail-fields" disabled={readOnly || busy !== null}>
          <MailField
            label="发件人"
            control={(id) => (
              <select
                id={id}
                ref={senderControl}
                name="accountId"
                disabled={!!reply}
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  onSenderChange(e.target.value || null);
                  setEdited();
                }}
              >
                {!reply && <option value="">稍后选择发件人</option>}
                {accountId && !senderInList && (
                  <option value={accountId} disabled>
                    {sender?.definition.settings.email ?? "原邮箱不可用"}
                  </option>
                )}
                {senderOptions.map(({ accountId, definition: { settings } }) => (
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
                    ref={key === "to" ? recipientControl : undefined}
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
          {(attachments.length > 0 || originalAttachments.length > 0 || (desktop && !readOnly)) && (
            <section className="hu-mail-attachments" aria-labelledby={attachmentsId} tabIndex={-1} ref={attachmentsGroup}>
              <div className="hu-mail-row">
                <h3 id={attachmentsId}>附件</h3>
                {picker && !readOnly && (
                  <Button type="button" loading={busy === "prepare-attachment" || busy === "attach"} onClick={() => void addAttachment()}>
                    添加附件
                  </Button>
                )}
                <span className="hu-mail-help" role="status">
                  {attachmentNotice}
                </span>
              </div>
              {desktop && !readOnly && !picker && <p className="hu-mail-help">当前桌面宿主暂不支持选择附件。</p>}
              {attachments.length > 0 && (
                <ul aria-label="已有附件" role="list">
                  {attachments.map(({ digest, name, size, state }) => (
                    <li className="hu-mail-row" key={digest}>
                      <span>
                        {name} · {size.toLocaleString()} 字节 · {attachmentStatus[state]}
                      </span>
                      {desktop && !readOnly && (
                        <Button type="button" variant="ghost" aria-label={`移除附件 ${name}`} onClick={() => void removeAttachment(digest)}>
                          移除
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {originalAttachments.length > 0 && (
                <ul aria-label="原邮件附件" role="list">
                  {originalAttachments.map(({ name, available, index }) => (
                    <li className="hu-mail-row" key={index}>
                      <span>
                        {name} · {available ? "保存后携带" : "仅有名称 · 未携带字节"}
                      </span>
                      {!readOnly && (
                        <Button type="button" variant="ghost" aria-label={`不转发 ${name}`} onClick={() => omitSourceAttachment(index)}>
                          不转发
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </fieldset>
        {attachmentIssue && <Banner>请先处理无法读取的附件。</Banner>}
        {missingSource.length > 0 && <Banner>请补选同名文件，或选择不转发缺少字节的附件。</Banner>}
        <footer className="hu-mail-row">
          <Button disabled={readOnly || busy !== null || (!dirty && revision !== null)} loading={busy === "save"} onClick={() => void run("save")}>
            保存草稿
          </Button>
          <Button variant="danger" disabled={readOnly || busy !== null} onClick={() => setDiscard(true)}>
            丢弃
          </Button>
          <Button type={explicitSend ? "button" : "submit"} onClick={explicitSend ? () => void run("send") : undefined} variant="primary" disabled={readOnly || busy !== null || !!blocked} loading={busy === "send"}>
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
