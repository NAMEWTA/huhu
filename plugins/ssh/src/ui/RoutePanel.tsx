import { Button, EmptyState, PageHead, SearchBox } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useState } from "react";
import type { ConfigureHost } from "../engine/auth-profile.js";
import { routeForHost } from "../shared/route.js";
import { isManagedHost, type Host, type ManagedHost } from "./host-record.js";
import { ConfigSyncPanel } from "./ConfigSyncPanel.js";
import { ProxySharePanel } from "./ProxySharePanel.js";
import type { ConnectionStatus } from "../shared/trust.js";

function routeDescription(hosts: Map<string, ManagedHost>, host: ManagedHost): string {
  try {
    return routeForHost(hosts, host.id)
      .map(({ name }) => name)
      .join(" → ");
  } catch {
    return "路由不可用，请重新选择跳板";
  }
}

export function RoutePanel({ hosts, connections, onBack, onChanged }: { hosts: readonly Host[]; connections: ConnectionStatus[]; onBack(): void; onChanged(): Promise<unknown> }) {
  const engine = useEngine();
  const [query, setQuery] = useState("");
  const [sync, setSync] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [groupByJump, setGroupByJump] = useState(false);
  const [saving, setSaving] = useState<string>();
  const [draftJumps, setDraftJumps] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();
  const managed = hosts.filter(isManagedHost);
  const byId = new Map(managed.map((host) => [host.id, host]));
  const configuredEdges = new Map(managed.map((host) => [host.id, { ...host, routeDisabled: undefined }]));
  const visible = managed.filter(({ name, host, user }) => `${name} ${user}@${host}`.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = new Map<string, ManagedHost[]>();
  for (const host of visible) {
    const group = !groupByJump ? "目标主机" : (byId.get(host.jumpHostIds[0] ?? "")?.name ?? "直连主机");
    const members = groups.get(group) ?? [];
    members.push(host);
    groups.set(group, members);
  }

  async function save(host: ManagedHost, jump: string, disabled: boolean) {
    if (saving) return;
    const { id, revision, auth, authState: _authState, configured: _configured, keyId: _keyId, routeDisabled: _disabled, ...profile } = host;
    const input: ConfigureHost = { ...profile, jumpHostIds: jump ? [jump] : [], routeDisabled: disabled, hostId: id, expectedRevision: revision, authKind: auth.kind, credentials: [] };
    setSaving(id);
    setFeedback(undefined);
    try {
      await engine.call("ssh.hosts.configure", input, { write: true });
      await onChanged();
      setDraftJumps((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setFeedback({ error: false, text: `已保存「${host.name}」的路由，将在下次连接生效。` });
    } catch (reason) {
      setFeedback({ error: true, text: reason instanceof Error ? reason.message : "无法保存跳板路由。" });
      await onChanged();
    } finally {
      setSaving(undefined);
    }
  }

  function validJump(candidate: ManagedHost, target: string) {
    try {
      return !routeForHost(configuredEdges, candidate.id).some(({ id }) => id === target);
    } catch {
      return false;
    }
  }

  if (sync) return <ConfigSyncPanel hosts={managed} onBack={() => setSync(false)} onChanged={onChanged} />;
  if (sharing) return <ProxySharePanel hosts={managed} connections={connections} onBack={() => setSharing(false)} />;
  return (
    <section className="hu-view-content">
      <PageHead title="跳板路由" description="查看目标的完整跳板链，设置直接跳板。" actions={<Button onClick={onBack}>返回主机</Button>} />
      <div className="ssh-workspace-controls">
        <Button onClick={() => setSync(true)}>OpenSSH 配置同步</Button>
        <Button onClick={() => setSharing(true)}>辅助代理分享</Button>
        <SearchBox value={query} onChange={setQuery} placeholder="筛选目标主机…" />
        <label className="row">
          <input type="checkbox" checked={groupByJump} onChange={(event) => setGroupByJump(event.currentTarget.checked)} /> 按直接跳板分组
        </label>
      </div>
      {feedback && <p role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
      {visible.length === 0 && <EmptyState title="没有匹配的目标主机" />}
      {[...groups].map(([group, members]) => (
        <section key={group} className="hu-card-alt hu-stack">
          <h3>{group}</h3>
          {members.map((host) => (
            <article key={host.id} className="hu-stack">
              <strong>{host.name}</strong>
              <span>
                {host.routeDisabled ? "路由已停用 · " : ""}
                {routeDescription(byId, host)}
              </span>
              <div className="ssh-workspace-controls">
                <label className="row">
                  直接跳板
                  <select
                    value={draftJumps[host.id] ?? host.jumpHostIds[0] ?? ""}
                    disabled={Boolean(saving)}
                    onChange={(event) => {
                      const jump = event.currentTarget.value;
                      setDraftJumps((current) => ({ ...current, [host.id]: jump }));
                    }}
                  >
                    <option value="">直连</option>
                    {host.jumpHostIds[0] && !byId.has(host.jumpHostIds[0]) && (
                      <option value={host.jumpHostIds[0]} disabled>
                        原跳板不可用
                      </option>
                    )}
                    {managed
                      .filter((candidate) => candidate.id !== host.id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id} disabled={!validJump(candidate, host.id)}>
                          {candidate.name}
                        </option>
                      ))}
                  </select>
                </label>
                {draftJumps[host.id] !== undefined && draftJumps[host.id] !== (host.jumpHostIds[0] ?? "") ? (
                  <Button loading={saving === host.id} disabled={Boolean(saving)} onClick={() => void save(host, draftJumps[host.id]!, false)}>
                    保存路由
                  </Button>
                ) : (
                  host.jumpHostIds[0] && (
                    <Button loading={saving === host.id} disabled={Boolean(saving)} onClick={() => void save(host, host.jumpHostIds[0]!, !host.routeDisabled)}>
                      {host.routeDisabled ? "启用路由" : "停用路由"}
                    </Button>
                  )
                )}
              </div>
            </article>
          ))}
        </section>
      ))}
    </section>
  );
}
