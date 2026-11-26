import { Button, PageHead } from "@huhu/ui";
import { host as desktopHost, useEngine } from "@huhu/workbench";
import { useState, type FormEvent } from "react";
import type { ConfigField, ConfigSyncPreview } from "../shared/config-sync.js";
import type { ManagedHost } from "./host-record.js";

const states = { same: "一致", file: "配置文件有修改", huhu: "Huhu 有修改", conflict: "两侧均有修改", unbound: "待确定基准" };

export function ConfigSyncPanel({ hosts, onBack, onChanged }: { hosts: ManagedHost[]; onBack(): void; onChanged(): Promise<unknown> }) {
  const engine = useEngine();
  const [source, setSource] = useState({ path: "", alias: "", hostId: "" });
  const [preview, setPreview] = useState<ConfigSyncPreview>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [announcement, setAnnouncement] = useState("");
  function edit(patch: Partial<typeof source>) {
    setSource({ ...source, ...patch });
    setPreview(undefined);
    setFeedback("");
    setAnnouncement("");
  }
  async function choose() {
    setBusy(true);
    try {
      const file = await desktopHost()?.pickOpenPath("file");
      if (file) edit({ path: file });
    } catch {
      setFeedback("无法打开配置文件选择器。");
    } finally {
      setBusy(false);
    }
  }
  async function inspect(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    setAnnouncement("");
    setPreview(undefined);
    try {
      setPreview(await engine.call<ConfigSyncPreview>("ssh.configSync.preview", source));
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "无法预览配置文件。");
    } finally {
      setBusy(false);
    }
  }
  async function apply(field: ConfigField, direction: "file-to-huhu" | "huhu-to-file" | "establish") {
    if (busy || !preview) return;
    const { fingerprint, comparison, hostRevision, stateRevision } = preview;
    setBusy(true);
    setFeedback("");
    setAnnouncement("");
    try {
      setPreview(await engine.call<ConfigSyncPreview>("ssh.configSync.apply", { ...source, fingerprint, comparison, hostRevision, stateRevision, field, direction }, { write: true }));
      await onChanged();
      setAnnouncement(`${field} 同步结果已更新`);
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "无法应用同步结果，请重新预览。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="hu-view-content">
      <PageHead title="OpenSSH 配置同步" description="选择配置文件和已保存主机，预览 Host 块中的跳板、身份文件与保活字段。" actions={<Button onClick={onBack}>返回跳板路由</Button>} />
      <form className="hu-card-alt hu-form-body" onSubmit={(event) => void inspect(event)}>
        <label className="hu-field">
          配置文件
          <input value={source.path} readOnly />
        </label>
        <Button type="button" disabled={busy} onClick={() => void choose()}>
          选择配置文件
        </Button>
        <label className="hu-field">
          OpenSSH Host 别名
          <input value={source.alias} required maxLength={255} disabled={busy} onChange={(event) => edit({ alias: event.currentTarget.value.trim() })} />
        </label>
        <label className="hu-field">
          Huhu 主机
          <select value={source.hostId} required disabled={busy} onChange={(event) => edit({ hostId: event.currentTarget.value })}>
            <option value="">选择主机</option>
            {hosts.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" loading={busy} disabled={!source.path}>
          预览同步
        </Button>
      </form>
      {feedback && <p role="alert">{feedback}</p>}
      <div role="status">{announcement}</div>
      {preview && (
        <section className="hu-card-alt hu-stack">
          <h3>同步差异</h3>
          <p>
            源文件指纹 <code>{preview.fingerprint}</code>
          </p>
          <p>
            主机版本 <code>{preview.hostRevision}</code>
          </p>
          <ul className="hu-stack">
            {preview.rows.map((row) => (
              <li key={row.field}>
                <strong>{row.field}</strong> · {states[row.change]}
                <dl className="ssh-definition">
                  <dt>配置文件</dt>
                  <dd>{row.file ?? "未设置"}</dd>
                  <dt>Huhu</dt>
                  <dd>{row.huhu ?? "未设置"}</dd>
                </dl>
                {row.unavailable ? <p>{row.unavailable}</p> : row.change === "same" ? (
                  <Button disabled={busy} onClick={() => void apply(row.field, "establish")}>
                    记录基准
                  </Button>
                ) : (
                  <div className="ssh-workspace-controls">
                    <Button disabled={busy} onClick={() => void apply(row.field, "file-to-huhu")}>
                      将文件值应用到主机
                    </Button>
                    {row.huhuToFileUnavailable ? <p>{row.huhuToFileUnavailable}</p> : (
                      <Button disabled={busy} onClick={() => void apply(row.field, "huhu-to-file")}>
                        将主机值写入文件
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Button disabled={busy} onClick={() => { setPreview(undefined); setAnnouncement(""); }}>
            收起预览
          </Button>
        </section>
      )}
    </section>
  );
}
