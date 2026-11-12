import { Badge, Button, ChoiceSwitch, EmptyState, Field, IconButton, SearchBox, Segmented } from "@huhu/ui";
import { Braces, CheckCircle2, Copy, Database, Download, FileText, Folder, FolderOpen, PackageOpen, RefreshCw, Search, ShieldCheck, Upload, ChevronRight } from "lucide-react";
import type { Settings } from "@huhu/contracts";
import { useMemo, useState } from "react";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { t } from "../i18n/zh-CN.js";
import { host } from "./host.js";

interface Info {
  name?: string;
  counts: Record<string, number>;
  indexing: boolean;
  readOnly: boolean;
}
interface Exported {
  path: string;
  size: number;
  sha256: string;
  files: number;
}
interface ManagedFile {
  path: string;
  domain: string;
  size: number;
  mtimeMs: number;
}
type StorageTab = "files" | "index" | "export" | "rules";
const DOMAIN_NAMES: Record<string, string> = { notes: "笔记", tasks: "任务", archives: "档案", inbox: "收件箱", automations: "自动化", runs: "运行记录", comments: "批注", config: "配置", guide: "指南" };
const RULES: [string, string, string, string][] = [
  ["用户内容", "笔记、附件", "Vault 任意目录", "否 · 文件本身是真相来源"],
  ["语义内容", "任务、档案、档案类型、捕获、自动化规则、运行结果、批注", "Vault 内固定目录的 .md", "否 · 文件本身是真相来源"],
  ["配置", "设置、插件启停、网关、Space、SSH 主机、脚本配置", ".huhu/*.json · .huhu/<插件>/", "否 · 文件本身是真相来源"],
  ["秘密", "保险箱条目值", ".huhu/safe/sealed/（密文）", "否 · 密文 + 用户主密码"],
  ["可靠性材料", "操作日志与备份、草稿、回收站、运行处理记录、提醒投递记录", ".huhu/operations/ · drafts/ · trash/ · automations/", "否 · 禁止当缓存清理"],
  ["历史", "文件历史 shadow 仓库", ".huhu/history/git/", "否 · 可在设置中显式清理"],
  ["机器运行态", "Engine 端点、锁、日志、Herdr 状态、worker 输出", ".huhu/runtime/<机器>/", "应用未运行时可删，但会丢失可恢复的会话"],
  ["缓存", "缩略图、可重建数据", ".huhu/cache/", "是"],
  ["界面状态", "打开的标签、面板宽度、选中项", ".huhu/ui/state.json", "是"],
];
interface Imported {
  vaultId: string;
  files: number;
  targetDir: string;
}

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** 设置 → 数据与存储：索引重建（可取消，取消后旧索引继续使用）、导出受管数据包、导入数据包到新目录。 */
export function StoragePage() {
  const engine = useEngine();
  const qc = useQueryClient();
  const info = useCapability<Info & { name: string }>("vault.info", {});
  const settings = useCapability<Settings>("settings.get", {});
  const files = useCapability<{ files: ManagedFile[]; truncated: boolean }>("vault.managedFiles", {});
  const c = t.settings.storage;
  const [tab, setTab] = useState<StorageTab>("files");
  const [busy, setBusy] = useState<"reindex" | "export" | "import" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; testid: string } | null>(null);
  const [exported, setExported] = useState<Exported | null>(null);
  const [imported, setImported] = useState<Imported | null>(null);
  const [attachments, setAttachments] = useState(true);
  const [dest, setDest] = useState("");
  const [zipPath, setZipPath] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
  const fail = (e: unknown, testid: string) => setMsg({ kind: "error", text: e instanceof Error ? e.message : String(e), testid });

  async function setPrompt(v: boolean) {
    try {
      await engine.call("settings.update", { patch: { storage: { promptBackupBeforeClose: v } } }, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === "settings.get" });
    } catch (e) {
      fail(e, "storage-export-msg");
    }
  }
  async function reindex() {
    setBusy("reindex");
    setMsg(null);
    try {
      const r = await engine.call<{ completed: boolean }>("vault.reindex", {}, { write: true });
      setMsg({ kind: "ok", text: r.completed ? c.reindexDone : c.reindexCancelled, testid: "storage-reindex-msg" });
    } catch (e) {
      fail(e, "storage-reindex-msg");
    } finally {
      setBusy(null);
      void refresh();
    }
  }
  async function cancelReindex() {
    try {
      const r = await engine.call<{ cancelled: boolean }>("vault.reindexCancel", {}, { write: true });
      if (!r.cancelled) setMsg({ kind: "ok", text: c.cannotCancel, testid: "storage-reindex-msg" });
    } catch (e) {
      fail(e, "storage-reindex-msg");
    }
  }
  async function doExport() {
    setBusy("export");
    setMsg(null);
    setExported(null);
    try {
      setExported(await engine.call<Exported>("vault.exportPackage", { dest: dest.trim(), includeAttachments: attachments }, { write: true }));
    } catch (e) {
      fail(e, "storage-export-msg");
    } finally {
      setBusy(null);
    }
  }
  async function doImport() {
    setBusy("import");
    setMsg(null);
    setImported(null);
    try {
      setImported(await engine.call<Imported>("vault.importPackage", { zipPath: zipPath.trim(), targetDir: targetDir.trim() }, { write: true }));
    } catch (e) {
      fail(e, "storage-import-msg");
    } finally {
      setBusy(null);
    }
  }
  const h = host();

  if (info.isError)
    return (
      <div role="alert" className="hu-overdue">
        {info.error instanceof Error ? info.error.message : String(info.error)}
      </div>
    );
  if (!info.data) return <p>{t.loading}</p>;
  const indexing = info.data.indexing || busy === "reindex";
  return (
    <div data-testid="settings-storage" className="storage-view-v6">
      <section className="storage-ownership card">
        <div className="storage-symbol">
          <Folder size={29} strokeWidth={1.5} aria-hidden />
        </div>
        <div className="grow">
          <div className="row">
            <h2>{info.data.name}</h2>
            <Badge tone="success">Markdown + JSON</Badge>
          </div>
          <p>
            笔记正文在普通目录，任务、档案与设置在 <code>.huhu/</code>。索引不是原始数据。
          </p>
        </div>
        <div className="storage-metrics">
          <div>
            <strong data-testid="storage-metric-files">{files.data?.files.length ?? "—"}</strong>
            <span>受管文本文件</span>
          </div>
          <div>
            <strong>{files.data ? fmtSize(files.data.files.reduce((n, f) => n + f.size, 0)) : "—"}</strong>
            <span>未压缩内容</span>
          </div>
        </div>
      </section>
      <div className="storage-local-tabs">
        <Segmented<StorageTab>
          label="数据与存储分区"
          value={tab}
          onChange={setTab}
          testId="storage-tabs"
          options={[
            { value: "files", label: "文件结构", icon: Folder },
            { value: "index", label: "索引与恢复", icon: Database },
            { value: "export", label: "导出与迁移", icon: PackageOpen },
            { value: "rules", label: "存储规则", icon: ShieldCheck },
          ]}
        />
      </div>

      {msg ? (
        <div role={msg.kind === "error" ? "alert" : "status"} className={msg.kind === "error" ? "callout danger" : "callout"} data-testid={msg.testid}>
          <p>{msg.text}</p>
        </div>
      ) : null}

      {tab === "files" ? <FileBrowser files={files.data?.files ?? []} loading={!files.data} error={files.isError ? (files.error instanceof Error ? files.error.message : String(files.error)) : null} /> : null}
      {tab === "index" ? (
        <div className="storage-two-cards">
          <section className="settings-section card">
            <h2>{c.indexTitle}</h2>
            <p data-testid="storage-counts">
              {c.counts(info.data.counts["files"] ?? 0, info.data.counts["notes"] ?? 0)}
              {indexing ? `（${c.indexing}）` : ""}
            </p>
            <p className="hint-text">{c.indexNote}</p>
            <div className="row">
              <Button icon={RefreshCw} onClick={() => void reindex()} disabled={busy !== null || info.data.indexing} loading={busy === "reindex"} data-testid="storage-reindex">
                {c.reindex}
              </Button>
              {indexing ? (
                <Button onClick={() => void cancelReindex()} data-testid="storage-reindex-cancel">
                  {c.cancel}
                </Button>
              ) : null}
            </div>
          </section>

          <section className="settings-section card">
            <h2>保存与恢复的边界</h2>
            <ol className="storage-steps">
              <li>
                <strong>先检测外部修改</strong>
                <p>保存时携带当前版本，磁盘内容已被改动则拒绝覆盖。</p>
              </li>
              <li>
                <strong>保留写入前的文件</strong>
                <p>
                  写入前的备份与回执位于 <code>.huhu/operations/</code>，不是缓存，不会被清理。
                </p>
              </li>
              <li>
                <strong>失败时保留现场</strong>
                <p>写入失败时保留内存中的修改，可以导出后再按备份恢复。</p>
              </li>
            </ol>
          </section>
        </div>
      ) : null}
      {tab === "export" ? (
        <>
          <section className="settings-section card">
            <h2>{c.exportTitle}</h2>
            <p>{c.exportNote}</p>
            <div className="storage-export-grid">
              <div>
                <CheckCircle2 size={19} aria-hidden />
                <strong>包含</strong>
                <p>笔记、任务、档案、收件箱、批注、设置与插件配置、内置指南，以及可选的附件。</p>
              </div>
              <div>
                <Folder size={19} aria-hidden />
                <strong>请自行保留</strong>
                <p>文件历史与运行状态不在数据包里；完整备份请复制整个 Vault 文件夹。</p>
              </div>
              <div>
                <ShieldCheck size={19} aria-hidden />
                <strong>保险箱仍是密文</strong>
                <p>只导出密文，解锁仍需原主密码；HUHU 不保存明文凭据。</p>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong>{c.attachments}</strong>
              </div>
              <ChoiceSwitch checked={attachments} onChange={setAttachments} label={c.attachments} />
            </div>
            <div className="setting-row">
              <div>
                <strong>关闭前提示导出数据包</strong>
                <p className="hint-text">关闭或切换 Vault 时先弹出导出步骤，确认备份可用后再继续。默认关闭。</p>
              </div>
              <ChoiceSwitch checked={settings.data?.storage.promptBackupBeforeClose ?? false} onChange={(v) => void setPrompt(v)} label="关闭前提示导出数据包" />
            </div>
            <Field label={c.exportPath}>
              <div className="row">
                <input aria-label={c.exportPath} data-testid="storage-export-path" value={dest} placeholder="/…/HUHU-备份.zip" onChange={(e) => setDest(e.target.value)} />
                {h?.pickSavePath ? (
                  <Button
                    onClick={() =>
                      void h.pickSavePath(`HUHU-${new Date().toISOString().slice(0, 10)}.zip`).then((p) => {
                        if (p) setDest(p);
                      })
                    }
                  >
                    {c.choose}
                  </Button>
                ) : null}
                <Button variant="primary" icon={Download} onClick={() => void doExport()} disabled={busy !== null || !dest.trim()} loading={busy === "export"} data-testid="storage-export">
                  {c.export}
                </Button>
              </div>
            </Field>
            {exported ? (
              <div className="date-format-samples" data-testid="storage-export-result">
                <div>
                  <span>{c.resultPath}</span>
                  <code data-testid="export-path">{exported.path}</code>
                </div>
                <div>
                  <span>{c.resultSize}</span>
                  <code data-testid="export-size">
                    {fmtSize(exported.size)}（{c.files(exported.files)}）
                  </code>
                </div>
                <div>
                  <span>SHA-256</span>
                  <code data-testid="export-sha">{exported.sha256}</code>
                </div>
              </div>
            ) : null}
          </section>

          <section className="settings-section card">
            <h2>{c.importTitle}</h2>
            <p>{c.importNote}</p>
            <Field label={c.zipPath}>
              <div className="row">
                <input aria-label={c.zipPath} data-testid="storage-import-zip" value={zipPath} onChange={(e) => setZipPath(e.target.value)} />
                {h?.pickOpenPath ? (
                  <Button
                    onClick={() =>
                      void h.pickOpenPath("zip").then((p) => {
                        if (p) setZipPath(p);
                      })
                    }
                  >
                    {c.choose}
                  </Button>
                ) : null}
              </div>
            </Field>
            <Field label={c.targetDir}>
              <div className="row">
                <input aria-label={c.targetDir} data-testid="storage-import-target" value={targetDir} onChange={(e) => setTargetDir(e.target.value)} />
                {h?.pickOpenPath ? (
                  <Button
                    onClick={() =>
                      void h.pickOpenPath("directory").then((p) => {
                        if (p) setTargetDir(p);
                      })
                    }
                  >
                    {c.choose}
                  </Button>
                ) : null}
                <Button icon={Upload} onClick={() => void doImport()} disabled={busy !== null || !zipPath.trim() || !targetDir.trim()} loading={busy === "import"} data-testid="storage-import">
                  {c.import}
                </Button>
              </div>
            </Field>
            {imported ? (
              <p role="status" data-testid="storage-import-result" className="hint-text">
                {c.imported(imported.targetDir, imported.files)}
              </p>
            ) : null}
          </section>

          <section className="settings-section card">
            <h2>{c.backupTitle}</h2>
            <p>{c.backupNote}</p>
          </section>
        </>
      ) : null}
      {tab === "rules" ? (
        <section className="settings-section card">
          <h2>整个工作台共同遵守</h2>
          <table className="table storage-rules" data-testid="storage-rules">
            <thead>
              <tr>
                <th>类别</th>
                <th>例子</th>
                <th>位置</th>
                <th>可删除</th>
              </tr>
            </thead>
            <tbody>
              {RULES.map(([a, b, c2, d]) => (
                <tr key={a}>
                  <td>
                    <strong>{a}</strong>
                  </td>
                  <td>{b}</td>
                  <td>
                    <code>{c2}</code>
                  </td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

/** 文件结构：按领域筛选 + 路径搜索 + 只读原文预览（复制内容、在文件管理器中显示）。 */
function FileBrowser({ files, loading, error }: { files: ManagedFile[]; loading: boolean; error: string | null }) {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const byDomain = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of files) m[f.domain] = (m[f.domain] ?? 0) + 1;
    return m;
  }, [files]);
  const visible = useMemo(() => files.filter((f) => (domain === "all" || f.domain === domain) && (query.trim() === "" || f.path.toLowerCase().includes(query.trim().toLowerCase()))), [files, domain, query]);
  const current = files.find((f) => f.path === selected) ?? null;
  return (
    <section className="storage-browser card" data-testid="storage-browser">
      <header>
        <SearchBox value={query} onChange={setQuery} placeholder="搜索路径或文件名…" />
        <select aria-label="按领域筛选文件" value={domain} onChange={(e) => setDomain(e.target.value)} data-testid="storage-domain">
          <option value="all">全部领域 · {files.length} 个文件</option>
          {Object.entries(byDomain).map(([id, n]) => (
            <option key={id} value={id}>
              {DOMAIN_NAMES[id] ?? id} · {n}
            </option>
          ))}
        </select>
        <Badge>{visible.length} 项</Badge>
      </header>
      {error ? (
        <div role="alert" className="callout danger">
          <p>{error}</p>
        </div>
      ) : null}
      <div className="storage-file-panes">
        <div className="storage-file-list" aria-label="Vault 受管文件">
          {loading ? <p className="hint-text">{t.loading}</p> : null}
          {!loading && visible.length === 0 ? (
            <EmptyState
              icon={Search}
              title="没有匹配的文件"
              hint="尝试其他路径或切换领域。"
              action={
                <Button
                  onClick={() => {
                    setQuery("");
                    setDomain("all");
                  }}
                >
                  清除筛选
                </Button>
              }
            />
          ) : null}
          {visible.slice(0, 500).map((f) => (
            <button key={f.path} type="button" className={selected === f.path ? "selected" : ""} aria-pressed={selected === f.path} data-testid="storage-file" onClick={() => setSelected(f.path)}>
              {f.path.endsWith(".json") ? <Braces size={15} aria-hidden /> : <FileText size={15} aria-hidden />}
              <span>
                <strong>{f.path.split("/").at(-1)}</strong>
                <small>{f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "Vault 根目录"}</small>
              </span>
              <ChevronRight size={13} aria-hidden />
            </button>
          ))}
          {visible.length > 500 ? <p className="hint-text">只显示前 500 项，请缩小筛选范围。</p> : null}
        </div>
        <div className="storage-file-preview">{current ? <FilePreview file={current} /> : <EmptyState icon={FileText} title="选择文件查看内容" />}</div>
      </div>
      <footer className="storage-browser-foot">这里展示 HUHU 管理的 Markdown 与 JSON 文件（只读）。附件、未知文件、运行状态、历史仓库和保险箱密文不在此列出。</footer>
    </section>
  );
}

function FilePreview({ file }: { file: ManagedFile }) {
  const content = useCapability<{ text: string }>("vault.readFile", { path: file.path });
  const h = host();
  const text = content.data?.text ?? "";
  return (
    <>
      <div className="storage-preview-head">
        <code title={file.path}>{file.path}</code>
        <div className="row">
          <IconButton icon={Copy} label="复制文件内容" disabled={!content.data} onClick={() => void (h ? h.copyText(text) : navigator.clipboard.writeText(text))} />
          {h?.openVaultFile ? <IconButton icon={FolderOpen} label="在文件管理器中显示" data-testid="storage-reveal" onClick={() => void h.openVaultFile?.(file.path, true)} /> : null}
        </div>
      </div>
      {content.isError ? (
        <div role="alert" className="callout danger">
          <p>{content.error instanceof Error ? content.error.message : String(content.error)}</p>
        </div>
      ) : (
        <pre tabIndex={0} aria-label="受管文件内容预览" data-testid="storage-preview">
          {content.data ? text : "…"}
        </pre>
      )}
      <footer>
        <Badge>{file.path.endsWith(".json") ? "JSON · 结构化原始数据" : "Markdown · 可读正文"}</Badge>
        <span>{fmtSize(file.size)}</span>
      </footer>
    </>
  );
}
