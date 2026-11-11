import { Badge, Button, EmptyState, ReviewDiff, Segmented } from "@huhu/ui";
import { Copy, FileText, History, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { CapabilityError } from "../engine-client/client.js";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";

type Status = "current" | "missing" | "outdated" | "conflict" | "preserved" | "needs-check" | "error";
interface GuideStatus {
  version: string;
  readOnly: boolean;
  overall: Status;
  files: { path: string; status: Status }[];
}
interface View {
  path: string;
  current: string | null;
  builtin: string;
  status: Status;
}
type ViewMode = "current" | "builtin" | "diff";

const LABEL: Record<Status | "disabled", string> = { current: "已是最新", missing: "缺失", outdated: "可升级", conflict: "有冲突", preserved: "已保留", "needs-check": "待检查", error: "读写失败", disabled: "已停用" };
const TONE: Record<Status | "disabled", "success" | "neutral" | "warning" | "danger" | "blue"> = {
  current: "success",
  missing: "warning",
  outdated: "blue",
  conflict: "danger",
  preserved: "neutral",
  "needs-check": "warning",
  error: "danger",
  disabled: "neutral",
};
const HINT: Record<Status, string> = {
  current: "文件与内置版本一致。",
  missing: "文件不存在；打开 Vault 时会自动补写。",
  outdated: "文件是 HUHU 上一次写入的版本；打开 Vault 时会先备份再自动升级。",
  conflict: "文件与内置版本、HUHU 上次写入的版本都不同（可能被手改过）。HUHU 不会覆盖它，由你决定。",
  preserved: "你选择保留当前文件；自动维护不会写入它。",
  "needs-check": "文件由版本历史恢复，请检查后再决定。",
  error: "读取或写入失败，原文件保持不变。",
};

/** 设置 → Agent 接入（plugins §4）：三份指南文件的状态、当前 / 内置 / 差异视图，以及保留、备份并恢复、恢复备份。 */
export function AgentAccessPage({ vaultPath }: { vaultPath?: string }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const status = useCapability<GuideStatus>("guide.status", {});
  const backups = useCapability<{ id: string; files: string[] }[]>("guide.backups.list", {});
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("diff");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const file = selected ?? status.data?.files[0]?.path ?? null;
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("guide.") });

  async function act(cap: string, input: unknown, done: string): Promise<void> {
    setError(null);
    setNotice(null);
    try {
      await engine.call(cap, input, { write: true });
      await refresh();
      setNotice(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (status.isError) {
    const disabled = status.error instanceof CapabilityError && status.error.code === "PLUGIN_DISABLED";
    return (
      <div data-testid="settings-agent-access">
        <section className="settings-section card">
          <h2>
            Agent 接入 <Badge tone="neutral">{disabled ? LABEL.disabled : "不可用"}</Badge>
          </h2>
          <p className="hint-text">{disabled ? "agent-guide 插件已停用：指南文件保持原样，CLI 与 MCP 不受影响。在插件中心重新启用后可继续维护。" : status.error instanceof Error ? status.error.message : String(status.error)}</p>
        </section>
      </div>
    );
  }
  const s = status.data;
  if (!s) return <p>加载中…</p>;
  const info = s.files.find((f) => f.path === file);
  return (
    <div data-testid="settings-agent-access">
      <section className="settings-section card">
        <div className="row">
          <div className="grow">
            <h2>让 Agent 使用这个 Vault</h2>
            <p className="hint-text">
              HUHU 在 Vault 里维护三份指南文件，Agent 读到它们就知道如何通过 CLI 与 MCP 使用 HUHU。只操作这三份文件，不会改动 <code>.agents/skills/</code> 下的其他内容。
            </p>
          </div>
          <Badge tone={TONE[s.overall]}>{LABEL[s.overall]}</Badge>
        </div>
        <div className="small muted" data-testid="guide-meta">
          内置版本 {s.version}
          {vaultPath ? ` · ${vaultPath}` : ""}
          {s.readOnly ? " · 只读 Vault，不会写入" : ""}
        </div>
        {error ? (
          <div role="alert" className="callout danger">
            <p>{error}</p>
          </div>
        ) : null}
        {notice ? (
          <div role="status" className="callout">
            <p>{notice}</p>
          </div>
        ) : null}
      </section>

      <section className="settings-section card">
        <h2>
          <FileText size={16} aria-hidden /> 指南文件
        </h2>
        <div className="stack" role="list">
          {s.files.map((f) => (
            <div key={f.path} role="listitem" className="row" data-testid="guide-file" data-status={f.status}>
              <button type="button" className={`btn${f.path === file ? " btn-primary" : ""}`} aria-pressed={f.path === file} onClick={() => setSelected(f.path)}>
                {f.path.replace(".agents/skills/huhu/", "")}
              </button>
              <Badge tone={TONE[f.status]}>{LABEL[f.status]}</Badge>
            </div>
          ))}
        </div>
        {info ? <p className="hint-text">{HINT[info.status]}</p> : null}
        {file ? (
          <>
            <div className="row">
              <Segmented<ViewMode>
                label="查看方式"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "current", label: "当前" },
                  { value: "builtin", label: "内置" },
                  { value: "diff", label: "差异" },
                ]}
              />
              <span className="grow" />
              <Button icon={Copy} onClick={() => void navigator.clipboard.writeText(file)}>
                复制路径
              </Button>
            </div>
            <GuideFileView file={file} mode={mode} />
          </>
        ) : null}
        {s.readOnly ? null : (
          <div className="row">
            <Button data-testid="guide-check" onClick={() => void act("guide.check", {}, "已重新检查")}>
              检查
            </Button>
            <Button data-testid="guide-preserve" disabled={!info || (info.status !== "conflict" && info.status !== "needs-check")} onClick={() => void act("guide.preserve", { path: file }, "已保留当前文件")}>
              保留当前文件
            </Button>
            <Button variant="primary" data-testid="guide-restore" disabled={!info || info.status === "current"} onClick={() => setConfirm(file)}>
              备份并恢复内置版本
            </Button>
          </div>
        )}
        {confirm ? (
          <div className="callout" role="alertdialog" aria-label="确认恢复内置版本">
            <p>
              当前文件会先备份到 <code>.huhu/guide/backups/</code>，再替换为内置版本。
            </p>
            <div className="row">
              <Button
                variant="primary"
                data-testid="guide-restore-confirm"
                onClick={() => {
                  const f = confirm;
                  setConfirm(null);
                  void act("guide.restoreBuiltin", { path: f }, "已备份并恢复内置版本");
                }}
              >
                确认恢复
              </Button>
              <Button onClick={() => setConfirm(null)}>取消</Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="settings-section card">
        <h2>
          <History size={16} aria-hidden /> 备份
        </h2>
        {(backups.data ?? []).length === 0 ? (
          <EmptyState icon={ShieldCheck} title="还没有备份" hint="覆盖指南文件之前，HUHU 会先把当前文件备份在这里。" />
        ) : (
          <div className="stack">
            {(backups.data ?? []).map((b) => (
              <div key={b.id} className="row" data-testid="guide-backup">
                <code className="grow">{b.id}</code>
                <span className="small muted">{b.files.length} 个文件</span>
                {s.readOnly ? null : <Button onClick={() => void act("guide.backups.restore", { id: b.id }, "已恢复这份备份")}>恢复这份备份</Button>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GuideFileView({ file, mode }: { file: string; mode: ViewMode }) {
  const view = useCapability<View>("guide.view", { path: file });
  if (!view.data) return <p>加载中…</p>;
  if (mode === "diff") return <ReviewDiff before={view.data.current ?? ""} after={view.data.builtin} path={view.data.path} />;
  return (
    <pre className="code-block" data-testid="guide-text">
      {(mode === "current" ? view.data.current : view.data.builtin) ?? "（文件不存在）"}
    </pre>
  );
}
