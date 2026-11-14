import { Badge, Button, IconButton } from "@huhu/ui";
import { AlertCircle, BookOpen, ChevronRight, FileText, Folder, FolderOpen, HardDrive, Plus, Upload } from "lucide-react";
import { useState } from "react";
import { BrandLogo, BrandMark } from "../shell/BrandMark.js";
import { host, type VaultHostState, type VaultOpenResult } from "../settings/host.js";

/**
 * 启动页（未打开 Vault）：原型 vault.jsx 的结构——品牌区 + 打开卡片。
 * 目录选择与 Engine 的启停都在 Main 里完成；这里只发起并显示结果（失败原因 + 重新选择 / 只读打开）。
 */
export function LaunchPage({ state, onOpened }: { state: VaultHostState; onOpened(): void }) {
  const h = host();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code: string; target: string } | null>(state.error ? { message: state.error, code: "INTERNAL", target: "" } : null);
  if (!h) return <p>需要在桌面应用里使用。</p>;

  async function run(label: string, target: string | null, go: (t: string) => Promise<VaultOpenResult>): Promise<void> {
    if (!target) return;
    setError(null);
    try {
      const r = await go(target);
      if (r.ok) onOpened();
      else setError({ message: r.message, code: r.code, target });
    } catch (e) {
      setError({ message: `${label}失败：${e instanceof Error ? e.message : String(e)}`, code: "INTERNAL", target });
    }
  }
  const vault = h.vault;
  // 原生对话框打开期间也算忙碌，避免连点弹出两个对话框
  const guarded = (f: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await f();
    } finally {
      setBusy(false);
    }
  };
  const openFolder = guarded(async () => run("打开", await h.pickOpenPath("directory"), (t) => vault.open(t, { kind: "open" })));
  const openDemo = guarded(async () => run("打开示例", await h.pickOpenPath("directory"), (t) => vault.openDemo(t)));
  const newBlank = guarded(async () => run("新建", await h.pickOpenPath("directory"), (t) => vault.open(t, { kind: "new" })));
  const importPkg = guarded(async () => {
    const zip = await h.pickOpenPath("zip");
    if (!zip) return;
    await run("导入", await h.pickOpenPath("directory"), (t) => vault.importPackage(zip, t));
  });
  const openRecent = (p: string) => guarded(() => run("打开", p, (t) => vault.open(t, { kind: "open" })))();
  const openReadOnly = (target: string) => guarded(() => run("只读打开", target, (t) => vault.open(t, { kind: "open", readOnly: true })))();

  return (
    <div className="shell-vault-launch" data-testid="vault-launch">
      <header className="shell-vault-launch-bar">
        <div className="brand">
          <BrandMark className="shell-brand-mark" />
          <span>
            huhu<span className="shell-brand-suffix">workbench</span>
          </span>
        </div>
        <Badge>Electron</Badge>
      </header>
      <main className="shell-vault-launch-main">
        <aside className="shell-vault-launch-intro">
          <div className="shell-vault-illustration">
            <BrandLogo />
            <div>
              <span>你的文件</span>
              <span>始终属于你</span>
            </div>
          </div>
          <h1>
            打开文件夹。
            <br />
            进入你的工作台。
          </h1>
          <p>一个 Vault，一套属于你的数据。Markdown 保存笔记、任务与档案，JSON 保存配置。即使离开 huhu，也可以继续使用它们。</p>
          <div className="shell-vault-intro-points">
            <div>
              <FileText size={15} aria-hidden />
              <span>笔记保留在普通文件目录中</span>
            </div>
            <div>
              <HardDrive size={15} aria-hidden />
              <span>领域数据与设置统一位于 .huhu/</span>
            </div>
            <div>
              <BookOpen size={15} aria-hidden />
              <span>索引随时可从文件重建</span>
            </div>
          </div>
          <div className="shell-vault-local-note">
            <span className="shell-status-dot" />
            <span>
              当前为桌面文件模式
              <br />
              <small>选择目录后写回该 Vault，不建立全局用户数据仓库。</small>
            </span>
          </div>
        </aside>
        <section className="shell-vault-launch-card">
          <div className="shell-vault-card-heading">
            <div>
              <h2>打开你的知识库</h2>
              <p>{state.recent.length ? "本次运行中打开过的 Vault" : "从已有目录开始，或先体验完整的示例。"}</p>
            </div>
            <FolderOpen size={20} aria-hidden />
          </div>
          <div className="shell-vault-recents">
            {state.recent.map((r) => (
              <div className="hu-vault-recent" key={r.path}>
                <button type="button" className="shell-vault-recent-open" data-testid="vault-recent" disabled={busy} onClick={() => void openRecent(r.path)}>
                  <span className="shell-vault-file-icon">
                    <Folder size={19} aria-hidden />
                  </span>
                  <span className="grow">
                    <strong>{r.name}</strong>
                    <small>{r.path}</small>
                  </span>
                  <ChevronRight size={15} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <div className="hu-vault-launch-actions">
            <Button variant="primary" icon={FolderOpen} disabled={busy} data-testid="vault-open" onClick={() => void openFolder()}>
              {busy ? "正在读取…" : "打开 Vault 文件夹"}
            </Button>
            <Button icon={BookOpen} disabled={busy} data-testid="vault-demo" onClick={() => void openDemo()}>
              打开示例 Vault
            </Button>
            <div className="hu-vault-secondary-actions">
              <Button icon={Plus} disabled={busy} data-testid="vault-new" onClick={() => void newBlank()}>
                新建空白 Vault
              </Button>
              <Button icon={Upload} disabled={busy} data-testid="vault-import" onClick={() => void importPkg()}>
                导入数据包
              </Button>
            </div>
          </div>
          <p className="shell-vault-privacy">
            最近记录仅留在本次运行。关闭应用后不保存目录列表。
            <br />
            新建、导入和示例需要选择一个空目录。
          </p>
          {error ? (
            <div className="hu-callout danger shell-vault-launch-error" role="alert" data-testid="vault-error">
              <AlertCircle size={16} aria-hidden />
              <div>
                {error.message}
                <div className="row">
                  <button type="button" className="text-link" onClick={() => void openFolder()}>
                    重新选择目录
                  </button>
                  {error.code === "READ_ONLY_VAULT" && error.target ? (
                    <button type="button" className="text-link" data-testid="vault-readonly" onClick={() => void openReadOnly(error.target)}>
                      以只读方式打开
                    </button>
                  ) : null}
                  <IconButton icon={AlertCircle} label="关闭提示" onClick={() => setError(null)} />
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </main>
      <footer className="shell-vault-launch-footer">
        <span>huhu · 插件优先的个人工作台</span>
        <span>Markdown + JSON 为原始数据 · 数据随 Vault 迁移</span>
      </footer>
    </div>
  );
}
