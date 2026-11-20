import { Button, Dialog, EmptyState, PageHead } from "@huhu/ui";
import { useCapability, useEngine, useEngineEvents } from "@huhu/workbench";
import { useId, useState, type FormEvent } from "react";
import { FORWARD_BIND, ForwardMode, SaveForward, forwardLabels, type ForwardRule } from "../shared/forwarding.js";
import { hostEndpoint } from "./HostKeyDialog.js";
import type { Host } from "./host-record.js";

const RULES = "ssh.forwarding.rules.list";

function RuleEditor({ previous, hosts, busy, error, cancel, save }: { previous?: ForwardRule; hosts: Host[]; busy: boolean; error: string; cancel(): void; save(draft: SaveForward): void }) {
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
      </form>
    </Dialog>
  );
}

export function ForwardingPanel({ hosts, onBack }: { hosts: Host[]; onBack(): void }) {
  const engine = useEngine();
  const rules = useCapability<ForwardRule[]>(RULES, {});
  const [editor, setEditor] = useState<ForwardRule | "new">();
  const [deleting, setDeleting] = useState<ForwardRule>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEngineEvents((event) => {
    if (event.type === "entity.changed" && "kind" in event.payload && event.payload.kind === "ssh-forward") void rules.refetch();
  });
  async function change(name: string, input: object) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await engine.call(name, input, { write: true });
      await rules.refetch();
      setEditor(undefined);
      setDeleting(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hu-stack" data-testid="ssh-forwarding">
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
      {rules.data?.length === 0 && <EmptyState title="尚未保存转发规则" />}
      <ul className="ssh-transfer-list">
        {rules.data?.map((rule) => (
          <li key={rule.id} data-testid="ssh-forward-rule">
            <strong>{rule.name}</strong>
            <p>
              {hosts.find(({ id }) => id === rule.hostId)?.name ?? rule.hostId} · {forwardLabels[rule.mode]}
            </p>
            <p>
              {rule.mode === "remote" ? "远端监听" : "本机监听"}{" "}
              <code>
                {FORWARD_BIND}:{rule.listenPort}
              </code>{" "}
              → {"target" in rule ? `${rule.mode === "remote" ? "本机" : "远端"} ${hostEndpoint(rule.target)}` : "SSH 出口 · 动态目的地"}
            </p>
            <p>已配置</p>
            <div className="ssh-workspace-controls">
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
        ))}
      </ul>
      {editor && (
        <RuleEditor
          {...(editor !== "new" && { previous: editor })}
          hosts={hosts}
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
          <p>{deleting.name}</p>
        </Dialog>
      )}
    </main>
  );
}
