import { Button, PageHead, type PrepareTerminalHandoff, type TerminalViewProps } from "@huhu/ui";
import { host, useEngine } from "@huhu/workbench";
import { useState } from "react";
import type { SshTerminalWindowHost, SshTerminalWindowTarget } from "../shared/terminal-window.js";
import { SshTerminal } from "./SshTerminal.js";

export const terminalHost = () => host() as (SshTerminalWindowHost & ReturnType<typeof host>) | undefined;

export function MovableSshTerminal({ name, visible = true, disabled = false, ...props }: TerminalViewProps & { name: string; visible?: boolean; disabled?: boolean }) {
  const engine = useEngine();
  const open = terminalHost()?.openSshTerminalWindow;
  const [prepare, setPrepare] = useState<PrepareTerminalHandoff>();
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");

  async function move() {
    if (!prepare || !open || moving || !visible) return;
    setMoving(true);
    setError("");
    try {
      const handoffId = crypto.randomUUID();
      if (!await prepare(handoffId)) throw new Error("原终端未能授权输入交接，请重试。");
      await open({ vaultId: engine.vaultId, shellId: props.sessionId, name, handoffId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法打开新的 SSH 终端窗口。");
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="ssh-movable-terminal">
      {visible && <div className="ssh-workspace-controls">
        {open
          ? <Button type="button" disabled={!prepare || moving || props.observe || disabled} onClick={() => void move()}>将终端移至新窗口</Button>
          : <small>Web 端暂不支持将终端移至新窗口。</small>}
      </div>}
      {error && visible && <p role="alert">{error}</p>}
      <SshTerminal {...props} {...(open && { onTerminalHandoff: (next) => {
        setPrepare(() => next);
        props.onTerminalHandoff?.(next);
      } })} />
    </div>
  );
}

export function SshTerminalWindow({ target }: { target: SshTerminalWindowTarget }) {
  const { endpoint } = useEngine();
  return (
    <main className="ssh-movable-terminal ssh-terminal-native-window" data-testid="ssh-terminal-window" data-shell-id={target.shellId}>
      <PageHead title={target.name} />
      <SshTerminal sessionId={target.shellId} baseUrl={endpoint.baseUrl} token={endpoint.token} ariaLabel={`${target.name} 终端`}
        handoffId={target.handoffId} onHandoffControl={() => void terminalHost()?.readySshTerminalWindow(target.handoffId).catch(() => undefined)} />
    </main>
  );
}
