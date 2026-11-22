import { Button, Dialog, EmptyState, PageHead } from "@huhu/ui";
import { useCapability, useEngine, useEngineEvents } from "@huhu/workbench";
import { useId, useState, type FormEvent } from "react";
import type { z } from "zod";
import type { DirectoryView } from "../engine/directory-schema.js";
import type { MonitorPanelRuntime } from "../engine/public-monitors.js";
import { PANEL_INTERVALS, RETENTION_MINUTES, SaveMonitorPanel, type MonitorPanel, type MonitorPanelChange, type MonitorPanelRun, type MonitorSession } from "../shared/monitoring.js";
import type { HostKeyPrompt } from "../shared/trust.js";
import { HostKeyDialog } from "./HostKeyDialog.js";
import { MonitorMetrics, useMonitorPoll, useMonitorVisibility } from "./MonitorSidebar.js";

const historyLabel = { 15: "15 分钟", 60: "1 小时", 360: "6 小时", 1440: "24 小时" };
const revision = (panel: MonitorPanel) => ({ id: panel.id, expectedRevision: panel.revision });
type Directory = z.infer<typeof DirectoryView>;

function Editor({ previous, directory, error, busy, close, save }: { previous?: MonitorPanel; directory?: Directory | undefined; error: string; busy: boolean; close(): void; save(input: SaveMonitorPanel): void }) {
  const form = useId();
  const [chosen, select] = useState(previous?.hostIds ?? []);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [onlyChosen, setOnlyChosen] = useState(false);
  const [validation, setValidation] = useState("");
  const matching = useCapability<Directory>("ssh.hosts.directory", { query, ...(group && { groupId: group }) });
  const available = (matching.data?.hosts ?? []).filter(({ hostId }) => !onlyChosen || chosen.includes(hostId));
  const name = (id: string) => directory?.hosts.find(({ hostId }) => hostId === id)?.name ?? "已移除的主机";
  function reorder(index: number, offset: number) {
    const next = [...chosen];
    [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
    select(next);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = SaveMonitorPanel.safeParse({
      name: data.get("name"),
      note: data.get("note"),
      hostIds: chosen,
      interval: Number(data.get("interval")),
      retention: Number(data.get("retention")),
      ...(previous && { previous: revision(previous) }),
    });
    if (!parsed.success) {
      setValidation("请填写面板名称并选择 1 至 12 台主机。");
      return;
    }
    setValidation("");
    save(parsed.data);
  }
  return (
    <Dialog
      open
      title={previous ? "编辑监控面板" : "新建监控面板"}
      error={validation || error}
      onClose={close}
      actions={
        <>
          <Button disabled={busy} onClick={close}>
            取消
          </Button>
          <Button variant="primary" loading={busy} type="submit" form={form}>
            保存面板
          </Button>
        </>
      }
    >
      <form id={form} className="hu-stack" onSubmit={submit}>
        <label className="hu-stack">
          面板名称
          <input className="hu-input" name="name" required maxLength={80} defaultValue={previous?.name} />
        </label>
        <label className="hu-stack">
          备注
          <input className="hu-input" name="note" maxLength={240} defaultValue={previous?.note} />
        </label>
        <div className="ssh-workspace-controls">
          <label>
            采样周期{" "}
            <select name="interval" defaultValue={previous?.interval ?? 5}>
              {PANEL_INTERVALS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} 秒
                </option>
              ))}
            </select>
          </label>
          <label>
            保留历史{" "}
            <select name="retention" defaultValue={previous?.retention ?? 15}>
              {RETENTION_MINUTES.map((value) => (
                <option key={value} value={value}>
                  {historyLabel[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="hu-stack">
          <legend>选择主机</legend>
          <div className="ssh-workspace-controls">
            <label>
              搜索主机 <input className="hu-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label>
              主机分组{" "}
              <select value={group} onChange={(event) => setGroup(event.target.value)}>
                <option value="">全部分组</option>
                {directory?.groups.map((entry) => (
                  <option key={entry.groupId} value={entry.groupId}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="row">
              <input type="checkbox" checked={onlyChosen} onChange={(event) => setOnlyChosen(event.target.checked)} />
              仅已选
            </label>
          </div>
          {matching.error && <p role="alert">{matching.error.message}</p>}
          {available.map((host) => (
            <label key={host.hostId} className="row">
              <input
                type="checkbox"
                checked={chosen.includes(host.hostId)}
                disabled={chosen.length >= 12 && !chosen.includes(host.hostId)}
                onChange={(event) => select(event.target.checked ? [...chosen, host.hostId] : chosen.filter((id) => id !== host.hostId))}
              />
              {host.name} · {host.user}@{host.host}
            </label>
          ))}
        </fieldset>
        {chosen.length > 0 && (
          <fieldset className="hu-stack">
            <legend>显示顺序</legend>
            <ol className="ssh-workspace-selected">
              {chosen.map((id, index) => (
                <li key={id}>
                  <div className="ssh-workspace-controls">
                    <span>{name(id)}</span>
                    <Button disabled={index === 0} onClick={() => reorder(index, -1)} aria-label={`上移 ${name(id)}`}>
                      上移
                    </Button>
                    <Button disabled={index === chosen.length - 1} onClick={() => reorder(index, 1)} aria-label={`下移 ${name(id)}`}>
                      下移
                    </Button>
                    <Button onClick={() => select(chosen.filter((entry) => entry !== id))} aria-label={`从面板移除 ${name(id)}`}>
                      移除
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </fieldset>
        )}
      </form>
    </Dialog>
  );
}

type Action = "start" | "stop" | "pause" | "continue";
export function MonitorDashboard({ directory, onBack, onReview }: { directory?: Directory | undefined; onBack(): void; onReview(prompt: HostKeyPrompt): void }) {
  const engine = useEngine();
  const visible = useMonitorVisibility();
  const panels = useCapability<MonitorPanel[]>("ssh.monitor.panels.list");
  const subscriptions = useCapability<MonitorSession[]>("ssh.monitor.session.list", {}, { enabled: visible });
  const externalPanels = useCapability<z.infer<typeof MonitorPanelRuntime>[]>("ssh.monitor.panels.external.list", {}, { enabled: visible });
  const [selected, select] = useState("");
  const current = panels.data?.find(({ id }) => id === selected) ?? panels.data?.[0];
  const runs = useCapability<MonitorPanelRun | null>("ssh.monitor.panels.run", { id: current?.id ?? "" }, { enabled: Boolean(current && visible) });
  const run = runs.data?.revision === current?.revision ? runs.data : null;
  const [edit, setEdit] = useState<MonitorPanel | "new">();
  const [remove, setRemove] = useState<MonitorPanel>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [trust, setTrust] = useState("");
  const pending = run?.hosts.find(({ hostId }) => hostId === trust);
  const refresh = runs.refetch;
  const hostName = (id: string) => directory?.hosts.find(({ hostId }) => id === hostId)?.name ?? "已移除的主机";
  useMonitorPoll(Boolean(visible && current && run && run.state !== "stopped"), refresh);
  useEngineEvents((event) => {
    if (visible && event.type === "entity.changed" && "kind" in event.payload && event.payload.kind === "ssh-monitor-panel") void panels.refetch();
    if (visible && event.type === "entity.changed" && "kind" in event.payload && event.payload.kind === "ssh-external-monitor") {
      void subscriptions.refetch();
      void externalPanels.refetch();
    }
  });
  async function call<T>(name: string, input: object, done?: (value: T) => void) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await engine.call<T>(name, input, { write: true });
      await Promise.all([panels.refetch(), refresh(), subscriptions.refetch(), externalPanels.refetch()]);
      done?.(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "监控操作失败");
    } finally {
      setBusy(false);
    }
  }
  function command(action: Action | "retry", hostId?: string) {
    if (!current) return;
    const request: z.infer<typeof MonitorPanelChange> = action === "retry" ? { ...revision(current), action, hostId: hostId! } : { ...revision(current), action };
    void call("ssh.monitor.panels.change", request);
  }
  return (
    <section className="hu-stack" data-testid="ssh-monitor-dashboard" aria-label="SSH 监控">
      <PageHead title="监控" />
      {!!subscriptions.data?.length && (
        <section className="hu-card-alt">
          <h2>外部工具监控订阅</h2>
          <ul>
            {subscriptions.data.map(({ id, host, interval }) => (
              <li key={id}>
                <div className="row">
                  <span className="hu-flex-fill">
                    {hostName(host.hostId)} · {interval} 秒
                  </span>
                  <Button disabled={busy} aria-label={`关闭监控订阅 ${id}`} onClick={() => void call("ssh.monitor.session.change", { id, action: "close" })}>
                    关闭监控订阅
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!externalPanels.data?.length && (
        <section className="hu-card-alt">
          <h2>外部工具监控面板</h2>
          <ul>
            {externalPanels.data.map(({ id, expectedRevision, runId, name, state }) => (
              <li key={runId}>
                <div className="row">
                  <span className="hu-flex-fill">{name}</span>
                  <Button disabled={busy || state === "stopped"} aria-label={`停止监控面板 ${name} ${runId}`} onClick={() => void call("ssh.monitor.panels.change", { id, expectedRevision, runId, action: "stop" })}>
                    停止监控面板
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="ssh-workspace-controls">
        <Button onClick={onBack}>返回 SSH</Button>
        <Button
          variant="primary"
          disabled={!directory?.hosts.length}
          onClick={() => {
            setError("");
            setEdit("new");
          }}
        >
          新建面板
        </Button>
        {panels.data?.map((panel) => (
          <Button
            key={panel.id}
            aria-pressed={current?.id === panel.id}
            onClick={() => {
              select(panel.id);
              setTrust("");
            }}
          >
            {panel.name}
          </Button>
        ))}
      </div>
      {(panels.error || runs.error || (error && !edit && !remove)) && <p role="alert">{panels.error?.message ?? runs.error?.message ?? error}</p>}
      {panels.data?.length === 0 && <EmptyState title="尚未保存监控面板" />}
      {current && (
        <section className="hu-stack" aria-label={current.name}>
          <h2>{current.name}</h2>
          {current.note && <p>{current.note}</p>}
          <p>
            采样周期 {current.interval} 秒 · 历史 {historyLabel[current.retention]}
          </p>
          <div className="ssh-workspace-controls">
            {(!run || run.state === "stopped") && (
              <Button variant="primary" disabled={busy} onClick={() => command("start")}>
                开始监控
              </Button>
            )}
            {run?.state === "running" && (
              <Button disabled={busy} onClick={() => command("pause")}>
                暂停监控
              </Button>
            )}
            {run?.state === "paused" && (
              <Button disabled={busy} onClick={() => command("continue")}>
                继续监控
              </Button>
            )}
            {run && run.state !== "stopped" && (
              <Button disabled={busy} onClick={() => command("stop")}>
                停止监控
              </Button>
            )}
            <Button onClick={() => setExpanded(!expanded)}>{expanded ? "简洁视图" : "详细视图"}</Button>
            <Button
              onClick={() => {
                setError("");
                setEdit(current);
              }}
            >
              编辑面板
            </Button>
            <Button
              onClick={() => {
                setError("");
                setRemove(current);
              }}
            >
              删除面板
            </Button>
          </div>
          <ul className="ssh-transfer-list">
            {current.hostIds.map((hostId) => {
              const reading = run?.hosts.find((host) => host.hostId === hostId);
              return (
                <li key={hostId} data-testid="ssh-monitor-host">
                  <h3>{hostName(hostId)}</h3>
                  {reading ? <MonitorMetrics host={reading} details={expanded} /> : <p role="status">未开始</p>}
                  {reading?.prompt && <Button onClick={() => setTrust(hostId)}>核对主机指纹</Button>}
                  {run?.state === "running" && reading && ["disconnected", "failed", "denied", "unsupported", "missing"].includes(reading.state) && (
                    <Button disabled={busy} onClick={() => command("retry", hostId)}>
                      重试此主机
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {edit && (
        <Editor
          {...(edit !== "new" && { previous: edit })}
          directory={directory}
          busy={busy}
          error={error}
          close={() => {
            if (!busy) setEdit(undefined);
          }}
          save={(input) =>
            void call<MonitorPanel>("ssh.monitor.panels.save", input, (panel) => {
              select(panel.id);
              setEdit(undefined);
            })
          }
        />
      )}
      {remove && (
        <Dialog
          open
          title="删除监控面板"
          error={error}
          onClose={() => {
            if (!busy) setRemove(undefined);
          }}
          actions={
            <>
              <Button disabled={busy} onClick={() => setRemove(undefined)}>
                取消
              </Button>
              <Button
                variant="danger"
                loading={busy}
                onClick={() =>
                  void call("ssh.monitor.panels.delete", revision(remove), () => {
                    select("");
                    setRemove(undefined);
                  })
                }
              >
                删除
              </Button>
            </>
          }
        >
          <p>删除「{remove.name}」将释放其监控订阅。</p>
        </Dialog>
      )}
      {pending?.prompt && !edit && !remove && (
        <HostKeyDialog key={pending.prompt.promptId} prompt={pending.prompt} changed={pending.state !== "trust"} onClose={() => setTrust("")} onRefresh={refresh} onReview={() => pending.prompt && onReview(pending.prompt)} />
      )}
    </section>
  );
}
