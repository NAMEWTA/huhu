import { Button } from "@huhu/ui";
import { host, useCapability, useEngine } from "@huhu/workbench";
import { useId, useState } from "react";
import { defaultStartupPreferences, readStartupPreferences, saveStartupPreferences, type StartupPreferences } from "./startup-preferences.js";

export function SshStartupSettings() {
  const { vaultId } = useEngine();
  const desktop = Boolean(host());
  const hosts = useCapability<{ id: string; name: string }[]>("ssh.hosts.list", {}, { enabled: desktop });
  const [saved, setSaved] = useState(() => readStartupPreferences(vaultId));
  const [draft, setDraft] = useState(saved);
  const [notice, setNotice] = useState("");
  const title = useId();
  const changed = JSON.stringify(saved) !== JSON.stringify(draft);

  if (!desktop) return <p>启动自动连接与工作区恢复策略在桌面设备上设置。</p>;
  const connected = hosts.data?.filter(({ id }) => id.startsWith("host-owned-")) ?? [];
  const choices = [...connected, ...draft.hostIds.filter((id) => !connected.some((item) => item.id === id)).map((id) => ({ id, name: "已移除或不可用的主机" }))];
  return (
    <form
      className="hu-settings-section hu-card-alt"
      aria-labelledby={title}
      onSubmit={(event) => {
        event.preventDefault();
        try {
          saveStartupPreferences(vaultId, draft);
          setSaved(draft);
          setNotice("已保存到本机的当前 Vault，下次启动生效。");
        } catch {
          setNotice("无法保存本机 SSH 启动设置。");
        }
      }}
    >
      <h2 id={title}>SSH 启动与恢复</h2>
      <label className="hu-setting-row">
        工作区恢复策略
        <select value={draft.restore} onChange={(event) => setDraft({ ...draft, restore: event.currentTarget.value as StartupPreferences["restore"] })}>
          <option value="manual">手动重连</option>
          <option value="last">重连上次打开的工作区</option>
          <option value="all">重连已保存的工作区</option>
        </select>
      </label>
      <fieldset className="hu-stack">
        <legend>启动时自动连接的主机（最多 8 台）</legend>
        {choices.map(({ id, name }) => (
          <label key={id} className="hu-setting-row">
            {name}
            <input
              type="checkbox"
              checked={draft.hostIds.includes(id)}
              disabled={draft.hostIds.length >= 8 && !draft.hostIds.includes(id)}
              onChange={(event) => {
                setDraft({ ...draft, hostIds: event.currentTarget.checked ? [...draft.hostIds, id] : draft.hostIds.filter((hostId) => hostId !== id) });
              }}
            />
          </label>
        ))}
        {hosts.isError && <p role="alert">无法读取 SSH 主机目录。</p>}
        {hosts.isSuccess && choices.length === 0 && <p>保存 SSH 主机后可选为启动目标。</p>}
      </fieldset>
      <p>下次桌面启动或重新载入 Vault 时生效。首次信任和交互认证仍需要用户在远程连接中确认。</p>
      <div className="ssh-workspace-controls">
        <Button type="submit" variant="primary" disabled={!changed}>
          保存本机启动设置
        </Button>
        <Button
          type="button"
          disabled={!changed}
          onClick={() => {
            setDraft(saved);
            setNotice("");
          }}
        >
          取消启动设置修改
        </Button>
        <Button
          type="button"
          onClick={() => {
            setDraft(defaultStartupPreferences);
            setNotice("");
          }}
        >
          恢复启动默认值
        </Button>
      </div>
      <p role="status">{notice}</p>
    </form>
  );
}
