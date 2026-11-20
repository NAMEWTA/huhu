import { Button, Dialog } from "@huhu/ui";
import { useCapability, useEngine } from "@huhu/workbench";
import { useId, useState } from "react";
import { AGENT_CATALOG } from "../shared/catalog.js";
import type { AgentEnvironmentProfile } from "../engine/launch-environment.js";
import type { AgentEnvironmentApproval } from "../engine/interactive-environment.js";

interface EnvironmentPreview {
  environment: AgentEnvironmentApproval;
  cwd: string;
  argv: string[];
  ordinaryNames: string[];
  protectedNames: string[];
}

export function ProtectedLaunchDialog({ spaceId, spaceRevision, onClose, onLaunch }: { spaceId: string; spaceRevision: number; onClose(): void; onLaunch(provider: string, environment: AgentEnvironmentApproval): void }) {
  const engine = useEngine();
  const profiles = useCapability<{ localAvailable: boolean; nativeAvailable: boolean; profiles: AgentEnvironmentProfile[] }>("agent.launch.environments.list", {});
  const [id, setId] = useState("");
  const [preview, setPreview] = useState<EnvironmentPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const selected = profiles.data?.profiles.find((profile) => profile.id === id);
  const configured = selected?.protectedNames.every((name) => selected.states[name] === "configured") ?? false;
  const currentPreview = preview?.environment.id === selected?.id && preview?.environment.revision === selected?.revision ? preview : null;

  async function prepare() {
    if (!selected || busy) return;
    setBusy(true);
    setPreview(null);
    setError(null);
    try {
      const result = await engine.call<EnvironmentPreview>("agent.launch.environments.preview", {
        spaceId,
        spaceRevision,
        provider: selected.provider,
        environment: { id: selected.id, revision: selected.revision },
      });
      setPreview(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "无法核对启动环境");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open title="使用启动环境" onClose={onClose} testId="agent-protected-launch">
      <div>
        <label htmlFor={fieldId}>启动环境</label>
        <select
          id={fieldId}
          value={id}
          disabled={busy}
          onChange={(event) => {
            setId(event.target.value);
            setPreview(null);
            setError(null);
          }}
        >
          <option value="">请选择环境</option>
          {profiles.data?.profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name} · {AGENT_CATALOG.find((entry) => entry.id === profile.provider)?.displayName ?? "终端"}
            </option>
          ))}
        </select>
      </div>
      {profiles.isError ? <p role="alert">{profiles.error.message}</p> : null}
      {profiles.data && !profiles.data.nativeAvailable ? <p role="status">当前桌面未提供 Windows 受保护终端宿主。</p> : null}
      {!configured && selected ? <p role="status">请在智能体设置中配置本机受保护变量。</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {currentPreview ? (
        <dl>
          <dt>工作目录</dt>
          <dd>
            <code>{currentPreview.cwd}</code>
          </dd>
          <dt>程序和参数</dt>
          <dd>
            <ol>
              {currentPreview.argv.map((arg, i) => (
                <li key={i}>
                  <code>{arg}</code>
                </li>
              ))}
            </ol>
          </dd>
          <dt>普通变量</dt>
          <dd>{currentPreview.ordinaryNames.join("、") || "无"}</dd>
          <dt>受保护变量</dt>
          <dd>{currentPreview.protectedNames.join("、") || "无"}</dd>
        </dl>
      ) : null}
      <div className="row">
        <Button onClick={onClose}>取消</Button>
        {currentPreview && selected ? (
          <Button onClick={() => onLaunch(selected.provider, currentPreview.environment)}>确认启动</Button>
        ) : (
          <Button disabled={!selected || !configured || busy || !profiles.data?.nativeAvailable} onClick={() => void prepare()}>
            {busy ? "正在核对…" : "预览启动"}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
