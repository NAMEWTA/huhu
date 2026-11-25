import { Button, Dialog } from "@huhu/ui";
import { useCapability, useEngine, useEngineEvents } from "@huhu/workbench";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { parseQuickEndpoint } from "../shared/quick-connection.js";
import type { ConnectionStatus, HostKeyPrompt } from "../shared/trust.js";
import { AuthenticationDialog } from "./AuthenticationDialog.js";
import { HostKeyDialog } from "./HostKeyDialog.js";
import { SshTerminal } from "./SshTerminal.js";

type QuickStatus = { status: ConnectionStatus; shellId?: string } | null;

export function QuickConnectionDialog({ initial, onClose, onReview }: {
  initial: string;
  onClose(): void;
  onReview(prompt: HostKeyPrompt): void;
}) {
  const engine = useEngine();
  const form = useId();
  const hint = useId();
  const owner = useRef<string | undefined>(undefined);
  const [endpoint, setEndpoint] = useState(parseQuickEndpoint(initial) ? initial : "");
  const [session, setSession] = useState<{ id: string; hostId: string }>();
  const [dismissed, setDismissed] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const request = useCapability<QuickStatus>("ssh.quickConnections.status", { id: session?.id }, { enabled: Boolean(session) });
  const status = request.data?.status;
  const shellId = request.data?.shellId;
  const failed = status?.state === "failed" ? status.message : status?.state === "key-changed" ? "该主机的密钥已变更，需要核对新指纹。" : undefined;
  const prompt = status?.state === "waiting" || status?.state === "key-changed" ? status.prompt : undefined;
  const authentication = status?.state === "auth-waiting" ? status.authPrompt : undefined;
  const ended = Boolean(session && request.data === null);

  useEngineEvents((event) => {
    if (session && event.type === "ssh.connectionChanged" && "hostId" in event.payload && event.payload.hostId === session.hostId) void request.refetch();
  });
  useEffect(() => () => {
    const id = owner.current;
    owner.current = undefined;
    if (id) void engine.call("ssh.quickConnections.close", { id }, { write: true }).catch(() => undefined);
  }, [engine]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (owner.current) return;
    if (!parseQuickEndpoint(endpoint)) {
      setError("请输入 user@host[:port] 格式的 SSH 目标。");
      return;
    }
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const id = crypto.randomUUID();
    owner.current = id;
    setBusy(true);
    setError(undefined);
    try {
      const { hostId } = await engine.call<{ hostId: string }>("ssh.quickConnections.start", { id, endpoint, ...(password && { password }) }, { write: true });
      if (owner.current === id) setSession({ id, hostId });
      else await engine.call("ssh.quickConnections.close", { id }, { write: true });
    } catch (failure) {
      if (owner.current === id) {
        setError(failure instanceof Error ? failure.message : "无法启动临时连接。");
        try {
          await engine.call("ssh.quickConnections.close", { id }, { write: true });
          if (owner.current === id) owner.current = undefined;
        } catch {
          // Keep the ID so the close action can retry cleanup.
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function release(after: () => void) {
    const id = owner.current;
    if (!id) return after();
    try {
      await engine.call("ssh.quickConnections.close", { id }, { write: true });
      if (owner.current === id) owner.current = undefined;
      after();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "无法关闭临时连接，请重试。");
    }
  }

  return (
    <>
      <Dialog
        open
        wide={Boolean(shellId)}
        title="快速连接"
        onClose={() => void release(onClose)}
        error={error ?? null}
        actions={
          <>
            <Button type="button" onClick={() => void release(onClose)}>{session || busy ? "结束临时连接" : "取消"}</Button>
            {!session ? <Button type="submit" form={form} variant="primary" loading={busy}>连接</Button> : null}
            {failed || ended ? <Button type="button" onClick={() => void release(() => { setSession(undefined); setDismissed(undefined); setError(undefined); })}>重新输入</Button> : null}
          </>
        }
      >
        {!session ? (
          <form id={form} method="post" className="hu-stack" onSubmit={(event) => void submit(event)}>
            <label className="hu-field">
              SSH 目标
              <input name="endpoint" value={endpoint} maxLength={400} required aria-describedby={hint} onChange={(event) => setEndpoint(event.currentTarget.value)} disabled={busy} />
            </label>
            <p id={hint}>格式为 user@host[:port]，IPv6 地址用方括号。目标和密码仅用于本次连接。</p>
            <label className="hu-field">
              密码（可选）
              <input name="password" type="password" autoComplete="off" maxLength={4096} disabled={busy} />
            </label>
          </form>
        ) : shellId ? (
          <div className="ssh-console-panel" style={{ height: "52vh" }}>
            <SshTerminal baseUrl={engine.endpoint.baseUrl} token={engine.endpoint.token} sessionId={shellId} ariaLabel="临时 SSH 终端" />
          </div>
        ) : (
          <>
            {request.isError ? <p role="alert">无法读取临时连接状态。</p> : null}
            {failed ? <p role="alert">{failed}</p> : null}
            {!failed && !request.isError ? <p role="status">{ended ? "临时连接已结束。" : "正在连接…"}</p> : null}
            {prompt && prompt.promptId === dismissed ? <Button type="button" onClick={() => setDismissed(undefined)}>核对主机指纹</Button> : null}
            {authentication && authentication.promptId === dismissed ? <Button type="button" onClick={() => setDismissed(undefined)}>回答认证提示</Button> : null}
          </>
        )}
      </Dialog>
      {prompt && prompt.promptId !== dismissed ? (
        <HostKeyDialog
          key={prompt.promptId}
          prompt={prompt}
          changed={status?.state === "key-changed"}
          onClose={() => setDismissed(prompt.promptId)}
          onReview={() => void release(() => onReview(prompt))}
          onRefresh={request.refetch}
        />
      ) : null}
      {authentication && authentication.promptId !== dismissed ? (
        <AuthenticationDialog key={authentication.promptId} prompt={authentication} onClose={() => setDismissed(authentication.promptId)} onAnswered={request.refetch} />
      ) : null}
    </>
  );
}
