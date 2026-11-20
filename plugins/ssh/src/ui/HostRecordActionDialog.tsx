import { Button, Dialog } from "@huhu/ui";
import { CapabilityError, useEngine } from "@huhu/workbench";
import { useId, useRef, useState } from "react";
import type { z } from "zod";
import type { CopyHost, HostAuthSummary, HostRevision } from "../engine/auth-profile.js";
import { isManagedHost, type Host, type ManagedHost } from "./host-record.js";
import { t } from "./i18n.js";

export function HostRecordActionDialog({
  action,
  host,
  hosts,
  onClose,
  onApplied,
  onEdit,
  onRefresh,
}: {
  action: "copy" | "remove";
  host: ManagedHost;
  hosts: readonly Host[];
  onClose(): void;
  onApplied(hostId: string | null): Promise<void>;
  onEdit(host: ManagedHost): void;
  onRefresh(): Promise<void>;
}) {
  const engine = useEngine();
  const formId = useId();
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(`${host.name} 副本`);
  const copying = action === "copy";
  const references = copying ? [] : hosts.filter((candidate) => candidate.jumpHostIds.includes(host.id));
  const blocked = references.length > 0;
  const close = () => {
    if (!working.current) onClose();
  };

  async function apply() {
    if (working.current || blocked || (copying && !name.trim())) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      const version: z.output<typeof HostRevision> = { hostId: host.id, expectedRevision: host.revision };
      if (copying) {
        const input: z.output<typeof CopyHost> = { ...version, name: name.trim() };
        const created = await engine.call<z.output<typeof HostAuthSummary>>("ssh.hosts.copy", input, { write: true });
        await onApplied(created.hostId);
      } else {
        await engine.call("ssh.hosts.remove", version, { write: true });
        await onApplied(null);
      }
    } catch (e) {
      setError(e instanceof CapabilityError ? (e.code === "VERSION_CONFLICT" ? "主机配置已更新。请关闭后重新核对。" : e.message) : "无法确认操作结果。请核对主机目录。");
      await onRefresh();
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={copying ? "复制主机" : blocked ? "此主机仍被引用" : "删除主机"}
      testId={copying ? "ssh-host-copy-dialog" : "ssh-host-remove-dialog"}
      onClose={close}
      error={error}
      actions={
        <>
          <Button autoFocus={!copying} disabled={busy} onClick={close}>
            {blocked ? "关闭" : t.cancel}
          </Button>
          {copying ? (
            <Button variant="primary" form={formId} type="submit" loading={busy} disabled={!name.trim()}>
              复制主机
            </Button>
          ) : null}
          {!copying && !blocked ? (
            <Button variant="danger" loading={busy} onClick={() => void apply()}>
              删除主机
            </Button>
          ) : null}
        </>
      }
    >
      {copying ? (
        <form
          id={formId}
          method="post"
          className="hu-form-body"
          onSubmit={(event) => {
            event.preventDefault();
            void apply();
          }}
        >
          <p>复制「{host.name}」的连接配置。副本的本机凭据须单独配置。</p>
          <div className="hu-field">
            <label className="hu-field-label" htmlFor={`${formId}-name`}>
              {t.hostName}
            </label>
            <input
              id={`${formId}-name`}
              name="name"
              required
              disabled={busy}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
          </div>
        </form>
      ) : blocked ? (
        <div className="hu-stack">
          <p>以下主机将「{host.name}」设为跳板。请先移除或改绑这些引用。</p>
          <ul className="ssh-host-references">
            {references.map((ref) => (
              <li key={ref.id}>
                <span>
                  {ref.name} · {ref.host}
                </span>
                {isManagedHost(ref) ? (
                  <Button disabled={busy} onClick={() => onEdit(ref)}>
                    编辑 {ref.name}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>删除「{host.name}」的主机配置和本机认证资料？</p>
      )}
    </Dialog>
  );
}
