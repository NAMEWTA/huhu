import { Button, ChoiceSwitch, Field } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { Info, Settings } from "lucide-react";
import { useState } from "react";

interface Status {
  initialized: boolean;
  locked: boolean;
  corrupt: boolean;
  autoLockMinutes: number;
  lockOnLeave: boolean;
}

/** 保险箱设置页（safe 插件）：锁定策略与主密码。 */
export function SafeSettingsPage() {
  const engine = useEngine();
  const qc = useQueryClient();
  const status = useCapability<Status>("safe.status", {});
  const [error, setError] = useState<string | null>(null);
  async function act<T>(capability: string, input: unknown): Promise<T | null> {
    setError(null);
    try {
      const r = await engine.call<T>(capability, input, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
      return r;
    } catch (e) {
      setError(e instanceof CapabilityError ? e.message : String(e));
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
      return null;
    }
  }
  const st = status.data;
  if (!st) return <div data-testid="safe-settings" />;
  if (st.corrupt || !st.initialized || st.locked)
    return (
      <div data-testid="safe-settings">
        <div className="hu-callout shell-system-note">
          <Info size={17} aria-hidden />
          <p>{st.corrupt ? "keyring 文件损坏，保险箱不可用。" : !st.initialized ? "保险箱尚未初始化，请先在保险箱模块里设置主密码。" : "保险箱已锁定，请先在保险箱模块里解锁，再修改这些设置。"}</p>
        </div>
      </div>
    );
  return <LockSettings st={st} act={act} error={error} />;
}

function LockSettings({ st, act, error }: { st: Status; act<T>(c: string, i: unknown): Promise<T | null>; error: string | null }) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [note, setNote] = useState<string | null>(null);
  return (
    <div data-testid="safe-settings">
      <section className="hu-settings-section hu-card-alt">
        <h2>锁定策略</h2>
        <div className="hu-setting-row">
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
        <div className="hu-setting-row">
          <div>
            <strong>离开页面时锁定</strong>
            <p>离开保险箱后，临时解锁状态立即销毁。</p>
          </div>
          <ChoiceSwitch checked={st.lockOnLeave} onChange={(v) => void act("safe.settings.update", { lockOnLeave: v })} label="离开页面时锁定" />
        </div>
      </section>
      <section className="hu-settings-section hu-card-alt">
        <h2>修改主密码</h2>
        <p>需要先解锁；新主密码至少 10 个字符。忘记主密码无法恢复已保存的秘密。</p>
        <form
          className="hu-form-body"
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
          <p role="alert" className="hu-field-error">
            {error}
          </p>
        ) : null}
      </section>
      <div className="hu-callout shell-system-note">
        <Info size={17} aria-hidden />
        <p>访问记录只记录动作、凭据引用与主体，不记录秘密内容。</p>
      </div>
    </div>
  );
}
