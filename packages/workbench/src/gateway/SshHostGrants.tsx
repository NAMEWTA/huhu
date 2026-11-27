import type { ToolAccessResources, ToolAccessSnapshot } from "@huhu/contracts";
import { Button } from "@huhu/ui";
import { useId, useState } from "react";
import { CapabilityError } from "../engine-client/client.js";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";

type Host = { id: string; name: string; host: string; port: number; user: string; auth: { source: string } };
type Draft = { revision: number; ids: ReadonlySet<string> };

export function SshHostGrants({ policy, writable }: { policy: ToolAccessSnapshot | undefined; writable: boolean }) {
  const engine = useEngine();
  const query = useQueryClient();
  const title = useId();
  const hosts = useCapability<Host[]>("ssh.hosts.list");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const saved = policy?.state === "ready" ? (policy.resources?.["ssh.hosts"] ?? []) : [];
  const selected = draft?.ids ?? new Set(saved);
  const currentHosts = hosts.isSuccess ? hosts.data : [];
  const rows = new Map(currentHosts.filter(({ auth }) => auth.source === "ssh").map(({ id, name, host, port, user }) => [id, `${name} · ${user}@${host.includes(":") ? `[${host}]` : host}:${port}`]));
  for (const id of saved) if (!rows.has(id)) rows.set(id, `主机不可用 · ${id}`);
  const changed = selected.size !== saved.length || saved.some((id) => !selected.has(id));
  const stale = draft !== null && policy?.state === "ready" && draft.revision !== policy.revision;
  const editingBlocked = busy || !writable || policy?.state !== "ready";
  const sshDisabled = hosts.error instanceof CapabilityError && hosts.error.code === "PLUGIN_DISABLED";
  const refresh = () => query.invalidateQueries({ queryKey: [engine.vaultId, "gateway.get"] });

  function choose(id: string, checked: boolean) {
    if (!writable || policy?.state !== "ready") return;
    setError("");
    setMessage("");
    setDraft((previous) => {
      const ids = new Set(previous?.ids ?? saved);
      if (checked) ids.add(id);
      else ids.delete(id);
      return { ids, revision: previous?.revision ?? policy.revision };
    });
  }

  async function save() {
    if (!draft || !changed || editingBlocked || stale) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const resources: ToolAccessResources = { "ssh.hosts": [...draft.ids].sort() };
      const preview = await engine.call<{ revision: number; catalogRevision: string }>("gateway.policy.preview", { resources, expectedRevision: draft.revision });
      await engine.call("gateway.policy.update", { resources, expectedRevision: preview.revision, catalogRevision: preview.catalogRevision }, { write: true });
      setDraft(null);
      await refresh();
      setMessage("已保存 SSH 主机授权。");
    } catch (failure) {
      setError(failure instanceof CapabilityError && failure.code === "VERSION_CONFLICT" ? "授权策略已变化。请核对当前授权后重新选择。" : failure instanceof Error ? failure.message : String(failure));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="hu-card-alt"
      aria-labelledby={title}
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset className="hu-gateway-grants" disabled={editingBlocked}>
        <legend id={title}>允许外部工具访问的 SSH 主机</legend>
        {policy?.state === "ready" ? (
          <p>
            已授权 {saved.length} 台{draft ? ` · 选中 ${selected.size} 台` : ""}
          </p>
        ) : null}
        {sshDisabled ? <p role="status">SSH 模块已停用。</p> : hosts.isError ? <p role="alert">无法读取已保存的 SSH 主机。</p> : null}
        {rows.size === 0 && !hosts.isError ? <p>{hosts.isPending ? "正在读取 SSH 主机…" : "没有已保存的 SSH 主机。"}</p> : null}
        {[...rows].map(([id, label]) => (
          <label className="row" key={id}>
            <input type="checkbox" name="ssh.hosts" value={id} checked={selected.has(id)} disabled={stale} onChange={(event) => choose(id, event.target.checked)} />
            {label}
          </label>
        ))}
        {rows.size > 0 ? (
          <div className="hu-gateway-grant-actions">
            <Button type="submit" variant="primary" disabled={!changed || stale}>
              保存主机授权
            </Button>
            {draft && (
              <Button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setError("");
                }}
              >
                放弃修改
              </Button>
            )}
          </div>
        ) : null}
      </fieldset>
      {error || stale ? <p role="alert">{error || "授权策略已变化。请核对当前授权后重新选择。"}</p> : null}
      <p role="status">{message}</p>
    </form>
  );
}
