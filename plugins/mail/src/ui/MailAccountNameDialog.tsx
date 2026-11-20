import { Button, Dialog } from "@huhu/ui";
import { CapabilityError, useEngine } from "@huhu/workbench";
import { useEffect, useId, useRef, useState } from "react";
import { MailField } from "./MailAccountDialog.js";
import type { MailAccount } from "./mail-types.js";

export function MailAccountNameDialog({ account, onClose, onSaved }: { account: MailAccount; onClose(): void; onSaved(): void }) {
  const engine = useEngine();
  const formId = useId();
  const request = useRef<AbortController | null>(null);
  const [label, setLabel] = useState(account.definition.settings.label);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => request.current?.abort(), [engine]);

  function close() {
    request.current?.abort();
    onClose();
  }

  async function save() {
    if (request.current || label.trim() === account.definition.settings.label) return;
    const controller = new AbortController();
    request.current = controller;
    setSaving(true);
    setError("");
    try {
      await engine.call("mail.accounts.rename", { accountId: account.accountId, expectedRevision: account.revision, label }, { write: true, signal: controller.signal });
      if (!controller.signal.aborted) onSaved();
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof CapabilityError ? err.message : "暂时无法保存邮箱名称。");
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setSaving(false);
      }
    }
  }

  return (
    <Dialog
      open
      title="更改邮箱名称"
      description={account.definition.settings.email}
      error={error}
      onClose={close}
      actions={
        <>
          <Button onClick={close}>取消</Button>
          <Button type="submit" form={formId} variant="primary" disabled={label.trim() === account.definition.settings.label} loading={saving}>
            保存名称
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="hu-mail-form"
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <MailField
          label="显示名称"
          control={(id) => (
            <input
              id={id}
              name="label"
              maxLength={80}
              disabled={saving}
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setError("");
              }}
            />
          )}
        />
        <p className="hu-mail-help">留空时显示邮箱地址。已保存的邮箱凭据继续使用。</p>
      </form>
    </Dialog>
  );
}
