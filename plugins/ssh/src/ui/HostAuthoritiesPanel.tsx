import { Button, Dialog } from "@huhu/ui";
import { useCapability, useEngine } from "@huhu/workbench";
import { useId, useRef, useState, type FormEvent } from "react";
import type { KnownHostAuthorities, KnownHostAuthority } from "../shared/trust.js";
import { hostEndpoint } from "./HostKeyDialog.js";
import { isManagedHost, type Host, type ManagedHost } from "./host-record.js";

type Change = { kind: "add"; revision: string | null; hosts: ManagedHost[] } | { kind: "remove"; revision: string | null; authority: KnownHostAuthority };

export function HostAuthoritiesPanel() {
  const engine = useEngine();
  const trust = useCapability<KnownHostAuthorities>("ssh.knownHosts.authorities.list", {});
  const hosts = useCapability<Host[]>("ssh.hosts.list", {});
  const heading = useId();
  const form = useId();
  const hostField = useId();
  const keyField = useId();
  const keyHint = useId();
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [change, setChange] = useState<Change>();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const managed = (hosts.data ?? []).filter(isManagedHost);

  function edit(pending: Change) {
    setChange(pending);
    setError(null);
    setStatus("");
  }

  async function save(action: "add" | "remove", input: unknown, confirmation: string) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await engine.call(`ssh.knownHosts.authorities.${action}`, input, { write: true });
      setChange(undefined);
      setStatus(confirmation);
      await trust.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "无法保存此主机证书 CA 的变更");
      await trust.refetch();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (change?.kind !== "add" || trust.data?.revision !== change.revision) return;
    const data = new FormData(event.currentTarget);
    const target = change.hosts.find(({ id }) => id === data.get("hostId"));
    if (!target) {
      setError("请选择 CA 适用的主机地址和端口。");
      return;
    }
    void save("add", { hostId: target.id, expectedRevision: target.revision, expectedTrustRevision: change.revision, publicKey: data.get("publicKey") }, "已批准此主机的证书 CA。");
  }

  const close = () => {
    if (!busy.current) setChange(undefined);
  };
  const revisionChanged = change && trust.data?.revision !== change.revision;
  const dialogError = revisionChanged ? "已知主机规则已更新。请关闭后核对当前记录。" : error;

  return (
    <section className="hu-card-alt hu-stack" aria-labelledby={heading}>
      <div className="ssh-workspace-controls">
        <h3 id={heading}>主机证书 CA</h3>
        {trust.data && managed.length > 0 && (
          <Button type="button" disabled={saving} onClick={() => edit({ kind: "add", revision: trust.data!.revision, hosts: managed })}>
            批准 CA
          </Button>
        )}
      </div>
      <p>
        主机证书和签发 CA 仅支持 OpenSSH Ed25519。二进制 OpenSSH KRL 暂不支持，已知主机文件可使用 <code>@revoked</code> 记录。
      </p>
      {trust.isPending ? <p>正在读取主机证书 CA…</p> : null}
      {trust.isError ? (
        <p role="alert">
          无法读取主机证书 CA。
          <Button type="button" onClick={() => void trust.refetch()}>
            重试
          </Button>
        </p>
      ) : null}
      {trust.data && trust.data.authorities.length === 0 ? <p>尚无已批准的主机证书 CA。</p> : null}
      {trust.data && trust.data.authorities.length > 0 && (
        <ul className="hu-stack">
          {trust.data.authorities.map((authority) => (
            <li key={JSON.stringify(authority)} className="ssh-workspace-controls">
              <span>
                {authority.scope} · {authority.keyType}
              </span>
              <code className="ssh-fingerprint">{authority.fingerprint}</code>
              <Button type="button" disabled={saving} onClick={() => edit({ kind: "remove", revision: trust.data!.revision, authority })}>
                移除 CA
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p role="status">{status}</p>
      {change?.kind === "add" && (
        <Dialog
          open
          title="批准主机证书 CA"
          onClose={close}
          error={dialogError}
          actions={
            <>
              <Button type="button" disabled={saving} onClick={close}>
                取消
              </Button>
              <Button type="submit" form={form} loading={saving} disabled={Boolean(revisionChanged)}>
                批准 CA
              </Button>
            </>
          }
        >
          <form id={form} method="post" className="hu-stack" onSubmit={add} onInput={() => setError(null)}>
            <label className="hu-field" htmlFor={hostField}>
              SSH 主机地址和端口
              <select id={hostField} name="hostId" defaultValue="" required autoFocus disabled={saving}>
                <option value="" disabled>
                  选择已保存的主机
                </option>
                {change.hosts.map((host) => (
                  <option key={host.id} value={host.id}>
                    {host.name} · {hostEndpoint(host)}
                  </option>
                ))}
              </select>
            </label>
            <label className="hu-field" htmlFor={keyField}>
              Ed25519 CA 公钥
              <span id={keyHint}>请粘贴从可信渠道取得的单行 OpenSSH 公钥。批准后此地址的连接须通过主机证书校验。</span>
              <textarea id={keyField} name="publicKey" rows={3} required maxLength={64 * 1024} spellCheck={false} autoCapitalize="none" aria-describedby={keyHint} readOnly={saving} />
            </label>
          </form>
        </Dialog>
      )}
      {change?.kind === "remove" && (
        <Dialog
          open
          title="移除主机证书 CA"
          onClose={close}
          error={dialogError}
          actions={
            <>
              <Button type="button" autoFocus disabled={saving} onClick={close}>
                取消
              </Button>
              <Button type="button" variant="danger" loading={saving} disabled={Boolean(revisionChanged)} onClick={() => void save("remove", { authority: change.authority, expectedTrustRevision: change.revision }, "已移除主机证书 CA。")}>
                移除 CA
              </Button>
            </>
          }
        >
          <p>
            {change.authority.scope} · <code>{change.authority.fingerprint}</code>
          </p>
          <p>后续连接按更新后的信任规则核验。</p>
        </Dialog>
      )}
    </section>
  );
}
