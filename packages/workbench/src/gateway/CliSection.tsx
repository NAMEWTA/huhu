import { Button } from "@huhu/ui";
import { SquareTerminal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { tCli as c } from "../i18n/zh-CN.js";
import { host } from "../settings/host.js";

interface Status {
  supported: boolean;
  reason?: string;
  installed: boolean;
  method: "symlink" | "path";
  location: string;
  onPath: boolean;
}

/** 网关 → 命令行：安装状态；点击并确认后创建符号链接（macOS/Linux）或加入用户 PATH（Windows）；常用命令速查。 */
export function CliSection() {
  const h = host();
  const [st, setSt] = useState<Status | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const load = useCallback(async () => {
    try {
      setSt((await h?.cliStatus()) as Status);
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }, [h]);
  useEffect(() => {
    void load();
  }, [load]);
  async function run(fn: () => Promise<unknown>, after?: (s: Status) => string) {
    setMsg(null);
    try {
      const s = (await fn()) as Status;
      setSt(s);
      setConfirm(false);
      setMsg({ kind: "ok", text: after ? after(s) : c.done });
    } catch (e) {
      setMsg({ kind: "error", text: (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, "") });
    }
  }
  return (
    <section data-testid="cli-section" aria-label={c.title}>
      <div className="hu-card-alt hu-gateway-overview">
        <div className="row">
          <span className="shell-plugin-large-icon">
            <SquareTerminal size={24} aria-hidden />
          </span>
          <div className="grow">
            <h2>{c.title}</h2>
            <p>结构化 JSON · 稳定退出码 · 脚本与 MCP 共享同一套能力</p>
          </div>
          {st && st.supported ? (
            confirm ? null : st.installed ? (
              <Button onClick={() => void run(() => h!.cliUninstall())} data-testid="cli-uninstall">
                {c.uninstall}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setConfirm(true)} data-testid="cli-install">
                {c.install}
              </Button>
            )
          ) : null}
        </div>
        {!h?.cliStatus ? (
          <p className="hu-hint-text">{c.hostOnly}</p>
        ) : !st ? (
          <p>…</p>
        ) : (
          <>
            <p data-testid="cli-state">
              {st.installed ? c.installed : c.notInstalled}
              {st.location ? ` · ${st.location}` : ""}
            </p>
            {!st.supported ? (
              <p className="hu-hint-text" data-testid="cli-unsupported">
                {st.reason ?? c.devOnly}
              </p>
            ) : (
              <>
                {st.installed && st.method === "symlink" && !st.onPath ? (
                  <p role="status" className="hu-hint-text">
                    {c.notOnPath(st.location.replace(/[\\/][^\\/]*$/, ""))}
                  </p>
                ) : null}
                {st.installed && st.method === "path" ? <p className="hu-hint-text">{c.restartTerminal}</p> : null}
                {confirm ? (
                  <div role="alertdialog" aria-label={c.confirmInstall} data-testid="cli-confirm" className="hu-callout">
                    <div>
                      <p>{st.method === "symlink" ? c.symlink(st.location) : c.pathMethod(st.location)}</p>
                      <div className="row">
                        <Button variant="primary" onClick={() => void run(() => h.cliInstall())} data-testid="cli-confirm-yes">
                          {c.confirmInstall}
                        </Button>
                        <Button onClick={() => setConfirm(false)}>{c.cancel}</Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
        {msg ? (
          <div role={msg.kind === "error" ? "alert" : "status"} className={msg.kind === "error" ? "hu-field-error" : "hu-hint-text"} data-testid="cli-msg">
            {msg.text}
          </div>
        ) : null}
      </div>
      <div className="shell-card-head">
        <h2>{c.quick}</h2>
      </div>
      <div className="shell-cli-suggestions">
        {c.cheat.map((l) => (
          <button key={l} type="button" onClick={() => void navigator.clipboard.writeText(l)} title="点击复制">
            <code>{l}</code>
          </button>
        ))}
      </div>
    </section>
  );
}
