import { Button, EmptyState, SearchBox } from "@huhu/ui";
import { host } from "@huhu/workbench";
import { useState, type FormEvent } from "react";
import { deviceDefaults, saveDevicePreferences, useDevicePreferences, type DevicePreferences } from "./device-preferences.js";
import { canScaleTerminal } from "./SshTerminal.js";
import { KnownHostsPanel } from "./KnownHostsPanel.js";
import { SshVaultSettings } from "./SshVaultSettings.js";

const labels = { layout: "通用与布局", terminal: "终端", files: "文件与传输", connection: "连接" };
type Category = keyof typeof labels;
type DeviceCategory = Exclude<Category, "connection">;
const fields = {
  tabs: "工作区标签方向",
  paneTools: "分栏工具栏位置",
  restoreWorkspace: "打开工作区时恢复上次视图",
  fontSize: "终端字号",
  font: "终端字体",
  showDotFiles: "显示以点开头的文件",
  fileSort: "文件排序方式",
  remoteOnLeft: "双栏默认将远端放在左侧",
  showPaneFiles: "进入工作区时展开分栏文件",
} satisfies Record<keyof DevicePreferences, string>;
const keys = {
  layout: ["tabs", "paneTools", "restoreWorkspace"],
  terminal: ["fontSize", "font"],
  files: ["showDotFiles", "fileSort", "remoteOnLeft", "showPaneFiles"],
} as const satisfies Record<DeviceCategory, readonly (keyof DevicePreferences)[]>;
const vaultSearch = { files: "并发传输数 SFTP", connection: "连接超时 保活间隔 保活最大次数 已知主机" };

function DeviceForm({ category, filter }: { category: DeviceCategory; filter: string }) {
  const saved = useDevicePreferences();
  const [base, setBase] = useState(saved);
  const [draft, setDraft] = useState(saved);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const shown = (field: keyof DevicePreferences) => keys[category].some((key) => key === field) && (!filter || labels[category].includes(filter) || fields[field].includes(filter));
  const changed = keys[category].some((key) => draft[key] !== base[key]);
  function set<Key extends keyof DevicePreferences>(key: Key, value: DevicePreferences[Key]) {
    setNotice("");
    setError("");
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const patch = Object.fromEntries(keys[category].filter((key) => draft[key] !== base[key]).map((key) => [key, draft[key]]));
    try {
      const next = saveDevicePreferences(patch);
      setBase(next);
      setDraft(next);
      setNotice("已保存到本机。");
      setError("");
    } catch {
      setError("无法保存本机设置，请核对输入和设备存储。");
    }
  }
  return (
    <form className="hu-settings-section hu-card-alt" onSubmit={submit}>
      <h2>{category === "files" ? "本机文件视图" : labels[category]}</h2>
      <p>保存后应用到本机。</p>
      {shown("tabs") && (
        <label className="hu-setting-row">
          {fields.tabs}
          <select value={draft.tabs} onChange={(event) => set("tabs", event.target.value === "left" ? "left" : "top")}>
            <option value="top">上方</option>
            <option value="left">左侧</option>
          </select>
        </label>
      )}
      {shown("paneTools") && (
        <label className="hu-setting-row">
          {fields.paneTools}
          <select value={draft.paneTools} onChange={(event) => set("paneTools", event.target.value === "bottom" ? "bottom" : event.target.value === "hidden" ? "hidden" : "top")}>
            <option value="top">上方</option>
            <option value="bottom">下方</option>
            <option value="hidden">隐藏</option>
          </select>
        </label>
      )}
      {shown("restoreWorkspace") && (
        <label className="hu-setting-row">
          {fields.restoreWorkspace}
          <input type="checkbox" checked={draft.restoreWorkspace} onChange={(event) => set("restoreWorkspace", event.target.checked)} />
        </label>
      )}
      {shown("restoreWorkspace") && <p>该选项只恢复视图。断开的连接仍需手动重连。</p>}
      {shown("fontSize") && (
        <label className="hu-setting-row">
          {fields.fontSize}
          <input type="number" value={Number.isNaN(draft.fontSize) ? "" : draft.fontSize} required min={9} max={28} disabled={!canScaleTerminal()} onChange={(event) => set("fontSize", event.target.valueAsNumber)} />
        </label>
      )}
      {shown("fontSize") && !canScaleTerminal() && <p>当前宿主不支持终端布局缩放。</p>}
      {shown("font") && (
        <label className="hu-setting-row">
          {fields.font}
          <select value={draft.font} onChange={(event) => set("font", event.target.value === "jetbrains" ? "jetbrains" : event.target.value === "system" ? "system" : "theme")}>
            <option value="theme">跟随 Huhu 主题</option>
            <option value="jetbrains">JetBrains Mono</option>
            <option value="system">系统等宽字体</option>
          </select>
        </label>
      )}
      {category === "terminal" && !filter && <p>配色跟随 Huhu 外观。共用终端目前固定保留 5000 行回滚，未提供按 SSH 配置的行距、光标、选中即复制、本机 Shell 或录制选项。</p>}
      {shown("showDotFiles") && (
        <label className="hu-setting-row">
          {fields.showDotFiles}
          <input type="checkbox" checked={draft.showDotFiles} onChange={(event) => set("showDotFiles", event.target.checked)} />
        </label>
      )}
      {shown("fileSort") && (
        <label className="hu-setting-row">
          {fields.fileSort}
          <select value={draft.fileSort} onChange={(event) => set("fileSort", event.target.value === "size" ? "size" : event.target.value === "modified" ? "modified" : "name")}>
            <option value="name">名称</option>
            <option value="modified">最近修改</option>
            <option value="size">大小（降序）</option>
          </select>
        </label>
      )}
      {shown("remoteOnLeft") && (
        <label className="hu-setting-row">
          {fields.remoteOnLeft}
          <input type="checkbox" checked={draft.remoteOnLeft} onChange={(event) => set("remoteOnLeft", event.target.checked)} />
        </label>
      )}
      {shown("showPaneFiles") && (
        <label className="hu-setting-row">
          {fields.showPaneFiles}
          <input type="checkbox" checked={draft.showPaneFiles} onChange={(event) => set("showPaneFiles", event.target.checked)} />
        </label>
      )}
      {shown("showPaneFiles") && <p>打开工作区时，工具栏可见的已连接分栏会展开文件视图。独立双栏在工作台内打开。</p>}
      <div className="ssh-workspace-controls">
        <Button variant="primary" type="submit" disabled={!changed}>
          {category === "files" ? "保存本机文件设置" : "保存设置"}
        </Button>
        <Button
          disabled={!changed}
          onClick={() => {
            setBase(saved);
            setDraft(saved);
            setNotice("");
            setError("");
          }}
        >
          取消修改
        </Button>
        <Button
          onClick={() => {
            setDraft((current) => ({ ...current, ...Object.fromEntries(keys[category].map((key) => [key, deviceDefaults[key]])) }));
            setNotice("默认值已载入，保存后生效。");
            setError("");
          }}
        >
          恢复本类默认
        </Button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function SshSettingsPage() {
  const [category, select] = useState<Category>("layout");
  const [query, search] = useState("");
  const filter = query.trim().toLowerCase();
  const matchesDevice = (key: DeviceCategory) => keys[key].some((field) => fields[field].includes(filter));
  const matchesVault = (key: keyof typeof vaultSearch) => vaultSearch[key].toLowerCase().includes(filter);
  const categories = (Object.keys(labels) as Category[]).filter((key) => labels[key].includes(filter) || (key !== "connection" && matchesDevice(key)) || ((key === "connection" || key === "files") && matchesVault(key)));
  const selected = categories.includes(category) ? category : categories[0];
  return (
    <section data-testid="ssh-settings" aria-label="SSH 设置" className="hu-stack">
      <SearchBox value={query} onChange={search} placeholder="搜索 SSH 设置" />
      <div className="ssh-workspace-controls" aria-label="SSH 设置分类">
        {categories.map((key) => (
          <Button key={key} aria-pressed={selected === key} onClick={() => select(key)}>
            {labels[key]}
          </Button>
        ))}
      </div>
      {!selected && <EmptyState title="没有匹配的 SSH 设置" />}
      {selected && selected !== "connection" && (labels[selected].includes(filter) || matchesDevice(selected)) && <DeviceForm key={selected} category={selected} filter={filter} />}
      {selected === "connection" && <SshVaultSettings section="connection" />}
      {selected === "files" && (labels.files.includes(filter) || matchesVault("files")) && <SshVaultSettings section="transfer" />}
      {!filter && selected === "layout" && (
        <details className="hu-card-alt">
          <summary>凭据、已知主机与日志</summary>
          <p>主机凭据在远程连接的主机编辑器中管理。连接记录位于远程连接的「全部连接审计」。当前宿主未提供独立快捷命令库。</p>
          <KnownHostsPanel desktop={Boolean(host())} review={null} />
        </details>
      )}
    </section>
  );
}
