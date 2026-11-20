import { Badge, Button, Dialog, Field } from "@huhu/ui";
import { Copy, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { useCapability, useEngine } from "../engine-client/react.js";
import { host } from "../settings/host.js";

type ShareConfig = { mode: "local" | "lan"; port: number };
type Address = { url: string; interfaceName: string | null };
type ShareStatus = { state: "stopped" } | { state: "error"; config: ShareConfig; reason: keyof typeof shareError } | { state: "running"; config: ShareConfig; generation: string; port: number; addresses: Address[] };
type Invitation = { id: string; sessions: number };
type InvitationLinks = { id: string; links: string[] };

const shareError = {
  "port-in-use": "端口已占用。请换一个端口或使用自动端口。",
  "address-unavailable": "当前网络无法使用这个监听范围。",
  "permission-denied": "系统拒绝了此端口的监听。",
  "browser-blocked-port": "浏览器限制了此端口。请使用其他端口。",
  "bind-failed": "无法启动 Web 分享。",
  "assets-unavailable": "当前桌面版本缺少 Web 工作台资源。",
};

export function WebSharePanel() {
  const engine = useEngine();
  const status = useCapability<ShareStatus>("web.share.status");
  const invitations = useCapability<Invitation[]>("web.invitations.list");
  const [mode, setMode] = useState<ShareConfig["mode"]>("local");
  const [portInput, setPortInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<(InvitationLinks & { generation: string }) | null>(null);
  const [revoke, setRevoke] = useState<Invitation | null>(null);
  const [stopping, setStopping] = useState(false);
  const [notice, setNotice] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [error, setError] = useState("");
  const active = status.data?.state === "running" ? status.data : null;
  const generation = active?.generation;
  const port = portInput.trim() === "" ? 0 : Number(portInput);
  const validPort = Number.isInteger(port) && port >= 0 && port <= 65_535;
  const shownLinks = links?.generation === generation ? links : null;
  const sessionRows = active ? (invitations.data ?? []) : [];
  const refetchInvitations = invitations.refetch;
  const refetchStatus = status.refetch;

  useEffect(() => {
    if (!generation) return;
    const timer = setInterval(() => {
      void refetchStatus();
      void refetchInvitations();
    }, 2_000);
    return () => clearInterval(timer);
  }, [generation, refetchStatus, refetchInvitations]);

  async function operation<T>(capability: string, input: unknown = {}, refresh = true): Promise<T | null> {
    if (busy) return null;
    setBusy(true);
    setError("");
    try {
      const response = await engine.call<T>(capability, input, { write: refresh });
      if (refresh) await Promise.all([refetchStatus(), refetchInvitations()]);
      return response;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!validPort) return;
    const next = await operation<ShareStatus>("web.share.start", { mode, port });
    if (next?.state === "running") setNotice(`Web 分享已启动，端口 ${next.port}。`);
  }

  async function stop() {
    const next = await operation<ShareStatus>("web.share.stop");
    if (next?.state !== "stopped") return;
    setStopping(false);
    setLinks(null);
    setNotice("Web 分享已停止，先前邀请已失效。");
  }

  async function showLinks(id?: string) {
    if (!generation) return;
    setCopyStatus("");
    const entry = id ? await operation<InvitationLinks>("web.invitations.get", { id }, false) : await operation<InvitationLinks>("web.invitations.create");
    if (entry) setLinks({ ...entry, generation });
  }

  async function confirmRevoke() {
    if (!revoke) return;
    const result = await operation<{ revoked: boolean }>("web.invitations.revoke", { id: revoke.id });
    if (!result) return;
    if (links?.id === revoke.id) setLinks(null);
    setRevoke(null);
    setNotice(result.revoked ? "已撤销选中的邀请及其浏览器会话。" : "这份邀请已失效。");
  }

  async function copy(link: string) {
    setCopyStatus("");
    try {
      const desktop = host();
      if (desktop?.copyText) await desktop.copyText(link);
      else await navigator.clipboard.writeText(link);
      setCopyStatus("已复制邀请链接。");
    } catch {
      setCopyStatus("剪贴板不可用，可以从链接栏手动复制。");
    }
  }

  return (
    <section className="hu-card-alt hu-stack" aria-labelledby="web-share-title" data-testid="web-share-panel">
      <div className="shell-card-head">
        <h2 id="web-share-title">
          <Globe size={17} aria-hidden /> Web 分享
        </h2>
        <Badge tone={active ? "success" : status.data?.state === "error" ? "danger" : "neutral"}>{active ? "运行中" : status.data?.state === "error" ? "启动失败" : status.isPending ? "正在读取" : "已停止"}</Badge>
      </div>
      {active ? (
        <>
          <div className="row">
            <p>
              {active.config.mode === "lan" ? "局域网" : "仅本机"} · 端口 {active.port}
            </p>
            <Button variant="primary" disabled={busy} onClick={() => void showLinks()}>
              创建邀请
            </Button>
            <Button disabled={busy} onClick={() => setStopping(true)}>
              停止分享
            </Button>
          </div>
          <ul aria-label="访问地址">
            {active.addresses.map(({ url, interfaceName }) => (
              <li key={url}>
                <code>{url}</code> · {interfaceName ?? "本机"}
              </li>
            ))}
          </ul>
          <h3>有效邀请</h3>
          {sessionRows.length ? (
            <ul aria-label="有效邀请">
              {sessionRows.map(({ id, sessions }) => (
                <li className="row" key={id} data-testid="web-invitation-row" data-invitation-id={id}>
                  <code>{id.slice(0, 8)}</code>
                  <span>{sessions} 个会话</span>
                  <Button disabled={busy} onClick={() => void showLinks(id)}>
                    取回链接
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => setRevoke({ id, sessions })}>
                    撤销邀请
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p>暂无有效邀请。</p>
          )}
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <div className="row">
            <Field label="分享范围">
              <select aria-label="分享范围" value={mode} onChange={(event) => setMode(event.target.value === "lan" ? "lan" : "local")}>
                <option value="local">仅本机</option>
                <option value="lan">局域网</option>
              </select>
            </Field>
            <Field label="端口" error={validPort ? null : "请输入 0 到 65535 之间的整数。"}>
              <input aria-label="端口" type="number" min={0} max={65_535} step={1} placeholder="自动" value={portInput} onChange={(event) => setPortInput(event.target.value)} />
            </Field>
            <Button type="submit" variant="primary" loading={busy} disabled={busy || !validPort || status.isPending}>
              启动分享
            </Button>
          </div>
          {mode === "lan" ? <p className="hu-hint-text">持有有效邀请的人可以从同一局域网访问当前工作台。</p> : null}
        </form>
      )}
      <p role="status">{notice}</p>
      {status.data?.state === "error" ? (
        <p role="alert" className="hu-field-error">
          {shareError[status.data.reason]}
        </p>
      ) : null}
      {error && !revoke && !stopping ? (
        <p role="alert" className="hu-field-error">
          {error}
        </p>
      ) : null}
      {status.error ? (
        <p role="alert" className="hu-field-error">
          {status.error.message}
        </p>
      ) : null}
      {active && invitations.error ? (
        <p role="alert" className="hu-field-error">
          {invitations.error.message}
        </p>
      ) : null}
      <Dialog open={!!shownLinks} title="Web 邀请链接" description="同一邀请可以重复打开。撤销后，由它建立的会话会一起断开。" onClose={() => setLinks(null)} actions={<Button onClick={() => setLinks(null)}>完成</Button>}>
        <div className="hu-stack">
          {shownLinks?.links.map((link) => (
            <Field label={new URL(link).host} key={link}>
              <div className="row">
                <input aria-label={`邀请链接 ${new URL(link).host}`} className="grow" value={link} readOnly onFocus={(event) => event.target.select()} />
                <Button icon={Copy} onClick={() => void copy(link)}>
                  复制链接
                </Button>
              </div>
            </Field>
          ))}
          <p role="status">{copyStatus}</p>
        </div>
      </Dialog>
      <Dialog
        open={revoke !== null}
        title="撤销这份邀请"
        onClose={() => {
          if (!busy) setRevoke(null);
        }}
        error={revoke ? error : null}
        actions={
          <>
            <Button disabled={busy} onClick={() => setRevoke(null)}>
              取消
            </Button>
            <Button variant="danger" loading={busy} disabled={busy} onClick={() => void confirmRevoke()}>
              确认撤销
            </Button>
          </>
        }
      >
        <p>
          邀请 {revoke?.id.slice(0, 8)} 对应的 {revoke?.sessions ?? 0} 个浏览器会话将断开。
        </p>
      </Dialog>
      <Dialog
        open={stopping}
        title="停止 Web 分享"
        onClose={() => {
          if (!busy) setStopping(false);
        }}
        error={stopping ? error : null}
        actions={
          <>
            <Button disabled={busy} onClick={() => setStopping(false)}>
              取消
            </Button>
            <Button variant="danger" loading={busy} disabled={busy} onClick={() => void stop()}>
              确认停止
            </Button>
          </>
        }
      >
        <p>此次分享的所有邀请和浏览器会话将失效。</p>
      </Dialog>
    </section>
  );
}
