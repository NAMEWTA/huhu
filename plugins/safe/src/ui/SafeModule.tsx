import type { ModuleProps } from "@huhu/workbench";
import { Badge, Button, ChoiceSwitch, DataTable, Dialog, EmptyState, Field, IconButton, PageHead, SearchBox } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { ChevronRight, Copy, Eye, EyeOff, History, Info, KeyRound, Lock, Plus, Settings, Trash2, Unlock as UnlockIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatSecretRef } from "../shared/secret-ref.js";
import { t } from "./i18n.js";

interface Status {
  initialized: boolean;
  locked: boolean;
  corrupt: boolean;
  cooldownSeconds: number;
  autoLockMinutes: number;
  lockOnLeave: boolean;
}
interface Item {
  id: string;
  name: string;
  type: string;
  account: string;
  allowedModules: string[];
}
interface AuditRow {
  at: string;
  action: string;
  itemId: string | null;
  subject: string;
  result: string;
}

const ACTION_TEXT: Record<string, string> = {
  setup: "创建保险箱",
  unlock: "解锁成功",
  "unlock-failed": "解锁失败",
  lock: "锁定",
  reveal: "查看秘密值",
  copy: "复制",
  use: "引用",
  "use-denied": "引用被拒绝",
  update: "保存凭据",
  delete: "删除凭据",
  "change-password": "修改主密码",
};

/** 保险箱（原型 Safe）：凭据双栏 / 访问记录 / 锁定设置；未初始化或锁定时是居中的锁屏。 */
export function SafeModule({ section }: ModuleProps) {
  const engine = useEngine();
  const qc = useQueryClient();
  const status = useCapability<Status>("safe.status", {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
  const [error, setError] = useState<string | null>(null);
  // 自动锁定发生在引擎里（没有事件）：已解锁时定期刷新状态，锁定后界面立即回到锁屏并销毁已显示的明文
  const unlockedNow = status.data ? status.data.initialized && !status.data.locked : false;
  useEffect(() => {
    if (!unlockedNow) return;
    const id = setInterval(() => void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === "safe.status" }), 5000);
    return () => clearInterval(id);
  }, [unlockedNow, qc, engine.vaultId]);
  // “离开页面时锁定”：离开保险箱模块（组件卸载）时锁定
  const leaveRef = useRef(false);
  leaveRef.current = unlockedNow && (status.data?.lockOnLeave ?? false);
  useEffect(
    () => () => {
      if (leaveRef.current)
        void engine
          .call("safe.lock", {}, { write: true })
          .then(() => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId }))
          .catch(() => undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  async function act<T>(capability: string, input: unknown): Promise<T | null> {
    setError(null);
    try {
      const r = await engine.call<T>(capability, input, { write: true });
      await refresh();
      return r;
    } catch (e) {
      setError(e instanceof CapabilityError ? e.message : String(e));
      await refresh();
      return null;
    }
  }
  if (!status.data) return <div className="module-layout" data-testid="safe-module" />;
  const st = status.data;
  const usable = st.initialized && !st.locked && !st.corrupt;
  return (
    <div className="module-layout" data-testid="safe-module">
      <div className="view-content">
        <PageHead
          eyebrow="SECRETS BY REFERENCE"
          title="保险箱"
          description="凭据通过引用传递。秘密的读取与使用应有明确的边界。"
          actions={
            usable ? (
              <Button icon={Lock} onClick={() => void act("safe.lock", {})}>
                {t.lock}
              </Button>
            ) : null
          }
        />
        <div className="system-scroll scroll">
          {st.corrupt ? (
            <div role="alert" className="callout danger">
              <p>keyring 文件损坏，保险箱不可用。</p>
            </div>
          ) : !st.initialized ? (
            <Setup onSetup={(password) => act("safe.setup", { password })} error={error} />
          ) : section === "settings" && !st.locked ? (
            <LockSettings st={st} act={act} error={error} />
          ) : section === "audit" ? (
            <Audit />
          ) : st.locked ? (
            <UnlockScreen onUnlock={(password) => act("safe.unlock", { password })} error={error} cooldown={st.cooldownSeconds} />
          ) : (
            <Unlocked act={act} error={error} />
          )}
        </div>
      </div>
    </div>
  );
}

function Setup({ onSetup, error }: { onSetup(p: string): void; error: string | null }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [ok, setOk] = useState(false);
  const valid = [...pw].length >= 10 && pw === pw2 && ok;
  return (
    <div className="safe-locked" data-testid="safe-setup">
      <div className="safe-lock-icon">
        <Lock size={31} aria-hidden />
      </div>
      <h2>{t.setupTitle}</h2>
      <p role="note">{t.warning}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSetup(pw);
        }}
      >
        <Field label={t.password} error={pw && [...pw].length < 10 ? t.short : undefined}>
          <input type="password" aria-label={t.password} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Field label={t.confirm} error={pw2 && pw !== pw2 && [...pw].length >= 10 ? t.mismatch : undefined}>
          <input type="password" aria-label={t.confirm} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Field>
        <label className="row">
          <input type="checkbox" aria-label={t.understood} checked={ok} onChange={(e) => setOk(e.target.checked)} /> {t.understood}
        </label>
        <Button type="submit" variant="primary" icon={UnlockIcon} disabled={!valid}>
          {t.create}
        </Button>
        {error ? (
          <p role="alert" className="field-error">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function UnlockScreen({ onUnlock, error, cooldown }: { onUnlock(p: string): void; error: string | null; cooldown: number }) {
  const [pw, setPw] = useState("");
  return (
    <div className="safe-locked" data-testid="safe-locked">
      <div className="safe-lock-icon">
        <Lock size={31} aria-hidden />
      </div>
      <h2>{t.lockedTitle}</h2>
      <p>让敏感信息留在它应该在的地方。</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onUnlock(pw);
          setPw("");
        }}
      >
        <Field label={t.password} error={error}>
          <input type="password" aria-label={t.password} autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        {cooldown > 0 ? (
          <p role="alert" className="field-error">
            {t.cooldown}（{cooldown}s）
          </p>
        ) : null}
        <Button type="submit" variant="primary" icon={UnlockIcon} disabled={!pw || cooldown > 0}>
          {t.unlock}
        </Button>
      </form>
    </div>
  );
}

function Unlocked({ act, error }: { act<T>(c: string, i: unknown): Promise<T | null>; error: string | null }) {
  const engine = useEngine();
  const items = useCapability<Item[]>("safe.items.list", {});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const list = (items.data ?? []).filter((i) => `${i.name}${i.account}`.toLowerCase().includes(query.toLowerCase()));
  const current = (items.data ?? []).find((i) => i.id === selectedId) ?? null;
  const reveal = shown[current?.id ?? ""];
  return (
    <div className="safe-grid" data-testid="safe-unlocked">
      <section className="card">
        <div className="card-head">
          <h2>
            {t.items} <Badge>{(items.data ?? []).length}</Badge>
          </h2>
          <IconButton icon={Plus} label={t.newItem} onClick={() => setCreating(true)} data-testid="safe-new" />
        </div>
        <div className="system-pane-search">
          <SearchBox value={query} onChange={setQuery} placeholder="搜索名称或账户…" />
        </div>
        {items.isSuccess && (items.data ?? []).length === 0 ? <EmptyState icon={KeyRound} title={t.empty} /> : null}
        {list.map((it) => (
          <button key={it.id} type="button" className={`secret-row ${it.id === selectedId ? "active" : ""}`} data-testid="safe-item" onClick={() => setSelectedId(it.id)}>
            <KeyRound size={18} aria-hidden />
            <span className="grow">
              <strong>{it.name}</strong>
              <small>
                {it.type} · {it.account || "个人"}
              </small>
            </span>
            <ChevronRight size={14} aria-hidden />
          </button>
        ))}
      </section>
      <section className="card safe-detail">
        {current ? (
          <>
            <div className="card-head">
              <div>
                <Badge>{current.type}</Badge>
                <h2>{current.name}</h2>
              </div>
            </div>
            <div className="stack safe-detail-body">
              <Field label="账户">
                <div className="read-value">{current.account || "未设置"}</div>
              </Field>
              <Field label="秘密值">
                <div className="secret-value">
                  <code data-testid="secret-value">{reveal ?? "••••••••"}</code>
                  <Button
                    onClick={() => {
                      if (reveal !== undefined) setShown(({ [current.id]: _gone, ...rest }) => rest);
                      else void engine.call<{ value: string }>("safe.items.reveal", { id: current.id }).then((r) => setShown((s) => ({ ...s, [current.id]: r.value })));
                    }}
                    icon={reveal !== undefined ? EyeOff : Eye}
                  >
                    {reveal !== undefined ? t.hide : t.show}
                  </Button>
                  <Button
                    icon={Copy}
                    data-testid="secret-copy"
                    onClick={() => {
                      // 复制走独立的审计动作；值只经 huhuHost.copyText 进剪贴板，30 秒后若仍是这段文本则清除
                      void engine
                        .call<{ value: string }>("safe.items.reveal", { id: current.id, purpose: "copy" })
                        .then(async (r) => {
                          const bridge = (globalThis as { huhuHost?: { copyText?(v: string, o?: { clearAfterMs?: number }): Promise<void> } }).huhuHost;
                          if (bridge?.copyText) await bridge.copyText(r.value, { clearAfterMs: 30_000 });
                          else await navigator.clipboard.writeText(r.value);
                          setCopyError(null);
                          setCopied(current.id);
                          setTimeout(() => setCopied((c) => (c === current.id ? null : c)), 30_000);
                        })
                        .catch((e: unknown) => setCopyError(e instanceof Error ? e.message : String(e)));
                    }}
                  >
                    {copied === current.id ? t.copied : t.copy}
                  </Button>
                </div>
              </Field>
              {copyError ? (
                <p role="alert" className="field-error">
                  {copyError}
                </p>
              ) : null}
              <Field label="凭据引用">
                <div className="row">
                  <code className="grow">{formatSecretRef(current.id)}</code>
                  <IconButton icon={Copy} label={t.copyRef} onClick={() => void navigator.clipboard.writeText(formatSecretRef(current.id))} />
                </div>
              </Field>
              <div>
                <div className="small muted">允许引用</div>
                <div className="permission-tags">{current.allowedModules.length === 0 ? <span className="small muted">尚未允许任何模块</span> : current.allowedModules.map((m) => <Badge key={m}>{m}</Badge>)}</div>
              </div>
              <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                {t.delete}
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            icon={KeyRound}
            title="选择一个凭据"
            action={
              <Button icon={Plus} onClick={() => setCreating(true)}>
                {t.newItem}
              </Button>
            }
          />
        )}
      </section>
      {error ? (
        <div role="alert" className="field-error">
          {error}
        </div>
      ) : null}
      {creating ? (
        <ItemDialog
          error={error}
          onClose={() => setCreating(false)}
          onSave={async (v) => {
            const r = await act<Item>("safe.items.save", {
              name: v.name,
              type: v.type,
              ...(v.account ? { account: v.account } : {}),
              value: v.value,
              allowedModules: v.allowed
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            });
            if (r) {
              setCreating(false);
              setSelectedId(r.id);
            }
          }}
        />
      ) : null}
      {confirmDelete && current ? (
        <Dialog
          open
          title="删除凭据"
          description={`删除「${current.name}」后，持有该引用的连接需要重新配置。`}
          error={error}
          onClose={() => setConfirmDelete(false)}
          actions={
            <>
              <Button onClick={() => setConfirmDelete(false)}>取消</Button>
              <Button
                variant="danger"
                onClick={() =>
                  void act("safe.items.delete", { id: current.id }).then(() => {
                    setConfirmDelete(false);
                    setSelectedId(null);
                  })
                }
              >
                删除凭据
              </Button>
            </>
          }
        >
          <p className="confirm-description">秘密值会从 keyring 中移除，无法恢复。</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function ItemDialog({ error, onClose, onSave }: { error: string | null; onClose(): void; onSave(v: { name: string; type: string; account: string; value: string; allowed: string }): Promise<void> }) {
  const [v, setV] = useState({ name: "", type: "token", account: "", value: "", allowed: "" });
  return (
    <Dialog
      open
      title="新增凭据"
      description="秘密值加密保存在 Vault 的 keyring 里；Vault 文件与导出只包含引用。"
      onClose={onClose}
      error={error}
      testId="safe-item-dialog"
      actions={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!v.name.trim() || !v.value} onClick={() => void onSave(v)} data-testid="safe-save">
            保存凭据
          </Button>
        </>
      }
    >
      <form className="form-body" onSubmit={(e) => e.preventDefault()}>
        <Field label={t.itemName}>
          <input autoFocus aria-label={t.itemName} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="类型">
          <select aria-label="类型" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
            <option value="token">Token</option>
            <option value="password">Password</option>
            <option value="ssh-key">SSH Key</option>
            <option value="env">Env</option>
          </select>
        </Field>
        <Field label="用户名 / 账户">
          <input aria-label="用户名 / 账户" value={v.account} onChange={(e) => setV({ ...v, account: e.target.value })} />
        </Field>
        <Field label={t.itemValue}>
          <input type="password" aria-label={t.itemValue} autoComplete="off" value={v.value} onChange={(e) => setV({ ...v, value: e.target.value })} />
        </Field>
        <Field label={t.allowed}>
          <input aria-label={t.allowed} placeholder="agent-cli, ssh" value={v.allowed} onChange={(e) => setV({ ...v, allowed: e.target.value })} />
        </Field>
      </form>
    </Dialog>
  );
}

function Audit() {
  const rows = useCapability<AuditRow[]>("safe.audit.list", { limit: 200 });
  const fmt = (iso: string) => new Date(iso).toLocaleString("zh-CN");
  return (
    <section className="card" data-testid="safe-audit">
      <div className="card-head">
        <h2>凭据访问记录</h2>
      </div>
      {(rows.data ?? []).length ? (
        <DataTable
          label="凭据访问记录"
          rows={(rows.data ?? []).map((a, i) => ({ ...a, key: `${a.at}-${i}` }))}
          rowKey={(a) => a.key}
          rowTestId="safe-audit-row"
          columns={[
            { id: "at", header: "时间", width: 170, className: "mono", cell: (a) => fmt(a.at) },
            { id: "action", header: "动作", width: 140, cell: (a) => ACTION_TEXT[a.action] ?? a.action },
            { id: "item", header: "凭据引用", width: 260, cell: (a) => <code>{a.itemId ? formatSecretRef(a.itemId) : "—"}</code> },
            { id: "subject", header: "主体", width: 160, cell: (a) => a.subject },
            { id: "result", header: "结果", width: 100, cell: (a) => <Badge tone={a.result === "ok" ? "success" : "danger"}>{a.result === "ok" ? "成功" : a.result === "denied" ? "被拒绝" : "失败"}</Badge> },
          ]}
        />
      ) : (
        <EmptyState icon={History} title="暂无访问记录" hint="解锁、查看、复制等操作都会记录，不记录秘密内容。" />
      )}
    </section>
  );
}

function LockSettings({ st, act, error }: { st: Status; act<T>(c: string, i: unknown): Promise<T | null>; error: string | null }) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [note, setNote] = useState<string | null>(null);
  return (
    <div data-testid="safe-settings">
      <section className="settings-section card">
        <h2>锁定策略</h2>
        <div className="setting-row">
          <div>
            <strong>自动锁定</strong>
            <p>在此保险箱页面没有交互达到指定时间后锁定。</p>
          </div>
          <select aria-label="自动锁定" value={String(st.autoLockMinutes)} onChange={(e) => void act("safe.settings.update", { autoLockMinutes: Number(e.target.value) })}>
            {[1, 5, 15, 30].map((m) => (
              <option key={m} value={m}>
                {m} 分钟
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <div>
            <strong>离开页面时锁定</strong>
            <p>离开保险箱后，临时解锁状态立即销毁。</p>
          </div>
          <ChoiceSwitch checked={st.lockOnLeave} onChange={(v) => void act("safe.settings.update", { lockOnLeave: v })} label="离开页面时锁定" />
        </div>
      </section>
      <section className="settings-section card">
        <h2>修改主密码</h2>
        <p>需要先解锁；新主密码至少 10 个字符。忘记主密码无法恢复已保存的秘密。</p>
        <form
          className="form-body"
          onSubmit={(e) => {
            e.preventDefault();
            setNote(null);
            void act("safe.changePassword", { oldPassword: oldPw, newPassword: newPw }).then((r) => {
              if (r) {
                setOldPw("");
                setNewPw("");
                setNote("主密码已修改");
              }
            });
          }}
        >
          <Field label="当前主密码">
            <input type="password" aria-label="当前主密码" autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
          </Field>
          <Field label="新主密码">
            <input type="password" aria-label="新主密码" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </Field>
          <div className="row">
            <Button type="submit" variant="primary" disabled={!oldPw || [...newPw].length < 10}>
              修改主密码
            </Button>
            <Button icon={Settings} variant="ghost" onClick={() => void act("safe.lock", {})}>
              立即锁定
            </Button>
          </div>
        </form>
        {note ? <p role="status">{note}</p> : null}
        {error ? (
          <p role="alert" className="field-error">
            {error}
          </p>
        ) : null}
      </section>
      <div className="callout system-note">
        <Info size={17} aria-hidden />
        <p>访问记录只记录动作、凭据引用与主体，不记录秘密内容。</p>
      </div>
    </div>
  );
}
