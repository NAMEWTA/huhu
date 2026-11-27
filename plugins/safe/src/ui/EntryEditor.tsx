import { Button, Dialog } from "@huhu/ui";
import { CapabilityError, useEngine, type EngineClient } from "@huhu/workbench";
import { Lock, Plus } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { CreateEntry, SafeSession, Tag, TagFields, UpdateAccount, UpdateEntry, UpdateEntryReceipt } from "../engine/personal.js";
import type { PersonalEntry } from "./PersonalWorkspace.js";
import { emptyTag, FormField, TagBadge, TagFieldsInput } from "./SafeTags.js";

type Account = PersonalEntry["accounts"][number];
type PasswordMode = UpdateAccount["password"]["kind"];
type AccountDraft = Pick<Account, "account" | "phone" | "email" | "note"> & { password: string; passwordMode: PasswordMode; key: number };
type Fields = { name: string; url: string; accounts: AccountDraft[]; tagIds: string[]; newTags: TagFields[] };
type SaveFeedback = "failed" | "conflict" | "uncertain" | "verified" | "reload-failed";
export type EditTarget = { kind: "create"; revision: number } | { kind: "entry"; entry: PersonalEntry } | { kind: "add-account"; entry: PersonalEntry } | { kind: "account"; entry: PersonalEntry; account: Account };
export type SaveReceipt = z.output<typeof UpdateEntryReceipt> & { accountId?: string };

const blankAccount = (key: number): AccountDraft => ({ key, account: "", phone: "", email: "", note: "", password: "", passwordMode: "keep" });

function fieldsFor(target: EditTarget): Fields {
  if (target.kind === "create") return { name: "", url: "", accounts: [blankAccount(0)], tagIds: [], newTags: [] };
  const { name, url, tagIds } = target.entry;
  if (target.kind !== "account") return { name, url, tagIds, newTags: [], accounts: target.kind === "add-account" ? [blankAccount(0)] : [] };
  const { account, phone, email, note } = target.account;
  return { name, url, tagIds, newTags: [], accounts: [{ ...blankAccount(0), account, phone, email, note }] };
}

function accountFields({ account, phone, email, note }: AccountDraft) {
  return { account: account.trim(), phone, email: email.trim(), note };
}

async function write(engine: EngineClient, session: SafeSession, target: EditTarget, fields: Fields, signal: AbortSignal) {
  const options = { write: true, signal };
  if (target.kind === "create") {
    const input: CreateEntry = {
      session,
      expectedRevision: target.revision,
      name: fields.name.trim(),
      url: fields.url.trim(),
      tagIds: fields.tagIds,
      newTags: fields.newTags,
      accounts: fields.accounts.map((account) => ({ ...accountFields(account), password: account.password })),
    };
    return engine.call<SaveReceipt>("safe.entries.create", input, options);
  }
  const base = { session, entryId: target.entry.entryId, expectedRevision: target.entry.revision };
  if (target.kind === "entry") {
    const input: UpdateEntry = { ...base, name: fields.name.trim(), url: fields.url.trim(), tagIds: fields.tagIds, newTags: fields.newTags };
    return engine.call<SaveReceipt>("safe.entries.update", input, options);
  }
  const account = fields.accounts[0]!;
  if (target.kind === "add-account") {
    return engine.call<SaveReceipt>("safe.accounts.create", { ...base, ...accountFields(account), password: account.password }, options);
  }
  const password = account.passwordMode === "set" ? { kind: "set" as const, value: account.password } : { kind: account.passwordMode };
  const input: UpdateAccount = { ...base, accountId: target.account.accountId, ...accountFields(account), password };
  return engine.call<SaveReceipt>("safe.accounts.update", input, options);
}

const feedbackText: Record<SaveFeedback, string> = {
  failed: "保存失败，已保留本次编辑。请检查输入后重试。",
  conflict: "版本已变化，已保留本次编辑。可重读当前版本后核对。",
  uncertain: "未收到保存确认。可按原版本重试，或核对当前条目。",
  verified: "已刷新条目列表。请关闭表单，核对条目内容和账号密码。",
  "reload-failed": "暂时无法重读当前版本，已保留本次编辑。",
};

export function EntryEditor({
  target,
  tags,
  session,
  getSessionSignal,
  reload,
  onSaved,
  onClose,
  onLock,
  onError,
}: {
  target: EditTarget;
  tags: Tag[];
  session: SafeSession;
  getSessionSignal(): AbortSignal | undefined;
  reload(signal: AbortSignal): Promise<{ revision: number; entries: PersonalEntry[]; tags: Tag[] }>;
  onSaved(receipt: SaveReceipt): void;
  onClose(): void;
  onLock(): void;
  onError(error: unknown): boolean;
}) {
  const engine = useEngine();
  const [base, setBase] = useState(target);
  const [fields, setFields] = useState(() => fieldsFor(target));
  const [newTag, setNewTag] = useState<TagFields | null>(null);
  const inlineTag = useRef<HTMLDivElement>(null);
  const addTag = useRef<HTMLButtonElement>(null);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<"discard" | "reload" | null>(null);
  const [busy, setBusy] = useState<"save" | "reload" | null>(null);
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);
  const [conflict, setConflict] = useState(false);
  const [receiptLost, setReceiptLost] = useState(false);
  const active = useRef(false);
  const nextAccountKey = useRef(1);
  const formId = useId();
  const root = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const focusNew = useRef<number | null>(null);
  const title = { create: "新建条目", entry: "编辑条目", "add-account": "新增账号", account: "编辑账号" }[base.kind];
  const editsEntry = base.kind === "create" || base.kind === "entry";

  useLayoutEffect(() => {
    if (confirm) continueButton.current?.focus();
    else root.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [confirm]);

  useLayoutEffect(() => {
    if (focusNew.current === null) return;
    root.current?.querySelector<HTMLInputElement>(`[data-account-key="${focusNew.current}"] input`)?.focus();
    focusNew.current = null;
  }, [fields.accounts.length]);

  useLayoutEffect(() => {
    if (feedback) status.current?.focus();
  }, [feedback, confirm]);

  useLayoutEffect(() => {
    inlineTag.current?.querySelector("input")?.focus();
  }, [newTag === null]);

  function update(next: Fields) {
    setFields(next);
    setDirty(true);
    if (feedback === "failed") setFeedback(null);
  }

  function close() {
    root.current?.closest("dialog")?.close();
    onClose();
  }

  function requestClose() {
    if (active.current) return;
    if (confirm) setConfirm(null);
    else if (newTag) closeNewTag();
    else if (dirty) setConfirm("discard");
    else close();
  }

  function closeNewTag() {
    setNewTag(null);
    addTag.current?.focus();
  }

  function applyTag(tag: TagFields) {
    const name = tag.name.trim();
    if (!name) return;
    const existing = tags.find((item) => item.name === name);
    if (existing) update({ ...fields, tagIds: [...new Set([...fields.tagIds, existing.tagId])] });
    else if (!fields.newTags.some((item) => item.name === name)) update({ ...fields, newTags: [...fields.newTags, { ...tag, name }] });
    closeNewTag();
  }

  async function save() {
    const signal = getSessionSignal();
    if (active.current || conflict || newTag || !signal || signal.aborted) return;
    active.current = true;
    setBusy("save");
    setFeedback(null);
    try {
      const receipt = await write(engine, session, base, fields, signal);
      if (signal.aborted) return;
      root.current?.closest("dialog")?.close();
      onSaved(receipt);
    } catch (error) {
      if (signal.aborted || onError(error)) return;
      if (error instanceof CapabilityError && error.code === "VERSION_CONFLICT") {
        setConflict(true);
        setFeedback("conflict");
      } else if (!(error instanceof CapabilityError) || error.code === "INTERNAL") {
        // No receipt can prove whether the operation committed. A retry keeps
        // this revision, so a committed operation cannot be applied twice.
        setReceiptLost(true);
        setFeedback("uncertain");
      } else setFeedback("failed");
    } finally {
      active.current = false;
      if (!signal.aborted) setBusy(null);
    }
  }

  async function readLatest() {
    const signal = getSessionSignal();
    if (active.current || !signal || signal.aborted) return;
    active.current = true;
    setConfirm(null);
    setBusy("reload");
    setFeedback(null);
    try {
      const current = await reload(signal);
      if (signal.aborted) return;
      if (receiptLost) {
        // A catalog revision is not a receipt. Do not rebase an ambiguous create.
        setFeedback("verified");
        return;
      }
      if (base.kind === "create") {
        setBase({ kind: "create", revision: current.revision });
        const available = new Set(current.tags.map((tag) => tag.tagId));
        setFields((draft) => ({ ...draft, tagIds: draft.tagIds.filter((id) => available.has(id)) }));
      } else {
        const entry = current.entries.find((item) => item.entryId === base.entry.entryId);
        if (!entry) throw new Error("Missing entry");
        const accountId = base.kind === "account" ? base.account.accountId : undefined;
        const account = entry.accounts.find((item) => item.accountId === accountId);
        if (accountId && !account) throw new Error("Missing account");
        const next = account ? { kind: "account" as const, entry, account } : { kind: base.kind === "add-account" ? ("add-account" as const) : ("entry" as const), entry };
        setBase(next);
        setFields(fieldsFor(next));
        setDirty(false);
      }
      setConflict(false);
    } catch (error) {
      if (!signal.aborted && !onError(error)) setFeedback("reload-failed");
    } finally {
      active.current = false;
      if (!signal.aborted) setBusy(null);
    }
  }

  return (
    <Dialog
      open
      wide
      title={confirm === "discard" ? "放弃本次编辑？" : confirm === "reload" ? "重读当前版本？" : title}
      onClose={requestClose}
      testId="safe-item-dialog"
      actions={
        confirm ? (
          <>
            <button ref={continueButton} type="button" className="hu-btn" onClick={() => setConfirm(null)}>
              继续编辑
            </button>
            <Button variant="danger" aria-describedby={`${formId}-confirm`} onClick={confirm === "discard" ? close : () => void readLatest()}>
              {confirm === "discard" ? "放弃更改" : "重读并替换表单"}
            </Button>
          </>
        ) : (
          <>
            <Button disabled={busy !== null} onClick={requestClose}>
              取消编辑
            </Button>
            <Button icon={Lock} onClick={onLock}>
              锁定保险箱
            </Button>
            <Button type="submit" form={formId} variant="primary" disabled={conflict || busy === "reload" || !!newTag} loading={busy === "save"} data-testid="safe-save">
              {busy === "save" ? "正在保存…" : "保存"}
            </Button>
          </>
        )
      }
    >
      <div ref={root}>
        {confirm ? (
          <p id={`${formId}-confirm`}>{confirm === "discard" ? "本次编辑尚未确认保存。" : "当前保存的内容会替换表单中的字段。"}</p>
        ) : (
          <form
            id={formId}
            className="hu-form-body"
            aria-label={title}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset className="safe-editor-fields" disabled={busy !== null}>
              {editsEntry ? (
                <div className="safe-form-pair">
                  <FormField label="名称（必填）">{(id) => <input id={id} required pattern={String.raw`.*\S.*`} value={fields.name} onChange={(event) => update({ ...fields, name: event.target.value })} />}</FormField>
                  <FormField label="网址">{(id) => <input id={id} type="url" pattern="[Hh][Tt][Tt][Pp][Ss]?://.+" value={fields.url} onChange={(event) => update({ ...fields, url: event.target.value })} />}</FormField>
                </div>
              ) : null}
              {editsEntry ? (
                <fieldset className="hu-card-alt safe-tag-editor">
                  <legend>标签</legend>
                  <div className="safe-tag-strip">
                    {tags.map((tag) => (
                      <label key={tag.tagId} className="safe-tag-choice">
                        <input
                          type="checkbox"
                          checked={fields.tagIds.includes(tag.tagId)}
                          onChange={(event) =>
                            update({
                              ...fields,
                              tagIds: event.target.checked ? [...fields.tagIds, tag.tagId] : fields.tagIds.filter((id) => id !== tag.tagId),
                            })
                          }
                        />
                        <TagBadge tag={tag} />
                      </label>
                    ))}
                    {fields.newTags.map((tag) => (
                      <label key={tag.name} className="safe-tag-choice">
                        <input type="checkbox" checked onChange={() => update({ ...fields, newTags: fields.newTags.filter((item) => item.name !== tag.name) })} />
                        <TagBadge tag={tag} />
                      </label>
                    ))}
                    <button ref={addTag} type="button" className="hu-btn" aria-expanded={newTag !== null} onClick={() => (newTag ? closeNewTag() : setNewTag(emptyTag))}>
                      新增标签
                    </button>
                  </div>
                  {newTag ? (
                    <div ref={inlineTag} className="hu-stack">
                      <TagFieldsInput value={newTag} onChange={setNewTag} nested />
                      <div className="safe-tag-strip">
                        <Button onClick={closeNewTag}>取消新增标签</Button>
                        <Button variant="primary" disabled={!newTag.name.trim()} onClick={() => applyTag(newTag)}>
                          应用标签
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </fieldset>
              ) : null}
              {fields.accounts.map((account, index) => (
                <fieldset className="hu-card-alt hu-stack safe-account-card" key={account.key} data-account-key={account.key}>
                  <legend>{base.kind === "create" ? `账号 ${index + 1}` : "账号信息"}</legend>
                  <AccountFields draft={account} creating={base.kind !== "account"} onChange={(next) => update({ ...fields, accounts: fields.accounts.map((item) => (item.key === next.key ? next : item)) })} />
                  {base.kind === "create" && fields.accounts.length > 1 ? (
                    <Button
                      variant="ghost"
                      aria-label={`移除此账号 · 第 ${index + 1} 个`}
                      onClick={() => {
                        const accounts = fields.accounts.filter((item) => item.key !== account.key);
                        focusNew.current = accounts[Math.min(index, accounts.length - 1)]!.key;
                        update({ ...fields, accounts });
                      }}
                    >
                      移除此账号
                    </Button>
                  ) : null}
                </fieldset>
              ))}
              {base.kind === "create" ? (
                <Button
                  icon={Plus}
                  onClick={() => {
                    const key = nextAccountKey.current++;
                    focusNew.current = key;
                    update({ ...fields, accounts: [...fields.accounts, blankAccount(key)] });
                  }}
                >
                  再添加一个账号
                </Button>
              ) : null}
            </fieldset>
            <p ref={status} tabIndex={-1} role={feedback && feedback !== "verified" ? "alert" : "status"} className={feedback && feedback !== "verified" ? "hu-field-error" : undefined}>
              {busy === "reload" ? "正在读取当前版本…" : feedback ? feedbackText[feedback] : null}
            </p>
            {conflict || receiptLost ? (
              <Button
                disabled={busy !== null}
                onClick={() => {
                  if (!receiptLost && base.kind !== "create" && dirty) setConfirm("reload");
                  else void readLatest();
                }}
              >
                {receiptLost ? "核对当前条目" : "重读当前版本"}
              </Button>
            ) : null}
          </form>
        )}
      </div>
    </Dialog>
  );
}

function AccountFields({ draft, creating, onChange }: { draft: AccountDraft; creating: boolean; onChange(next: AccountDraft): void }) {
  return (
    <>
      <div className="safe-form-pair">
        <FormField label="账号（必填）">{(id) => <input id={id} required pattern={String.raw`.*\S.*`} value={draft.account} onChange={(event) => onChange({ ...draft, account: event.target.value })} />}</FormField>
        <FormField label="手机号">{(id) => <input id={id} type="tel" value={draft.phone} onChange={(event) => onChange({ ...draft, phone: event.target.value })} />}</FormField>
      </div>
      <FormField label="邮箱">{(id) => <input id={id} type="email" value={draft.email} onChange={(event) => onChange({ ...draft, email: event.target.value })} />}</FormField>
      <FormField label="备注">{(id) => <textarea id={id} value={draft.note} onChange={(event) => onChange({ ...draft, note: event.target.value })} />}</FormField>
      {!creating ? (
        <FormField label="密码操作">
          {(id) => (
            <select id={id} value={draft.passwordMode} onChange={(event) => onChange({ ...draft, password: "", passwordMode: event.target.value as PasswordMode })}>
              <option value="keep">保留原密码</option>
              <option value="set">设置新密码</option>
              <option value="clear">清空密码</option>
            </select>
          )}
        </FormField>
      ) : null}
      <FormField label={creating ? "密码" : "新密码"}>
        {(id) => (
          <input
            id={id}
            type="password"
            autoComplete="off"
            disabled={!creating && draft.passwordMode !== "set"}
            required={!creating && draft.passwordMode === "set"}
            value={draft.password}
            onChange={(event) => onChange({ ...draft, password: event.target.value })}
          />
        )}
      </FormField>
    </>
  );
}
