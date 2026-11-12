import { Button, Dialog } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import type { ModelOption } from "./LaunchPanel.js";

interface Detected {
  provider: string;
  displayName: string;
  status: string;
  exe: string | null;
  version: string | null;
  checkedAt: string;
  models: ModelOption[];
}
type Prefs = Record<string, { model?: string; effort?: string; fast?: boolean }>;

const STATUS: Record<string, string> = { found: "已找到", "not-installed": "未安装", "not-logged-in": "未登录", unsupported: "版本不受支持", "probe-failed": "检测失败" };

/** 智能体设置（原型 settingsOpen）：本机每个 CLI 的检测状态 / 路径 / 版本、默认模型与推理强度、重新检测，以及 Herdr Core 状态与“重启 Core”。 */
export function AgentSettings({ onClose }: { onClose(): void }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const detected = useCapability<Detected[]>("agent.providers.detect", {});
  const prefs = useCapability<Prefs>("agent.providers.prefs.get", {});
  const core = useCapability<{ state: string; version: string | null; error?: string }>("agent.core.status", {});
  const [busy, setBusy] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refetchAll = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("agent.") });

  async function call(cap: string, input: unknown) {
    setBusy(true);
    setError(null);
    try {
      await engine.call(cap, input, { write: true });
      await refetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title="智能体设置"
      description="当前主机的检测结果与 CLI 启动偏好。"
      onClose={onClose}
      error={error}
      testId="agent-settings"
      wide
      actions={
        <>
          <Button icon={RefreshCw} disabled={busy} data-testid="agent-redetect" onClick={() => void call("agent.providers.detect", { refresh: true })}>
            重新检测
          </Button>
          <Button variant="primary" onClick={onClose}>
            完成
          </Button>
        </>
      }
    >
      <div className="form-body">
        {(detected.data ?? []).map((p) => {
          const pref = prefs.data?.[p.provider] ?? {};
          const model = p.models.find((m) => m.id === pref.model) ?? p.models[0];
          return (
            <section key={p.provider} className="card" data-testid="agent-provider-row" data-provider={p.provider} style={{ padding: "10px 12px", marginBottom: 8 }}>
              <div className="row">
                <strong className="grow">{p.displayName}</strong>
                <span className="small muted">{STATUS[p.status] ?? p.status}</span>
              </div>
              <div className="small muted" title={p.exe ?? ""}>
                {p.exe ?? "—"}
                {p.version ? ` · ${p.version}` : ""}
              </div>
              {p.status === "found" && p.models.length > 0 ? (
                <div className="row" style={{ marginTop: 6 }}>
                  <label className="row">
                    默认模型
                    <select
                      aria-label={`${p.displayName} 默认模型`}
                      value={model?.id ?? ""}
                      disabled={busy}
                      onChange={(e) => void call("agent.providers.prefs.set", { provider: p.provider, model: e.target.value, ...(pref.effort ? { effort: pref.effort } : {}) })}
                    >
                      {p.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(model?.efforts.length ?? 0) > 0 ? (
                    <label className="row">
                      推理强度
                      <select
                        aria-label={`${p.displayName} 推理强度`}
                        value={pref.effort ?? ""}
                        disabled={busy}
                        onChange={(e) => void call("agent.providers.prefs.set", { provider: p.provider, ...(model ? { model: model.id } : {}), effort: e.target.value })}
                      >
                        <option value="">默认</option>
                        {model!.efforts.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
        <section className="card" style={{ padding: "10px 12px" }} data-testid="agent-core-row">
          <div className="row">
            <strong className="grow">Herdr Core</strong>
            <span className="small muted">{core.data?.state === "connected" ? `${core.data.version ?? ""} 已连接` : (core.data?.error ?? "未连接")}</span>
            {confirmRestart ? (
              <>
                <span className="small">运行中的终端会保留。</span>
                <Button variant="primary" disabled={busy} data-testid="agent-core-restart-yes" onClick={() => void call("agent.core.restart", {}).then(() => setConfirmRestart(false))}>
                  确认重启
                </Button>
                <Button onClick={() => setConfirmRestart(false)}>取消</Button>
              </>
            ) : (
              <Button disabled={busy} data-testid="agent-core-restart" onClick={() => setConfirmRestart(true)}>
                重启 Core
              </Button>
            )}
          </div>
        </section>
      </div>
    </Dialog>
  );
}
