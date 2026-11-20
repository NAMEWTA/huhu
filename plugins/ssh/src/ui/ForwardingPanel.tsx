import { Button, Dialog, EmptyState, PageHead } from "@huhu/ui";
import { useCapability, useEngine, useEngineEvents } from "@huhu/workbench";
import { useEffect, useId, useState, type FormEvent } from "react";
import { FORWARD_BIND, ForwardMode, SaveForward, forwardLabels, type ForwardRule, type ForwardRun } from "../shared/forwarding.js";
import type { HostKeyPrompt } from "../shared/trust.js";
import { HostKeyDialog, hostEndpoint } from "./HostKeyDialog.js";
import type { Host } from "./host-record.js";

const RULES = "ssh.forwarding.rules.list";
const RUNS = "ssh.forwarding.runs.list";
const phases: Record<ForwardRun["state"], string> = {
  starting: "正在启动",
  waiting: "等待核对主机指纹",
  running: "监听中",
  stopping: "正在停止",
  "stop-failed": "尚未确认端口释放",
  failed: "启动失败",
  interrupted: "连接中断，待恢复",
  stopped: "已停止",
};

function RunningState({ run }: { run?: ForwardRun | undefined }) {
  return (
    <>
      <p role="status">{run?.state === "running" && run.listener?.device === "remote" ? "服务端已确认" : run ? phases[run.state] : "已配置"}</p>
      {run?.listener?.device === "local" && (
        <p>
          实际绑定 <code>{hostEndpoint(run.listener)}</code>
        </p>
      )}
      {run?.listener?.device === "remote" && (
        <>
          <p>
            已确认的远端请求 <code>{hostEndpoint({ host: run.listener.requestedHost, port: run.listener.requestedPort })}</code>
          </p>
          <p>实际绑定地址由服务端策略（如 GatewayPorts）决定，客户端无法核验。</p>
        </>
      )}
      {run?.connection && (
        <p>
          {run.connection.kind === "borrowed" ? "借用会话连接" : "专用隧道连接"} · {run.connection.holders} 条规则持有
        </p>
      )}
      {run && (run.listener || run.accepted > 0) && (
        <p>
          活动 {run.active} · 累计 {run.accepted} · 上传 {run.uploaded} B · 下载 {run.downloaded} B
        </p>
      )}
      {run?.message && <p role="alert">{run.message}</p>}
      {run?.lastError && run.state === "running" && <p>{run.lastError}</p>}
    </>
  );
}

function RuleEditor({ previous, hosts, active, busy, error, cancel, save }: { previous?: ForwardRule; hosts: Host[]; active: boolean; busy: boolean; error: string; cancel(): void; save(draft: SaveForward): void }) {
  const [mode, setMode] = useState<ForwardMode>(previous?.mode ?? "local");
  const [validation, setValidation] = useState("");
  const id = useId();
  const fixed = mode === "local" || mode === "remote";
  const target = previous && "target" in previous ? previous.target : undefined;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = SaveForward.safeParse({
      name: data.get("name"),
      hostId: data.get("hostId"),
      mode,
      listenPort: Number(data.get("listenPort")),
      resume: data.has("resume"),
      ...(fixed && { target: { host: String(data.get("targetHost")).trim(), port: Number(data.get("targetPort")) } }),
      ...(previous && { previous: { id: previous.id, expectedRevision: previous.revision }, rebind: data.has("rebind") }),
    });
    if (!parsed.success) {
      setValidation("请核对名称、主机、监听端口和目的地址。目标主机可填写主机名或 IP。");
      return;
    }
    setValidation("");
    save(parsed.data);
  }
  return (
    <Dialog
      open
      title={previous ? "编辑转发规则" : "新建转发规则"}
      onClose={cancel}
      error={validation || error}
      actions={
        <>
          <Button disabled={busy} onClick={cancel}>
            取消
          </Button>
          <Button variant="primary" loading={busy} type="submit" form={id}>
            保存规则
          </Button>
        </>
      }
    >
      <form id={id} className="hu-stack" onSubmit={submit}>
        <label className="hu-stack">
          规则名称
          <input className="hu-input" name="name" defaultValue={previous?.name} maxLength={80} required />
        </label>
        <label className="hu-stack">
          SSH 主机
          <select className="hu-input" name="hostId" defaultValue={previous?.hostId ?? hosts[0]?.id} required>
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.name} · {hostEndpoint(host)}
              </option>
            ))}
          </select>
        </label>
        <label className="hu-stack">
          转发模式
          <select
            className="hu-input"
            value={mode}
            onChange={(event) => {
              setValidation("");
              setMode(ForwardMode.parse(event.target.value));
            }}
          >
            {ForwardMode.options.map((key) => (
              <option key={key} value={key}>
                {forwardLabels[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="hu-stack">
          {mode === "remote" ? "远端" : "本机"} {FORWARD_BIND} 监听端口
          <input className="hu-input" name="listenPort" type="number" min={1024} max={65535} defaultValue={previous?.listenPort ?? 43190} required />
        </label>
        {fixed ? (
          <fieldset className="hu-stack">
            <legend>{mode === "remote" ? "本机目的地" : "远端目的地"}</legend>
            <label className="hu-stack">
              目标主机
              <input className="hu-input" name="targetHost" defaultValue={target?.host ?? "127.0.0.1"} required />
            </label>
            <label className="hu-stack">
              目标端口
              <input className="hu-input" name="targetPort" type="number" min={1} max={65535} defaultValue={target?.port} required />
            </label>
          </fieldset>
        ) : (
          <p>由客户端逐连接选择目的地，流量通过所选 SSH 主机出站。</p>
        )}
        <p className="muted">{mode === "remote" ? "此模式使用 SSH 远端监听，无法配置 Shell 中继。" : "出口使用 SSH TCP 通道。当前后端未提供 Shell 中继。"}</p>
        <label className="row">
          <input name="resume" type="checkbox" defaultChecked={previous?.resume} />
          断线后提供恢复操作
        </label>
        {previous && (
          <label className="row">
            <input name="rebind" type="checkbox" />
            重新绑定所选主机及路由
          </label>
        )}
        {active && <p>保存将先停止旧实例并回收监听。</p>}
      </form>
    </Dialog>
  );
}

export function ForwardingPanel({ hosts, onBack, onReview }: { hosts: Host[]; onBack(): void; onReview(prompt: HostKeyPrompt): void }) {
  const engine = useEngine();
  const rules = useCapability<ForwardRule[]>(RULES, {});
  const runs = useCapability<ForwardRun[]>(RUNS, {});
  const [editor, setEditor] = useState<ForwardRule | "new">();
  const [deleting, setDeleting] = useState<ForwardRule>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewId, setReviewId] = useState("");
  const selected = runs.data?.find(({ id }) => id === reviewId);
  const watching = runs.data?.some(({ state }) => state === "running");
  const refreshRuns = runs.refetch;
  const active = (id: string) => runs.data?.some((run) => run.ruleId === id && ["running", "starting", "waiting", "stopping", "stop-failed"].includes(run.state)) ?? false;

  useEngineEvents((event) => {
    if (event.type !== "entity.changed" || !("kind" in event.payload)) return;
    if (event.payload.kind === "ssh-forward") void rules.refetch();
    if (event.payload.kind === "ssh-forward" || event.payload.kind === "ssh-forward-run") void refreshRuns();
  });
  useEffect(() => {
    if (!watching) return;
    const timer = setInterval(() => void refreshRuns(), 1000);
    return () => clearInterval(timer);
  }, [watching, refreshRuns]);
  async function change(name: string, input: object) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await engine.call(name, input, { write: true });
      await Promise.all([rules.refetch(), refreshRuns()]);
      setEditor(undefined);
      setDeleting(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hu-stack" aria-label="端口转发" data-testid="ssh-forwarding">
      <PageHead title="端口转发" />
      <div className="ssh-workspace-controls">
        <Button onClick={onBack}>返回 SSH</Button>
        <Button
          variant="primary"
          disabled={!hosts.length}
          onClick={() => {
            setError("");
            setEditor("new");
          }}
        >
          新建规则
        </Button>
      </div>
      {rules.error && <p role="alert">{rules.error.message}</p>}
      {runs.error && <p role="alert">{runs.error.message}</p>}
      {error && !editor && !deleting && <p role="alert">{error}</p>}
      {rules.data?.length === 0 && <EmptyState title="尚未保存转发规则" />}
      <ul className="ssh-transfer-list">
        {rules.data?.map((rule) => {
          const run = runs.data?.find(({ ruleId, revision }) => ruleId === rule.id && revision === rule.revision);
          const running = active(rule.id);
          const action = running ? "stop" : run?.state === "interrupted" ? "resume" : "start";
          const label = action === "stop" ? (run?.state === "stop-failed" ? "重查释放" : "停止") : action === "resume" ? "恢复" : run?.state === "failed" ? "重试" : "启动";
          return (
            <li key={rule.id} data-testid="ssh-forward-rule">
              <strong>{rule.name}</strong>
              <p>
                {hosts.find(({ id }) => id === rule.hostId)?.name ?? rule.hostId} · {forwardLabels[rule.mode]}
              </p>
              <p>
                {rule.mode === "remote" ? "远端申请监听" : "本机监听"}{" "}
                <code>
                  {FORWARD_BIND}:{rule.listenPort}
                </code>{" "}
                → {"target" in rule ? `${rule.mode === "remote" ? "本机" : "远端"} ${hostEndpoint(rule.target)}` : "SSH 出口 · 动态目的地"}
              </p>
              <RunningState run={run} />
              <div className="ssh-workspace-controls">
                <Button disabled={busy || run?.state === "stopping"} onClick={() => void change(`ssh.forwarding.runs.${action}`, { id: rule.id, expectedRevision: rule.revision })}>
                  {label}
                </Button>
                {run?.prompt && <Button onClick={() => setReviewId(run.id)}>核对主机指纹</Button>}
                <Button
                  onClick={() => {
                    setError("");
                    setEditor(rule);
                  }}
                >
                  编辑
                </Button>
                <Button
                  onClick={() => {
                    setError("");
                    setDeleting(rule);
                  }}
                >
                  删除
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {editor && (
        <RuleEditor
          {...(editor !== "new" && { previous: editor })}
          hosts={hosts}
          active={editor !== "new" && active(editor.id)}
          busy={busy}
          error={error}
          cancel={() => {
            if (!busy) setEditor(undefined);
          }}
          save={(draft) => void change("ssh.forwarding.rules.save", draft)}
        />
      )}
      {deleting && (
        <Dialog
          open
          title="删除转发规则"
          error={error}
          onClose={() => {
            if (!busy) setDeleting(undefined);
          }}
          actions={
            <>
              <Button disabled={busy} onClick={() => setDeleting(undefined)}>
                取消
              </Button>
              <Button variant="danger" loading={busy} onClick={() => void change("ssh.forwarding.rules.delete", { id: deleting.id, expectedRevision: deleting.revision })}>
                删除规则
              </Button>
            </>
          }
        >
          <p>
            {deleting.name}
            {active(deleting.id) && "。将先停止运行并回收监听。"}
          </p>
        </Dialog>
      )}
      {selected?.prompt && !editor && !deleting && (
        <HostKeyDialog key={selected.prompt.promptId} prompt={selected.prompt} changed={selected.state !== "waiting"} onClose={() => setReviewId("")} onRefresh={refreshRuns} onReview={() => selected.prompt && onReview(selected.prompt)} />
      )}
    </section>
  );
}
