import { Badge, Button, Dialog } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useRef, useState } from "react";
import type { HostKeyPrompt } from "../shared/trust.js";

export const hostEndpoint = ({ host, port }: { host: string; port: number }) => `${host.includes(":") ? `[${host}]` : host}:${port}`;

export function HostKeyDialog({ prompt, changed, onClose, onReview, onRefresh }: { prompt: HostKeyPrompt; changed: boolean; onClose(): void; onReview(): void; onRefresh(): Promise<unknown> }) {
  const engine = useEngine();
  const answering = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(accept: boolean, remember: boolean) {
    if (answering.current) return;
    answering.current = true;
    setBusy(true);
    setError(null);
    try {
      const { applied } = await engine.call<{ applied: boolean }>("ssh.hostKey.decide", { attemptId: prompt.attemptId, hop: prompt.hop, promptId: prompt.promptId, accept, remember }, { write: true });
      await onRefresh();
      if (applied) onClose();
      else setError("这次指纹提示已失效，请查看当前连接状态。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法发送指纹决定，请核对当前连接状态。");
    } finally {
      answering.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={changed ? "主机密钥发生变化" : "首次连接：确认主机身份"}
      description={changed ? "已阻断本次连接。请通过独立渠道核对该跳的主机身份。" : "请通过独立渠道核对服务器指纹，再决定是否信任。"}
      testId="hostkey-dialog"
      onClose={() => {
        if (!answering.current) onClose();
      }}
      error={error}
      actions={
        changed ? (
          <>
            <Button autoFocus onClick={onClose}>
              关闭提示
            </Button>
            <Button variant="primary" onClick={onReview}>
              到已知主机复核
            </Button>
          </>
        ) : (
          <>
            <Button autoFocus disabled={busy} onClick={onClose}>
              稍后核对
            </Button>
            <Button disabled={busy} onClick={() => void answer(false, false)}>
              拒绝并取消
            </Button>
            <Button disabled={busy} onClick={() => void answer(true, false)}>
              仅本次信任
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void answer(true, true)}>
              信任并连接
            </Button>
          </>
        )
      }
    >
      <div className="hu-stack ssh-host-key">
        <Badge tone={changed ? "danger" : "warning"}>{changed ? "连接已阻断" : "等待核对"}</Badge>
        <dl className="ssh-key-details">
          <dt>连接目标</dt>
          <dd>
            {prompt.target.name} · {hostEndpoint(prompt.target)}
          </dd>
          <dt>第 {prompt.hop + 1} 跳</dt>
          <dd>
            {prompt.server.name} · {hostEndpoint(prompt.server)}
          </dd>
          <dt>服务器指纹</dt>
          <dd>
            <code>{prompt.fingerprint}</code> <span className="muted">{prompt.keyType}</span>
          </dd>
          {changed ? (
            <>
              <dt>已保存指纹</dt>
              <dd>
                {prompt.recorded.map((fingerprint) => (
                  <code key={fingerprint}>{fingerprint}</code>
                ))}
              </dd>
            </>
          ) : null}
        </dl>
      </div>
    </Dialog>
  );
}
