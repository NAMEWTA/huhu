import { Button, EmptyState, SearchBox } from "@huhu/ui";
import { host, useCapability } from "@huhu/workbench";
import { useId, useState, type FormEvent } from "react";
import type { LocalEnvironment } from "../shared/local-shell.js";
import { deviceDefaults, saveDevicePreferences, terminalScrollbackChoices, useDevicePreferences, type DevicePreferences } from "./device-preferences.js";
import { canScaleTerminal } from "./SshTerminal.js";
import { KnownHostsPanel } from "./KnownHostsPanel.js";
import { SshVaultSettings } from "./SshVaultSettings.js";
import { SshSharedTools } from "./SshSharedTools.js";

const labels = { layout: "通用与布局", terminal: "终端", files: "文件与传输", connection: "连接", sharedTools: "MCP 与共享工具权限" };
type Category = keyof typeof labels;
type DeviceCategory = Exclude<Category, "connection" | "sharedTools">;
const fields = {
  tabs: "工作区标签方向",
  paneTools: "分栏工具栏位置",
  paneToolOrder: "工具栏顺序",
  paneToolSize: "工具栏尺寸",
  groupVerticalTabs: "纵向标签按同目标分组",
  restoreWorkspace: "打开工作区时恢复上次视图",
  fontSize: "终端字号",
  font: "终端字体",
  terminalLineHeight: "终端行距",
  terminalCursor: "终端光标样式",
  terminalCursorBlink: "终端光标闪烁",
  terminalScrollback: "终端回滚行数",
  terminalWordSeparator: "终端选词分隔符",
  terminalLinkActivation: "允许在终端打开链接",
  localShellEnvironment: "默认本地 Shell",
  showDotFiles: "显示以点开头的文件",
  fileSort: "文件排序方式",
  remoteOnLeft: "双栏默认将远端放在左侧",
  showPaneFiles: "进入工作区时展开分栏文件",
  followShellDirectory: "文件面板跟随 Shell",
  followFileDirectory: "Shell 跟随文件面板",
} satisfies Partial<Record<keyof DevicePreferences, string>>;
const keys = {
  layout: ["tabs", "paneTools", "groupVerticalTabs", "paneToolOrder", "paneToolSize", "restoreWorkspace"],
  terminal: ["fontSize", "font", "terminalLineHeight", "terminalCursor", "terminalCursorBlink", "terminalScrollback", "terminalWordSeparator", "terminalLinkActivation", "localShellEnvironment"],
  files: ["showDotFiles", "fileSort", "remoteOnLeft", "showPaneFiles", "followShellDirectory", "followFileDirectory"],
} as const satisfies Record<DeviceCategory, readonly (keyof typeof fields)[]>;
const vaultSearch = { files: "并发传输数 SFTP", connection: "连接超时（秒） 协议保活间隔（秒） 协议保活最大次数" };

function DeviceForm({ category, filter }: { category: DeviceCategory; filter: string }) {
  const headingId = useId();
  const saved = useDevicePreferences();
  const [base, setBase] = useState(saved);
  const [draft, setDraft] = useState(saved);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const shown = (field: keyof typeof fields) => keys[category].some((key) => key === field) && (labels[category].toLowerCase().includes(filter) || fields[field].toLowerCase().includes(filter));
  const desktop = Boolean(host());
  const environments = useCapability<LocalEnvironment[]>("ssh.local.environments", {}, { enabled: desktop && shown("localShellEnvironment") });
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
    <form className="hu-settings-section hu-card-alt" aria-labelledby={headingId} onSubmit={submit}>
      <h2 id={headingId}>{category === "files" ? "本机文件视图" : labels[category]}</h2>
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
      {shown("groupVerticalTabs") && (
        <label className="hu-setting-row">
          {fields.groupVerticalTabs}
          <input type="checkbox" checked={draft.groupVerticalTabs} onChange={(event) => set("groupVerticalTabs", event.target.checked)} />
        </label>
      )}
      {shown("paneToolOrder") && (
        <label className="hu-setting-row">
          {fields.paneToolOrder}
          <select value={draft.paneToolOrder} onChange={(event) => set("paneToolOrder", event.target.value === "monitor-first" ? "monitor-first" : "files-first")}>
            <option value="files-first">文件在前</option>
            <option value="monitor-first">监控在前</option>
          </select>
        </label>
      )}
      {shown("paneToolSize") && (
        <label className="hu-setting-row">
          {fields.paneToolSize}
          <select value={draft.paneToolSize} onChange={(event) => set("paneToolSize", event.target.value === "large" ? "large" : event.target.value === "medium" ? "medium" : "small")}>
            <option value="small">小</option>
            <option value="medium">中</option>
            <option value="large">大</option>
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
      {shown("terminalLineHeight") && (
        <label className="hu-setting-row">
          {fields.terminalLineHeight}
          <select value={draft.terminalLineHeight} onChange={(event) => set("terminalLineHeight", event.target.value === "roomy" ? "roomy" : "normal")}>
            <option value="normal">标准</option>
            <option value="roomy">宽松</option>
          </select>
        </label>
      )}
      {shown("terminalCursor") && (
        <label className="hu-setting-row">
          {fields.terminalCursor}
          <select value={draft.terminalCursor} onChange={(event) => set("terminalCursor", event.target.value === "bar" ? "bar" : event.target.value === "underline" ? "underline" : "block")}>
            <option value="block">方块</option>
            <option value="bar">竖线</option>
            <option value="underline">下划线</option>
          </select>
        </label>
      )}
      {shown("terminalCursorBlink") && (
        <label className="hu-setting-row">
          {fields.terminalCursorBlink}
          <input type="checkbox" checked={draft.terminalCursorBlink} onChange={(event) => set("terminalCursorBlink", event.target.checked)} />
        </label>
      )}
      {shown("terminalScrollback") && (
        <label className="hu-setting-row">
          {fields.terminalScrollback}
          <select value={draft.terminalScrollback} onChange={(event) => set("terminalScrollback", terminalScrollbackChoices.find((lines) => lines === Number(event.target.value)) ?? deviceDefaults.terminalScrollback)}>
            {terminalScrollbackChoices.map((lines) => (
              <option value={lines} key={lines}>{lines}</option>
            ))}
          </select>
        </label>
      )}
      {shown("terminalWordSeparator") && (
        <label className="hu-setting-row">
          {fields.terminalWordSeparator}
          <input type="text" value={draft.terminalWordSeparator} maxLength={100} onChange={(event) => set("terminalWordSeparator", event.currentTarget.value)} />
        </label>
      )}
      {shown("terminalLinkActivation") && (
        <label className="hu-setting-row">
          {fields.terminalLinkActivation}
          <input type="checkbox" checked={draft.terminalLinkActivation} onChange={(event) => set("terminalLinkActivation", event.currentTarget.checked)} />
        </label>
      )}
      {shown("localShellEnvironment") && (desktop ? (
        <>
          <label className="hu-setting-row">
            {fields.localShellEnvironment}
            <select value={draft.localShellEnvironment} disabled={!environments.data} onChange={(event) => set("localShellEnvironment", event.target.value)}>
              <option value="">每次选择</option>
              {draft.localShellEnvironment && !environments.data?.some(({ id }) => id === draft.localShellEnvironment) && (
                <option value={draft.localShellEnvironment} disabled>已保存的环境不可用</option>
              )}
              {environments.data?.map(({ id, kind, name }) => (
                <option key={id} value={id}>
                  {kind === "wsl" ? "WSL" : "本机 Shell"} · {name}
                </option>
              ))}
            </select>
          </label>
          {environments.isError && <p role="alert">无法读取此设备已安装的 Shell。</p>}
        </>
      ) : <p>在桌面应用中选择默认本地 Shell。</p>)}
      {category === "terminal" && !filter && <p>配色跟随 Huhu 外观。减少回滚行数会截去本机已打开视图中更早的内容。</p>}
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
      {(["followShellDirectory", "followFileDirectory"] as const).map(
        (field) =>
          shown(field) && (
            <label className="hu-setting-row" key={field}>
              {fields[field]}
              <input type="checkbox" checked={draft[field]} onChange={(event) => set(field, event.target.checked)} />
            </label>
          ),
      )}
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
  const matchesDevice = (key: DeviceCategory) => keys[key].some((field) => fields[field].toLowerCase().includes(filter));
  const matchesVault = (key: keyof typeof vaultSearch) => vaultSearch[key].toLowerCase().includes(filter);
  const matchesCategory = (key: Category) => labels[key].toLowerCase().includes(filter);
  const isDevice = (key: Category): key is DeviceCategory => Object.hasOwn(keys, key);
  const matchesKnownHosts = filter !== "" && "凭据、已知主机与日志".includes(filter);
  const categories = (Object.keys(labels) as Category[]).filter((key) => matchesCategory(key) || (isDevice(key) && matchesDevice(key)) || ((key === "connection" || key === "files") && matchesVault(key)) || (key === "layout" && matchesKnownHosts));
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
      {selected && isDevice(selected) && (matchesCategory(selected) || matchesDevice(selected)) && <DeviceForm key={selected} category={selected} filter={filter} />}
      {selected === "connection" && <SshVaultSettings section="connection" />}
      {selected === "files" && (labels.files.includes(filter) || matchesVault("files")) && <SshVaultSettings section="transfer" />}
      {selected === "sharedTools" && <SshSharedTools />}
      {(!filter || matchesKnownHosts) && selected === "layout" && (
        <details className="hu-card-alt" open={matchesKnownHosts ? true : undefined}>
          <summary>凭据、已知主机与日志</summary>
          <p>在远程连接中使用主机编辑器管理凭据，并打开「全部连接审计」或「快捷命令」。</p>
          <KnownHostsPanel desktop={Boolean(host())} review={null} />
        </details>
      )}
    </section>
  );
}
