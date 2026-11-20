import type { ModuleProps } from "@huhu/workbench";
import { EVENT_PAYLOADS } from "@huhu/contracts";
import { Badge, Button, DataTable, EmptyState, Field, PageHead } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine, useEngineEvents, useQueryClient } from "@huhu/workbench";
import { History, Lock, Settings, Unlock as UnlockIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatSecretRef } from "../shared/secret-ref.js";
import { PersonalWorkspace } from "./PersonalWorkspace.js";
import { t } from "./i18n.js";

interface Status {
  initialized: boolean;
  locked: boolean;
  corrupt: boolean;
  cooldownSeconds: number;
  autoLockMinutes: number;
  lockOnLeave: boolean;
  corruptFile?: "keyring.json" | "manifest.json";
  instanceId: string;
  generation: number;
}
type Session = Pick<Status, "instanceId" | "generation">;

function invalidates(session: Session, locked: Session): boolean {
  return session.instanceId === locked.instanceId && session.generation <= locked.generation;
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
  "reveal-account": "显示账号密码",
  "create-entry": "新建条目",
  "update-entry": "编辑条目",
  "update-account": "编辑账号",
  "create-tag": "新建标签",
  "update-tag": "编辑标签",
  "delete-tag": "删除标签",
  copy: "复制",
  use: "引用",
  "use-denied": "引用被拒绝",
  update: "保存凭据",
  delete: "删除凭据",
  "change-password": "修改主密码",
};

/** 保险箱（原型 Safe）：凭据双栏 / 访问记录；锁定策略与主密码在设置页的“保险箱”里；未初始化或锁定时是居中的锁屏。 */
export function SafeModule(props: ModuleProps) {
  const engine = useEngine();
  if (!engine.endpoint.token) {
    return (
      <div className="hu-module-layout" data-testid="safe-module">
        <div className="hu-view-content">
          <PageHead title="保险箱" />
          <div className="shell-system-scroll hu-scroll">
            <div className="hu-callout shell-system-note" role="note">
              <p>请在桌面工作台管理个人账号。</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return <DesktopSafe key={`${engine.vaultId}:${engine.endpoint.baseUrl}`} {...props} />;
}

function DesktopSafe({ section, onNavigate }: ModuleProps) {
  const engine = useEngine();
  const qc = useQueryClient();
  const status = useCapability<Status>("safe.status", {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
  const [error, setError] = useState<string | null>(null);
  const [lastLock, setLastLock] = useState<Session | null>(null);
  const [locking, setLocking] = useState(false);
  useEngineEvents((event) => {
    if (event.type !== "safe.locked" || event.vaultId !== engine.vaultId || !status.data) return;
    const lock = EVENT_PAYLOADS["safe.locked"].safeParse(event.payload);
    if (lock.success && invalidates(status.data, lock.data)) setLastLock(lock.data);
  });
  const locked = !status.data || status.data.locked || (lastLock !== null && invalidates(status.data, lastLock));
  const unlockedNow = !!status.data?.initialized && !locked;
  // 事件流断开时仍定期读取真实锁定状态。
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
          .call("safe.lock", { reason: "leave" }, { write: true })
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
  if (!status.data) return <div className="hu-module-layout" data-testid="safe-module" />;
  const st = status.data;
  const usable = unlockedNow && !st.corrupt && !locking;
  async function lockNow() {
    setLocking(true);
    try {
      await act("safe.lock", {});
    } finally {
      setLocking(false);
    }
  }
  return (
    <div className="hu-module-layout" data-testid="safe-module">
      <div className="hu-view-content">
        <PageHead
          title="保险箱"
          description="管理网站和应用的个人账号。"
          actions={
            <>
              {onNavigate ? (
                <Button icon={Settings} data-testid="safe-open-settings" onClick={() => onNavigate("settings", "safe")}>
                  设置
                </Button>
              ) : null}
              {usable ? (
                <Button icon={Lock} onClick={() => void lockNow()}>
                  {t.lock}
                </Button>
              ) : null}
            </>
          }
        />
        <div className="shell-system-scroll hu-scroll">
          {st.corrupt ? (
            <div role="alert" className="hu-callout danger">
              <p>{st.corruptFile ?? "keyring.json"} 文件损坏，保险箱不可用。</p>
            </div>
          ) : !st.initialized ? (
            <Setup onSetup={(password) => act("safe.setup", { password })} error={error} />
          ) : locking ? (
            <p role="status">正在锁定保险箱…</p>
          ) : section === "audit" ? (
            <Audit />
          ) : locked ? (
            <UnlockScreen onUnlock={(password) => act("safe.unlock", { password })} error={error} cooldown={st.cooldownSeconds} />
          ) : (
            <>
              {error ? (
                <p role="alert" className="hu-field-error">
                  {error}
                </p>
              ) : null}
              <PersonalWorkspace
                key={`${st.instanceId}:${st.generation}`}
                instanceId={st.instanceId}
                generation={st.generation}
                onLock={() => void lockNow()}
                onSessionEnded={() => {
                  setLastLock(st);
                  void status.refetch();
                }}
              />
            </>
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
    <div className="hu-safe-locked" data-testid="safe-setup">
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
          <p role="alert" className="hu-field-error">
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
    <div className="hu-safe-locked" data-testid="safe-locked">
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
          <p role="alert" className="hu-field-error">
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

function Audit() {
  const rows = useCapability<AuditRow[]>("safe.audit.list", { limit: 200 });
  const fmt = (iso: string) => new Date(iso).toLocaleString("zh-CN");
  return (
    <section className="hu-card-alt" data-testid="safe-audit">
      <div className="shell-card-head">
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
            {
              id: "item",
              header: "记录 ID",
              width: 260,
              cell: (a) => <code>{a.itemId ? (a.action.endsWith("-entry") || a.action.endsWith("-account") || a.action.endsWith("-tag") ? a.itemId : formatSecretRef(a.itemId)) : "—"}</code>,
            },
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
