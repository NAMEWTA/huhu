import { Button, Dialog } from "@huhu/ui";
import { useCapability, useEngine } from "@huhu/workbench";
import { useId, useRef, useState, type FormEvent } from "react";
import type { DeviceProxyState } from "../engine/device-proxy-capabilities.js";
import { hostEndpoint } from "./HostKeyDialog.js";

export function DeviceProxyCommand({ hostId, onClose }: { hostId: string; onClose(): void }) {
  const engine = useEngine();
  const query = useCapability<DeviceProxyState>("ssh.proxyCommand.read", { hostId });
  const state = query.data;
  const approved = state?.approval;
  const form = useId();
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function mutate(action: "approve" | "revoke", input: unknown) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(undefined);
    try {
      await engine.call(`ssh.proxyCommand.${action}`, input, { write: true });
      await query.refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法更新本机代理批准");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state?.supported) return;
    const data = new FormData(event.currentTarget);
    const argumentsText = String(data.get("arguments") ?? "");
    void mutate("approve", {
      hostId,
      expectedRevision: approved?.revision ?? null,
      routeRevision: state.routeRevision,
      command: {
        executable: String(data.get("executable") ?? ""),
        arguments: argumentsText ? argumentsText.split("\n") : [],
      },
    });
  }

  return (
    <Dialog
      open
      title="本机 ProxyCommand"
      error={error ?? null}
      onClose={() => { if (!busy.current) onClose(); }}
      actions={
        <>
          <Button type="button" disabled={saving} onClick={onClose}>返回路由</Button>
          {approved && state.supported ? (
            <Button type="button" disabled={saving} onClick={() => void mutate("revoke", { hostId, expectedRevision: approved.revision })}>撤销本机批准</Button>
          ) : null}
          {state?.supported ? <Button type="submit" form={form} variant="primary" loading={saving}>批准并保存</Button> : null}
        </>
      }
    >
      {query.isPending ? <p role="status">正在读取路由…</p> : null}
      {query.isError ? <p role="alert">无法读取本机代理批准或当前路由。</p> : null}
      {state ? (
        <>
          <p>首跳 {state.firstHop.name} · {state.firstHop.user}@{hostEndpoint(state.firstHop)}</p>
          <p role="status">{approved ? (approved.current ? "本机已批准" : "路由已变更，需要重新批准") : "本机尚未批准"}</p>
          {state.supported ? (
            <form key={approved?.revision ?? "new"} id={form} method="post" className="hu-stack" onSubmit={approve}>
              <p>批准后，下次工作台连接会在这台设备运行指定程序以连接首跳。撤销或替换批准会关闭使用它的连接。</p>
              <label className="hu-field">
                程序绝对路径
                <input autoFocus name="executable" required maxLength={4096} defaultValue={approved?.command.executable} />
              </label>
              <label className="hu-field">
                参数（每行一个）
                <textarea name="arguments" rows={4} maxLength={8192} defaultValue={approved?.command.arguments.join("\n")} />
              </label>
              <p><code>%h</code> 首跳主机 · <code>%p</code> 端口 · <code>%r</code> 用户 · <code>%%</code> 百分号</p>
            </form>
          ) : <p>只有支持本机凭据的可写 Linux 桌面可以批准此功能。</p>}
        </>
      ) : null}
    </Dialog>
  );
}
