import { Button } from "@huhu/ui";
import { CapabilityError, host, useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { useId, useState, type FormEvent } from "react";
import { defaultVaultPreferences, type UpdateVaultPreferences, type VaultPreferencesSnapshot } from "../shared/preferences.js";

type Section = UpdateVaultPreferences["change"]["section"];

function VaultForm({ section, initial, reload }: { section: Section; initial: VaultPreferencesSnapshot; reload: () => Promise<unknown> }) {
  const headingId = useId();
  const autoReconnectId = useId();
  const shareConnectionsId = useId();
  const recordingEnabledId = useId();
  const recordingHistoryId = useId();
  const engine = useEngine();
  const queries = useQueryClient();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(saved.values);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(draft[section]) !== JSON.stringify(saved.values[section]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setError("");
    setSaving(true);
    const change = section === "connection" ? { section, values: draft.connection } as const
      : section === "recording" ? { section, values: draft.recording } as const
        : { section, values: draft.transfer } as const;
    try {
      const next = await engine.call<VaultPreferencesSnapshot>("ssh.settings.update", { expectedRevision: saved.revision, change }, { write: true });
      setSaved(next);
      setDraft(next.values);
      queries.setQueryData([engine.vaultId, "ssh.settings.get", {}], next);
      void queries.invalidateQueries({ queryKey: [engine.vaultId, "ssh.transfers.list"] });
      setNotice("已保存到当前库。");
    } catch (error) {
      setError(error instanceof CapabilityError && error.code === "VERSION_CONFLICT" ? "设置已在别处更新。重新读取后可再编辑。" : "无法保存库内设置，请核对输入与库的写入权限。");
    } finally {
      setSaving(false);
    }
  }

  function reset(values: VaultPreferencesSnapshot["values"]) {
    setDraft((current) => ({ ...current, [section]: values[section] }));
    setNotice("");
    setError("");
  }

  return (
    <form className="hu-settings-section hu-card-alt" aria-labelledby={headingId} onSubmit={(event) => void submit(event)}>
      <h2 id={headingId}>{section === "connection" ? "当前库的连接默认值" : section === "recording" ? "当前库的录制与历史" : "当前库的传输默认值"}</h2>
      {section === "connection" ? (
        <>
          <p>新拨号使用这些值。主机上单独填写的值优先。已经打开的连接保留原参数。</p>
          <label className="hu-setting-row">
            连接超时（秒）
            <input
              required
              type="number"
              step="any"
              min={1}
              max={300}
              value={Number.isNaN(draft.connection.connectTimeoutSec) ? "" : draft.connection.connectTimeoutSec}
              onChange={(event) => setDraft({ ...draft, connection: { ...draft.connection, connectTimeoutSec: event.target.valueAsNumber } })}
            />
          </label>
          <label className="hu-setting-row">
            协议保活间隔（秒）
            <input
              type="number"
              min={0}
              max={3600}
              placeholder="SSH 客户端默认值"
              value={draft.connection.keepaliveIntervalSec ?? ""}
              onChange={(event) => setDraft({ ...draft, connection: { ...draft.connection, keepaliveIntervalSec: event.target.value ? event.target.valueAsNumber : null } })}
            />
          </label>
          <label className="hu-setting-row">
            协议保活最大次数
            <input
              type="number"
              min={0}
              max={1000}
              placeholder="SSH 客户端默认值"
              value={draft.connection.keepaliveCountMax ?? ""}
              onChange={(event) => setDraft({ ...draft, connection: { ...draft.connection, keepaliveCountMax: event.target.value ? event.target.valueAsNumber : null } })}
            />
          </label>
          <div className="hu-setting-row">
            <label htmlFor={autoReconnectId}>断线后自动重连</label>
            <input id={autoReconnectId} type="checkbox" checked={draft.connection.autoReconnect} onChange={(event) =>
              setDraft({ ...draft, connection: { ...draft.connection, autoReconnect: event.currentTarget.checked } })} />
          </div>
          {([
            ["attempts", "自动重连次数", 10],
            ["intervalSec", "重试间隔（秒）", 300],
            ["maxDelaySec", "退避上限（秒）", 300],
          ] as const).map(([key, label, max]) => (
            <label className="hu-setting-row" key={key}>{label}
              <input type="number" required min={key === "maxDelaySec" ? draft.connection.reconnect.intervalSec || 1 : 1} max={max}
                disabled={!draft.connection.autoReconnect}
                value={Number.isNaN(draft.connection.reconnect[key]) ? "" : draft.connection.reconnect[key]}
                onChange={(event) => setDraft({ ...draft, connection: { ...draft.connection,
                  reconnect: { ...draft.connection.reconnect, [key]: event.currentTarget.valueAsNumber } } })} />
            </label>
          ))}
          <div className="hu-setting-row">
            <label htmlFor={shareConnectionsId}>同主机的新终端复用 SSH 连接</label>
            <input id={shareConnectionsId} type="checkbox" checked={draft.connection.shareConnections} onChange={(event) =>
              setDraft({ ...draft, connection: { ...draft.connection, shareConnections: event.currentTarget.checked } })} />
          </div>
          <p>自动重连使用原 SSH 路由。断开的 Shell 和文件会话需要重新打开。保活间隔填 0 会停用协议保活。</p>
        </>
      ) : section === "recording" ? (
        <>
          <div className="hu-setting-row">
            <label htmlFor={recordingEnabledId}>允许开始新的终端录制</label>
            <input id={recordingEnabledId} type="checkbox" checked={draft.recording.enabled} onChange={(event) =>
              setDraft({ ...draft, recording: { ...draft.recording, enabled: event.currentTarget.checked } })} />
          </div>
          <div className="hu-setting-row">
            <label htmlFor={recordingHistoryId}>录制历史上限</label>
            <input id={recordingHistoryId} type="number" required min={1} max={60} value={Number.isNaN(draft.recording.savedLimit) ? "" : draft.recording.savedLimit}
              onChange={(event) => setDraft({ ...draft, recording: { ...draft.recording, savedLimit: event.currentTarget.valueAsNumber } })} />
          </div>
          <p>正在进行的录制可正常结束。每次保存录制后，清理超出上限的旧录制。</p>
        </>
      ) : (
        <>
          <label className="hu-setting-row">
            并发传输数
            <input required type="number" min={1} max={8} value={Number.isNaN(draft.transfer.parallel) ? "" : draft.transfer.parallel} onChange={(event) => setDraft({ ...draft, transfer: { parallel: event.target.valueAsNumber } })} />
          </label>
          <p>降低上限会限制后续排队项目，正在进行的项目继续执行。文件使用 SFTP，覆盖需要逐项确认。队列中的文件发布会核验内容与修改时间。</p>
        </>
      )}
      <div className="ssh-workspace-controls">
        <Button variant="primary" type="submit" disabled={!changed || saving}>
          保存库内设置
        </Button>
        <Button disabled={!changed || saving} onClick={() => reset(saved.values)}>
          {section === "recording" ? "取消录制修改" : "取消修改"}
        </Button>
        <Button disabled={saving} onClick={() => reset(defaultVaultPreferences)}>
          {section === "recording" ? "恢复录制默认" : "恢复本类默认"}
        </Button>
        {error && (
          <Button disabled={saving} onClick={() => void reload()}>
            重新读取
          </Button>
        )}
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function SshVaultSettings({ section }: { section: Section }) {
  const desktop = Boolean(host());
  const state = useCapability<VaultPreferencesSnapshot>("ssh.settings.get", {}, { enabled: desktop });
  const [reloadCount, setReloadCount] = useState(0);
  if (!desktop) return <p>在桌面应用中查看并保存库内默认值。</p>;
  if (!state.data) return state.isError ? <p role="alert">无法读取库内 SSH 设置。</p> : <p role="status">正在读取库内设置…</p>;
  return (
    <VaultForm
      key={`${section}:${reloadCount}`}
      section={section}
      initial={state.data}
      reload={async () => {
        const next = await state.refetch();
        if (next.isSuccess) setReloadCount((count) => count + 1);
      }}
    />
  );
}
