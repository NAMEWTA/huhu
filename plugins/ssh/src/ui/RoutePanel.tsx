import { Button, EmptyState, PageHead, SearchBox } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useState } from "react";
import type { ConfigureHost } from "../engine/auth-profile.js";
import { maxRouteEditTargets, type EditHostRoutes, type HostRouteEditResult } from "../engine/route-edits.js";
import { routeForHost } from "../shared/route.js";
import { isManagedHost, type Host, type ManagedHost } from "./host-record.js";
import { ConfigSyncPanel } from "./ConfigSyncPanel.js";
import { OutboundProxyPanel } from "./OutboundProxyPanel.js";
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

function matchesHost(host: Host, query: string) {
  return `${host.name} ${host.user}@${host.host}`.toLowerCase().includes(query.trim().toLowerCase());
}

function jumpIssue(graph: ReadonlyMap<string, ManagedHost>, candidate: Host, targets: ReadonlySet<string>) {
  if (!isManagedHost(candidate)) return "旧式主机需要修复";
  if (targets.has(candidate.id)) return "目标不能用自身作为跳板";
  try {
    if (routeForHost(graph, candidate.id).some(({ id }) => targets.has(id))) return "会形成循环";
  } catch (error) {
    return error instanceof Error ? error.message : "跳板链不可用";
  }
}

export function RoutePanel({ hosts, connections, defaultTargets = [], onBack, onChanged }: {
  hosts: readonly Host[];
  connections: ConnectionStatus[];
  defaultTargets?: readonly string[] | undefined;
  onBack(): void;
  onChanged(): Promise<unknown>;
}) {
  const engine = useEngine();
  const [query, setQuery] = useState("");
  const [sync, setSync] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [groupByJump, setGroupByJump] = useState(false);
  const [saving, setSaving] = useState<string>();
  const [draftJumps, setDraftJumps] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState(() => {
    const targets = new Set(defaultTargets);
    return new Map(hosts.filter(isManagedHost).filter(({ id }) => targets.has(id)).map(({ id, name, revision }) => [id, { name, revision }]));
  });
  const [jumpQuery, setJumpQuery] = useState("");
  const [batchJump, setBatchJump] = useState("");
  const [ifExists, setIfExists] = useState<"skip" | "replace">("skip");
  const [feedback, setFeedback] = useState<{ error: boolean; text: string; items?: { id: string; text: string }[] }>();
  const managed = hosts.filter(isManagedHost);
  const knownIds = new Set(hosts.map(({ id }) => id));
  const byId = new Map(managed.map((host) => [host.id, host]));
  const configuredEdges = new Map(managed.map((host) => [host.id, { ...host, routeDisabled: undefined }]));
  const visible = managed.filter((host) => matchesHost(host, query));
  const groups = new Map<string, ManagedHost[]>();
  for (const host of visible) {
    const group = groupByJump ? (host.jumpHostIds[0] ?? "") : "";
    const members = groups.get(group) ?? [];
    members.push(host);
    groups.set(group, members);
  }
  const hiddenCount = selected.size - visible.filter(({ id }) => selected.has(id)).length;
  const stale = [...selected].filter(([id, item]) => item.revision !== byId.get(id)?.revision);
  const withoutRoute = [...selected].filter(([id]) => !byId.get(id)?.jumpHostIds.length);
  const associationTargets = new Set([...selected.keys()].filter((id) => ifExists === "replace" || !byId.get(id)?.jumpHostIds.length));
  const jumpOptions = hosts.filter((host) => host.id === batchJump || matchesHost(host, jumpQuery)).map((host) => ({ host, issue: jumpIssue(configuredEdges, host, associationTargets) }));
  const chosenJump = jumpOptions.find(({ host }) => host.id === batchJump);
  const canBatch = selected.size > 0 && !stale.length && !saving;

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

  function selectTarget(host: ManagedHost, checked: boolean) {
    setSelected((current) => {
      const next = new Map(current);
      if (!checked) next.delete(host.id);
      else if (next.size < maxRouteEditTargets) next.set(host.id, { name: host.name, revision: host.revision });
      return next;
    });
  }

  async function editBatch(change: EditHostRoutes["change"]) {
    if (!canBatch) return;
    const targets = [...selected].map(([hostId, item]) => ({ hostId, expectedRevision: item.revision }));
    setSaving("batch");
    setFeedback(undefined);
    try {
      const result = await engine.call<HostRouteEditResult>("ssh.routes.edit", { targets, change }, { write: true });
      const updated = new Set(result.updated);
      setFeedback({
        error: false,
        text: `已更新 ${result.updated.length} 台，跳过 ${result.skipped.length} 台。${updated.size ? "路由变更将在下次连接时生效。" : ""}`,
        items: [...selected].map(([id, item]) => {
          const skipped = change.action === "setEnabled" ? "已是所选状态" : change.ifExists === "skip" ? "已有路由" : "直接跳板相同";
          return { id, text: `${item.name} · ${updated.has(id) ? "已更新" : `已跳过（${skipped}）`}` };
        }),
      });
      setSelected(new Map());
      setDraftJumps((current) => {
        const next = { ...current };
        for (const id of updated) delete next[id];
        return next;
      });
    } catch (reason) {
      setFeedback({ error: true, text: reason instanceof Error ? reason.message : "无法批量保存跳板路由。" });
    } finally {
      try {
        await onChanged();
      } catch {
        setFeedback((current) => current && { ...current, text: current.text + " 当前列表刷新失败，请重新打开路由页核对。" });
      } finally {
        setSaving(undefined);
      }
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
        <search aria-label="筛选目标主机">
          <SearchBox value={query} onChange={setQuery} placeholder="筛选目标主机…" />
        </search>
        <label className="row">
          <input type="checkbox" checked={groupByJump} onChange={(event) => setGroupByJump(event.currentTarget.checked)} /> 按直接跳板分组
        </label>
      </div>
      <OutboundProxyPanel />
      <fieldset className="hu-card-alt hu-stack" disabled={Boolean(saving)}>
        <legend>批量路由</legend>
        <div className="ssh-workspace-controls">
          <span>
            已选 {selected.size} 台{hiddenCount > 0 && `，其中 ${hiddenCount} 台在当前筛选范围外`}
          </span>
          <Button disabled={!selected.size} onClick={() => setSelected(new Map())}>
            清空选择
          </Button>
        </div>
        {selected.size === maxRouteEditTargets && <p>每批最多选择 {maxRouteEditTargets} 台主机。</p>}
        {selected.size > 0 && <p>{[...selected.values()].map(({ name }) => name).join("、")}</p>}
        {stale.length > 0 && <p>{stale.map(([, item]) => item.name).join("、")}的配置已更新或移除，请取消勾选后重新选择。</p>}
        <div className="ssh-workspace-controls">
          <search aria-label="搜索批量跳板">
            <SearchBox value={jumpQuery} onChange={setJumpQuery} placeholder="搜索批量跳板…" />
          </search>
          <label className="hu-field">
            批量跳板
            <select aria-label="批量跳板" value={batchJump} onChange={(event) => setBatchJump(event.currentTarget.value)}>
              <option value="">选择直接跳板</option>
              {batchJump && !chosenJump && (
                <option value={batchJump} disabled>
                  所选跳板已移除
                </option>
              )}
              {jumpOptions.map(({ host, issue }) => (
                <option key={host.id} value={host.id} disabled={Boolean(issue)}>
                  {host.name}
                  {issue && ` · ${issue}`}
                </option>
              ))}
            </select>
          </label>
          <label className="row">
            <input type="checkbox" checked={ifExists === "replace"} onChange={(event) => setIfExists(event.currentTarget.checked ? "replace" : "skip")} />
            覆盖已有路由（默认跳过）
          </label>
          <Button disabled={!canBatch || !chosenJump || Boolean(chosenJump.issue)} onClick={() => void editBatch({ action: "associate", jumpHostId: batchJump, ifExists })}>
            批量关联
          </Button>
        </div>
        {chosenJump?.issue && <p>{chosenJump.issue}</p>}
        <div className="ssh-workspace-controls">
          <Button disabled={!canBatch || withoutRoute.length > 0} onClick={() => void editBatch({ action: "setEnabled", enabled: true })}>
            批量启用
          </Button>
          <Button disabled={!canBatch || withoutRoute.length > 0} onClick={() => void editBatch({ action: "setEnabled", enabled: false })}>
            批量停用
          </Button>
        </div>
        {withoutRoute.length > 0 && <p>{withoutRoute.map(([, item]) => item.name).join("、")}尚未设置跳板。</p>}
      </fieldset>
      <div role="status">{feedback && !feedback.error && <p>{feedback.text}</p>}</div>
      {feedback?.error && <p role="alert">{feedback.text}</p>}
      {feedback?.items && (
        <ul aria-label="各目标的批量结果">
          {feedback.items.map(({ id, text }) => (
            <li key={id}>{text}</li>
          ))}
        </ul>
      )}
      {visible.length === 0 && <EmptyState title="没有匹配的目标主机" />}
      {[...groups].map(([group, members]) => (
        <section key={group} className="hu-card-alt hu-stack">
          <h3>{groupByJump ? (group ? (byId.get(group)?.name ?? "跳板不可用") : "直连主机") : "目标主机"}</h3>
          {members.map((host) => {
            const target = new Set([host.id]);
            const draft = draftJumps[host.id];
            const currentJump = draft ?? host.jumpHostIds[0] ?? "";
            const candidate = byId.get(currentJump);
            const invalidDraft = Boolean(draft && (!candidate || jumpIssue(configuredEdges, candidate, target)));
            return (
              <article key={host.id} className="hu-stack">
                <label className="row" htmlFor={`route-target-${host.id}`}>
                  <input
                    id={`route-target-${host.id}`}
                    type="checkbox"
                    checked={selected.has(host.id)}
                    disabled={Boolean(saving) || (!selected.has(host.id) && selected.size >= maxRouteEditTargets)}
                    onChange={(event) => selectTarget(host, event.currentTarget.checked)}
                  />
                  <strong>{host.name}</strong>
                </label>
                <span>
                  {host.routeDisabled ? "路由已停用 · " : ""}
                  {routeDescription(byId, host)}
                </span>
                <div className="ssh-workspace-controls">
                  <label className="row">
                    直接跳板
                    <select
                      value={currentJump}
                      disabled={Boolean(saving)}
                      onChange={(event) => {
                        const jump = event.currentTarget.value;
                        setDraftJumps((current) => ({ ...current, [host.id]: jump }));
                      }}
                    >
                      <option value="">直连</option>
                      {currentJump && !knownIds.has(currentJump) && (
                        <option value={currentJump} disabled>
                          所选跳板不可用
                        </option>
                      )}
                      {hosts.map((candidate) => {
                        const issue = jumpIssue(configuredEdges, candidate, target);
                        return (
                          <option key={candidate.id} value={candidate.id} disabled={Boolean(issue)}>
                            {candidate.name}
                            {issue && ` · ${issue}`}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  {draft !== undefined && draft !== (host.jumpHostIds[0] ?? "") ? (
                    <Button loading={saving === host.id} disabled={Boolean(saving) || invalidDraft} onClick={() => void save(host, draft, false)}>
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
            );
          })}
        </section>
      ))}
    </section>
  );
}
