import { Button, Dialog } from "@huhu/ui";
import { useCapability, useEngine } from "@huhu/workbench";
import { useId, useState } from "react";
import { TerminalApproval } from "./TerminalApproval.js";

type AuthState = "unconfigured" | "configured" | "temporarily-unavailable" | "needs-reconfiguration" | "corrupt";
type Environment = { revision: string | null; names: string[]; localAvailable: boolean; targetChanged: boolean; states: Record<string, AuthState> };
const stateText: Record<AuthState, string> = {
  unconfigured: "未配置",
  configured: "已配置",
  "temporarily-unavailable": "暂不可用",
  "needs-reconfiguration": "需重新配置",
  corrupt: "配置损坏",
};

export function TerminalEnvironment({ ruleId, showExternalApproval }: { ruleId: string; showExternalApproval: boolean }) {
  const engine = useEngine();
  const info = useCapability<Environment>("automations.terminal.environment.get", { ruleId });
  const form = useId();
  const [edit, setEdit] = useState<{ mode: "replace" | "clear"; name: string; revision: string | null } | null>(null);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const configuration = info.data;
  const valid = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) && (edit?.mode === "clear" || value !== "");

  function open(mode: "replace" | "clear", name = "") {
    if (!configuration?.localAvailable) return;
    setEdit({ mode, name, revision: configuration.revision });
    setName(name);
    setValue("");
    setError("");
  }

  function close() {
    setValue("");
    setEdit(null);
  }

  async function save() {
    if (!edit || busy || !configuration || !valid) return;
    setBusy(true);
    setError("");
    try {
      const names = configuration.names.includes(name) ? configuration.names : [...configuration.names, name];
      const reconfigure = configuration.targetChanged || configuration.states[name] === "needs-reconfiguration";
      const change = edit.mode === "clear" ? { name, action: "clear" } : { name, action: "replace", value, ...(reconfigure && { reconfigure: true }) };
      await engine.call("automations.terminal.environment.save", { ruleId, names, expectedRevision: edit.revision, changes: [change] }, { write: true });
      setNotice(edit.mode === "clear" ? "已清除本机值。" : "规则环境已保存。");
      close();
      await info.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "无法确认规则环境已保存。");
      await info.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="automations-rule-linked">
      <h3>受保护环境</h3>
      {info.error ? <p role="alert">{info.error.message}</p> : null}
      {configuration?.targetChanged ? <p role="status">命令或工作目录已更改，请重新配置。</p> : null}
      {configuration && !configuration.localAvailable ? <p>当前 Vault 无法使用本机保护。</p> : null}
      {configuration?.names.map((name) => (
        <div key={name} className="row">
          <code>{name}</code>
          <span>{stateText[configuration.states[name] ?? "unconfigured"]}</span>
          <Button disabled={!configuration.localAvailable} onClick={() => open("replace", name)}>
            配置 {name}
          </Button>
          <Button disabled={!configuration.localAvailable || configuration.states[name] === "unconfigured"} onClick={() => open("clear", name)}>
            清除 {name}
          </Button>
        </div>
      ))}
      {configuration?.localAvailable ? <Button onClick={() => open("replace")}>添加受保护变量</Button> : null}
      {configuration?.localAvailable && showExternalApproval ? <TerminalApproval ruleId={ruleId} /> : null}
      <p role="status">{notice}</p>
      <Dialog
        open={edit !== null}
        title={edit?.mode === "clear" ? "清除受保护变量" : "配置受保护变量"}
        onClose={() => !busy && close()}
        error={error}
        actions={
          <>
            <Button disabled={busy} onClick={close}>
              取消
            </Button>
            <Button type="submit" form={form} loading={busy} disabled={!valid} variant={edit?.mode === "clear" ? "danger" : "primary"}>
              {edit?.mode === "clear" ? "确认清除" : "保存配置"}
            </Button>
          </>
        }
      >
        <form
          id={form}
          className="hu-form-body"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {edit?.mode === "clear" ? (
            <p>清除 {name} 的本机值，下次运行前需要重新配置。</p>
          ) : (
            <>
              <label className="hu-field">
                <span className="hu-field-label">变量名</span>
                <input value={name} maxLength={128} pattern="[A-Za-z_][A-Za-z0-9_]*" readOnly={!!edit?.name} required onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="hu-field">
                <span className="hu-field-label">受保护值</span>
                <input value={value} type="password" autoComplete="new-password" required onChange={(event) => setValue(event.target.value)} />
              </label>
            </>
          )}
        </form>
      </Dialog>
    </section>
  );
}
