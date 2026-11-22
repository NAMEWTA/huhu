import { Button, Dialog, EmptyState, PageHead } from "@huhu/ui";
import { host as desktopHost, useCapability, useEngine } from "@huhu/workbench";
import { useId, useRef, useState, type FormEvent } from "react";
import type { AddSshKey, SshKeySummary } from "../shared/key-library.js";

function AddKeyDialog({ action, onClose, save }: { action: AddSshKey["action"]; onClose(): void; save(input: AddSshKey): Promise<void> }) {
  const formId = useId();
  const [privateKey, setPrivateKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const pending = useRef(false);

  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError("私钥文件不能超过 1 MiB。");
      return;
    }
    setReading(true);
    setError("");
    try {
      setPrivateKey(await file.text());
    } catch {
      setError("无法读取私钥文件。");
    } finally {
      setReading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || reading) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const passphrase = String(form.get("passphrase") ?? "") || undefined;
    const draft = { name, ...(passphrase && { passphrase }) };
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await save(action === "generate" ? { action, ...draft } : { action, ...draft, privateKey });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法保存密钥。");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={action === "generate" ? "生成 Ed25519 密钥" : "导入 SSH 私钥"}
      onClose={() => {
        if (!busy && !reading) onClose();
      }}
      actions={
        <>
          <Button disabled={busy || reading} onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={reading} variant="primary">
            保存密钥
          </Button>
        </>
      }
    >
      <form id={formId} method="post" className="hu-form-body" onSubmit={(event) => void submit(event)}>
        <label className="hu-field">
          名称
          <input name="name" required maxLength={120} disabled={busy} />
        </label>
        {action === "import" && (
          <>
            <label className="hu-field">
              选择私钥文件
              <input type="file" disabled={busy || reading} onChange={(event) => void importFile(event.currentTarget.files?.[0])} />
            </label>
            <label className="hu-field">
              私钥内容
              <textarea name="privateKey" required maxLength={1024 * 1024} rows={5} spellCheck={false} value={privateKey} disabled={busy || reading} onChange={(event) => setPrivateKey(event.currentTarget.value)} />
            </label>
          </>
        )}
        <label className="hu-field">
          私钥口令（可选）
          <input name="passphrase" type="password" autoComplete="new-password" disabled={busy} maxLength={1024} />
        </label>
        {error && (
          <p className="hu-field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

export function KeyLibraryPanel({ onBack }: { onBack(): void }) {
  const engine = useEngine();
  const keys = useCapability<SshKeySummary[]>("ssh.keys.list", {});
  const [add, setAdd] = useState<AddSshKey["action"]>();
  const [remove, setRemove] = useState<SshKeySummary>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function copy(key: SshKeySummary) {
    setStatus("");
    setError("");
    try {
      const desktop = desktopHost();
      if (desktop) await desktop.copyText(key.publicKey);
      else await navigator.clipboard.writeText(key.publicKey);
      setStatus(`已复制「${key.name}」的公钥`);
    } catch {
      setError("无法复制公钥。");
    }
  }

  async function removeKey(key: SshKeySummary) {
    setBusy(true);
    setError("");
    try {
      await engine.call("ssh.keys.remove", { id: key.id, revision: key.revision }, { write: true });
      setRemove(undefined);
      await keys.refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法删除密钥。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hu-view-content">
      <PageHead title="SSH 密钥" description="管理保存在本机的 SSH 私钥。身份文件和 SSH Agent 在主机配置中选择。" actions={<Button onClick={onBack}>返回主机</Button>} />
      <div className="ssh-workspace-controls">
        <Button onClick={() => setAdd("import")}>导入私钥</Button>
        <Button onClick={() => setAdd("generate")}>生成 Ed25519</Button>
      </div>
      <p role="status">{status}</p>
      {(keys.error || (error && !remove)) && <p role="alert">{error || keys.error?.message}</p>}
      {keys.data?.length === 0 && <EmptyState title="尚无已保存的 SSH 密钥" />}
      <ul className="hu-stack">
        {keys.data?.map((key) => (
          <li key={key.id} className="hu-stack">
            <strong>{key.name}</strong>
            <code>
              {key.keyType} {key.fingerprint}
            </code>
            <p>
              {key.encrypted ? "需要私钥口令" : "无私钥口令"} · {key.available ? "本机可用" : "本机不可用"}
              {key.referenced ? " · 已被主机引用" : ""}
            </p>
            <div className="ssh-workspace-controls">
              <Button onClick={() => void copy(key)} aria-label={`复制「${key.name}」公钥`}>
                复制公钥
              </Button>
              <Button
                disabled={key.referenced}
                onClick={() => {
                  setError("");
                  setRemove(key);
                }}
                aria-label={`删除「${key.name}」`}
              >
                删除
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {add && (
        <AddKeyDialog
          action={add}
          onClose={() => setAdd(undefined)}
          save={async (input) => {
            await engine.call("ssh.keys.add", input, { write: true });
            setAdd(undefined);
            await keys.refetch();
          }}
        />
      )}
      {remove && (
        <Dialog
          open
          title={`删除「${remove.name}」`}
          onClose={() => {
            if (!busy) setRemove(undefined);
          }}
          actions={
            <>
              <Button disabled={busy} onClick={() => setRemove(undefined)}>
                取消
              </Button>
              <Button loading={busy} onClick={() => void removeKey(remove)}>
                删除密钥
              </Button>
            </>
          }
        >
          <p>此操作会删除本机保存的私钥。</p>
          {error && <p role="alert">{error}</p>}
        </Dialog>
      )}
    </section>
  );
}
