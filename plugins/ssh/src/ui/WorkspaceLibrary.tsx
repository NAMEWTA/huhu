import { Button, Dialog, PageHead } from "@huhu/ui";
import { useCapability, useEngine } from "@huhu/workbench";
import { useId, useState } from "react";
import { layoutProblem, MAX_WORKSPACE_PANES, paneCount, splitTree, type SplitTree, type WorkspaceLayout as Layout, type WorkspacePane, type WorkspaceTemplate } from "../shared/workspace.js";
import { LAYOUT_LABELS, WorkspaceLayout } from "./WorkspaceLayout.js";

export interface WorkspaceHost {
  hostId: string;
  name: string;
  user: string;
  host: string;
  port: number;
}

interface Editor {
  previous?: WorkspaceTemplate;
  name: string;
  panes: WorkspacePane[];
  layout: Layout;
  rebindHostIds: string[];
}

function SplitEditor({ node, first, change }: { node: SplitTree; first: number; change: (node: SplitTree) => void }) {
  if (node.kind === "pane") return <li>分栏 {first}</li>;
  const middle = first + paneCount(node.first);
  const right = node.second;
  const left = node.first;
  return (
    <li>
      <div className="ssh-workspace-controls">
        <label>
          从分栏 {first} 开始的方向
          <select value={node.axis} onChange={(event) => change({ ...node, axis: event.target.value === "row" ? "row" : "column" })}>
            <option value="row">左右</option>
            <option value="column">上下</option>
          </select>
        </label>
        <label>
          首区比例（%）
          <input type="number" min={10} max={90} value={node.firstPercent} onChange={(event) => change({ ...node, firstPercent: event.target.valueAsNumber || 10 })} />
        </label>
        {left.kind === "split" && <Button onClick={() => change({ ...left, second: { ...node, first: left.second } })}>将前段拆为两组</Button>}
        {right.kind === "split" && <Button onClick={() => change({ ...right, first: { ...node, second: right.first } })}>将后段拆为两组</Button>}
      </div>
      <ul>
        <SplitEditor node={left} first={first} change={(value) => change({ ...node, first: value })} />
        <SplitEditor node={right} first={middle} change={(value) => change({ ...node, second: value })} />
      </ul>
    </li>
  );
}

function Preview({ panes, layout, name }: { panes: WorkspacePane[]; layout: Layout; name: (hostId: string) => string }) {
  return (
    <section aria-label="布局预览" className="ssh-workspace-preview">
      <WorkspaceLayout
        layout={layout}
        labels={panes.map(({ hostId }) => name(hostId))}
        pane={(index) => {
          const pane = panes[index];
          return pane ? (
            <div className="ssh-workspace-preview-pane" key={pane.hostId}>
              {name(pane.hostId)}
            </div>
          ) : null;
        }}
      />
    </section>
  );
}

export function WorkspaceLibrary({ onHosts }: { onHosts: () => void }) {
  const engine = useEngine();
  const directory = useCapability<{ hosts: WorkspaceHost[] }>("ssh.hosts.directory", {});
  const templates = useCapability<WorkspaceTemplate[]>("ssh.workspace.templates.list", {});
  const [selected, select] = useState("");
  const [draft, setDraft] = useState<Editor>();
  const [deleting, setDeleting] = useState<WorkspaceTemplate>();
  const [hostToAdd, chooseHost] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const formId = useId();
  const current = templates.data?.find(({ id }) => id === selected);
  const hosts = directory.data?.hosts ?? [];
  const name = (hostId: string) => hosts.find((host) => host.hostId === hostId)?.name ?? `已移除的主机（${hostId}）`;

  function edit(previous?: WorkspaceTemplate) {
    setError(undefined);
    chooseHost("");
    const panes = previous?.panes.map(({ hostId, loginCommand }) => ({ hostId, ...(loginCommand === undefined ? {} : { loginCommand }) })) ?? [];
    setDraft({ ...(previous ? { previous } : {}), name: previous?.name ?? "", panes, layout: previous?.layout ?? { kind: "two" }, rebindHostIds: [] });
  }

  function changePanes(panes: WorkspacePane[]) {
    if (!draft) return;
    const layout = draft.layout.kind === "custom" && draft.panes.length !== panes.length ? { kind: "custom" as const, tree: splitTree(panes.length) } : draft.layout;
    setDraft({ ...draft, panes, layout });
  }

  function move(panes: WorkspacePane[], index: number, offset: number) {
    const next = [...panes];
    [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
    changePanes(next);
  }

  async function save() {
    if (!draft || busy) return;
    const panes = draft.panes.map(({ hostId, loginCommand }) => ({ hostId, ...(loginCommand?.trim() ? { loginCommand: loginCommand.trim() } : {}) }));
    const problem = layoutProblem(panes, draft.layout);
    if (problem) return setError(problem);
    setBusy(true);
    setError(undefined);
    try {
      const template = await engine.call<WorkspaceTemplate>(
        "ssh.workspace.templates.save",
        {
          name: draft.name,
          panes,
          layout: draft.layout,
          rebindHostIds: draft.rebindHostIds,
          ...(draft.previous ? { previous: { id: draft.previous.id, expectedRevision: draft.previous.revision } } : {}),
        },
        { write: true },
      );
      await templates.refetch();
      select(template.id);
      setDraft(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await engine.call("ssh.workspace.templates.delete", { id: deleting.id, expectedRevision: deleting.revision }, { write: true });
      await templates.refetch();
      select("");
      setDeleting(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hu-module-layout hu-execution-module" data-testid="ssh-workspace-library">
      <aside className="hu-resource-pane" aria-label="工作区模板">
        <div className="hu-resource-head">
          <Button variant="ghost" onClick={onHosts}>
            主机
          </Button>
        </div>
        <div className="hu-resource-list">
          {templates.data?.map(({ id, name: title }) => (
            <button className={`ssh-resource-row${id === selected ? " active" : ""}`} type="button" key={id} aria-current={id === selected} onClick={() => select(id)}>
              {title}
            </button>
          ))}
        </div>
      </aside>
      <main className="hu-view-content">
        <PageHead title={current?.name ?? "工作区模板"} actions={<Button onClick={() => edit()}>新建模板</Button>} />
        <div className="hu-scroll ssh-pad">
          {(templates.error || directory.error) && <p role="alert">{(templates.error ?? directory.error)?.message}</p>}
          {!current && templates.data?.length === 0 && <p className="muted">暂无工作区模板</p>}
          {current && (
            <>
              <div className="ssh-workspace-controls">
                <Button onClick={() => edit(current)}>编辑模板</Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setError(undefined);
                    setDeleting(current);
                  }}
                >
                  删除模板
                </Button>
              </div>
              <p>{LAYOUT_LABELS[current.layout.kind]}</p>
              <ol aria-label="主机顺序">
                {current.panes.map(({ hostId }) => (
                  <li key={hostId}>{name(hostId)}</li>
                ))}
              </ol>
              <Preview {...current} name={name} />
            </>
          )}
        </div>
      </main>
      {draft && (
        <Dialog
          open
          wide
          title={draft.previous ? "编辑工作区模板" : "新建工作区模板"}
          error={error}
          onClose={() => {
            if (!busy) setDraft(undefined);
          }}
          actions={
            <>
              <Button onClick={() => setDraft(undefined)} disabled={busy}>
                取消
              </Button>
              <Button variant="primary" type="submit" form={formId} loading={busy}>
                保存模板
              </Button>
            </>
          }
        >
          <form
            id={formId}
            aria-label="工作区模板配置"
            className="ssh-workspace-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              模板名称 <input value={draft.name} required maxLength={100} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <div className="ssh-workspace-controls">
              <label>
                从主机目录选择
                <select value={hostToAdd} onChange={(event) => chooseHost(event.target.value)}>
                  <option value="">选择主机</option>
                  {hosts.map(({ hostId, name: title, host, user, port }) => (
                    <option key={hostId} value={hostId} disabled={draft.panes.some((pane) => pane.hostId === hostId)}>
                      {title}（{user}@{host}:{port}）
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={!hostToAdd || draft.panes.length >= MAX_WORKSPACE_PANES}
                onClick={() => {
                  changePanes([...draft.panes, { hostId: hostToAdd }]);
                  chooseHost("");
                }}
              >
                加入主机
              </Button>
              <span>
                {draft.panes.length} / {MAX_WORKSPACE_PANES}
              </span>
            </div>
            <ol aria-label="主机顺序" className="ssh-workspace-selected">
              {draft.panes.map((pane, index) => (
                <li key={pane.hostId}>
                  <div className="ssh-workspace-controls">
                    <strong>{name(pane.hostId)}</strong>
                    <button type="button" disabled={index === 0} aria-label={`上移 ${name(pane.hostId)}`} onClick={() => move(draft.panes, index, -1)}>
                      上移
                    </button>
                    <button type="button" disabled={index === draft.panes.length - 1} aria-label={`下移 ${name(pane.hostId)}`} onClick={() => move(draft.panes, index, 1)}>
                      下移
                    </button>
                    <button type="button" aria-label={`移除 ${name(pane.hostId)}`} onClick={() => changePanes(draft.panes.filter((_, i) => i !== index))}>
                      移除
                    </button>
                  </div>
                  <label>
                    登录命令（可选）
                    <input maxLength={2048} value={pane.loginCommand ?? ""} onChange={(event) => changePanes(draft.panes.map((row, i) => (i === index ? { ...row, loginCommand: event.target.value } : row)))} />
                  </label>
                  {draft.previous?.panes.some(({ hostId }) => hostId === pane.hostId) && hosts.some(({ hostId }) => hostId === pane.hostId) && (
                    <label className="ssh-workspace-rebind">
                      <input
                        type="checkbox"
                        checked={draft.rebindHostIds.includes(pane.hostId)}
                        onChange={(event) => setDraft({ ...draft, rebindHostIds: event.target.checked ? [...draft.rebindHostIds, pane.hostId] : draft.rebindHostIds.filter((id) => id !== pane.hostId) })}
                      />
                      重新绑定当前连接目标
                    </label>
                  )}
                </li>
              ))}
            </ol>
            <div className="ssh-workspace-field">
              <label htmlFor={`${formId}-layout`}>布局</label>
              <select
                id={`${formId}-layout`}
                value={draft.layout.kind}
                onChange={(event) => {
                  const kind = event.target.value as Layout["kind"];
                  setDraft({ ...draft, layout: kind === "custom" ? { kind, tree: splitTree(draft.panes.length) } : { kind } });
                }}
              >
                {Object.entries(LAYOUT_LABELS).map(([value, title]) => (
                  <option value={value} key={value}>
                    {title}
                  </option>
                ))}
              </select>
            </div>
            {draft.layout.kind === "custom" && draft.panes.length > 0 && (
              <ul className="ssh-workspace-splits">
                <SplitEditor node={draft.layout.tree} first={1} change={(tree) => setDraft({ ...draft, layout: { kind: "custom", tree } })} />
              </ul>
            )}
            <Preview {...draft} name={name} />
          </form>
        </Dialog>
      )}
      {deleting && (
        <Dialog
          open
          title="删除工作区模板"
          error={error}
          onClose={() => {
            if (!busy) setDeleting(undefined);
          }}
          actions={
            <>
              <Button onClick={() => setDeleting(undefined)} disabled={busy}>
                取消
              </Button>
              <Button variant="danger" onClick={() => void remove()} disabled={busy}>
                确认删除
              </Button>
            </>
          }
        >
          <p>删除「{deleting.name}」？</p>
        </Dialog>
      )}
    </div>
  );
}
