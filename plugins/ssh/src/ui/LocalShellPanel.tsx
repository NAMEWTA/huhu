import { Button, EmptyState, PageHead } from "@huhu/ui";
import { useCapability, useEngine, useEngineEvents, useQueryClient } from "@huhu/workbench";
import { useState, type FormEvent } from "react";
import type { LocalEnvironment, LocalSession, OpenLocalShell } from "../shared/local-shell.js";
import { SshTerminal } from "./SshTerminal.js";

export function LocalShellPanel({ onBack }: { onBack(): void }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const environments = useCapability<LocalEnvironment[]>("ssh.local.environments", {});
  const sessions = useCapability<LocalSession[]>("ssh.local.list", {});
  const [environment, setEnvironment] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const current = sessions.data?.find((session) => session.id === selected);
  useEngineEvents((event) => {
    if (event.type === "entity.changed" && "kind" in event.payload && event.payload.kind === "ssh-local-shell") {
      void qc.invalidateQueries({ predicate: ({ queryKey }) => queryKey[0] === engine.vaultId && queryKey[1] === "ssh.local.list" });
    }
  });
  async function open(input: OpenLocalShell) {
    if (busy) return;
    setBusy(true);
    setFeedback("");
    try {
      const session = await engine.call<LocalSession>("ssh.local.open", input);
      setSelected(session.id);
      await sessions.refetch();
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "无法启动本地 Shell。");
    } finally {
      setBusy(false);
    }
  }
  async function close(id: string) {
    if (busy) return;
    setBusy(true);
    setFeedback("");
    try {
      await engine.call("ssh.local.close", { id });
      await sessions.refetch();
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "无法结束本地 Shell。");
    } finally {
      setBusy(false);
    }
  }
  function launch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (environment) void open({ action: "launch", environmentId: environment });
  }
  return (
    <section className="hu-view-content">
      <PageHead title="本地终端" description="在此设备选择已安装的 Shell 或 WSL 发行版。" actions={<Button onClick={onBack}>返回主机</Button>} />
      <form className="ssh-workspace-controls" onSubmit={launch}>
        <label className="row">
          启动环境
          <select required value={environment} onChange={(event) => setEnvironment(event.currentTarget.value)}>
            <option value="">选择环境</option>
            {environments.data?.map(({ id, kind, name }) => (
              <option value={id} key={id}>
                {kind === "wsl" ? "WSL" : "本机 Shell"} · {name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="primary" loading={busy} disabled={!environments.data?.length}>
          打开终端
        </Button>
        <Button type="button" disabled={busy} onClick={() => void environments.refetch()}>
          刷新环境
        </Button>
      </form>
      {(feedback || environments.error || sessions.error) && <p role="alert">{feedback || environments.error?.message || sessions.error?.message}</p>}
      {environments.data?.length === 0 && <EmptyState title="此设备没有发现可用的 Shell 或 WSL 发行版" />}
      <div className="ssh-workspace-tabstrip" aria-label="本地终端">
        {sessions.data?.map(({ id, environment, state }) => (
          <button type="button" aria-pressed={selected === id} key={id} onClick={() => setSelected(id)}>
            {environment.name} · {state === "running" ? "运行中" : "已结束"}
          </button>
        ))}
      </div>
      {current && (
        <article className="hu-card-alt">
          <div className="ssh-workspace-controls">
            <strong>
              {current.environment.kind === "wsl" ? "WSL" : "本机 Shell"} · {current.environment.name}
            </strong>
            {current.state === "running" ? (
              <Button disabled={busy} onClick={() => void close(current.id)}>
                结束终端
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => void open({ action: "restart", sessionId: current.id })}>
                用原环境重连
              </Button>
            )}
          </div>
          <div className="ssh-workspace-terminal">
            <SshTerminal key={current.id} sessionId={current.id} baseUrl={engine.endpoint.baseUrl} token={engine.endpoint.token} ariaLabel={current.environment.name} />
          </div>
        </article>
      )}
    </section>
  );
}
