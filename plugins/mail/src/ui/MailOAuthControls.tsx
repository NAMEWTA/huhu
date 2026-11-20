import { Button } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine } from "@huhu/workbench";
import { useEffect, useRef, useState } from "react";
import type { OAuthProvider } from "../engine/oauth-provider.js";

type Availability = { host: string; gmail: boolean; outlook: boolean };
type Status = { sessionId: string; host: string; phase: "waiting" | "finishing" | "configured" | "failed" | "cancelled" | "expired" | "unknown"; reason?: string; accountId?: string; route?: "imap"; smtp?: boolean };
const reasons: Record<string, string> = {
  "not-configured": "此主机尚未配置该服务的授权客户端。",
  "browser-unavailable": "无法在 Engine 主机上打开系统浏览器。",
  cancelled: "授权已取消。",
  expired: "授权已过期，可以重新授权。",
  denied: "邮箱服务拒绝了授权。",
  "identity-invalid": "无法核验邮箱服务的账号响应。",
  "address-mismatch": "浏览器中登录的邮箱与填写的地址不一致。",
  "permission-missing": "服务未提供 IMAP 所需的权限。",
  "graph-metadata-only": "Microsoft Graph 仅返回邮件基本权限，无法读取正文或附件，也不能用于 IMAP。",
  "wrong-resource": "Microsoft Graph 授权无法用于 Outlook IMAP 或 SMTP。",
  "protocol-unavailable": "服务已授权，但无法连接 IMAP 或读取所选目录，请检查服务端的协议设置。",
  reauthorize: "服务未提供可长期使用的凭据，请重新授权。",
  "account-changed": "邮箱已变化，请重新打开账号再授权。",
  "commit-unconfirmed": "授权提交结果待核实。请到邮箱账号列表检查当前配置。",
};
const failure = "邮箱授权未完成，请重试。";

export function MailOAuthControls({
  input,
  valid,
  onSaved,
}: {
  input: { provider: OAuthProvider; email: string; label: string; smtp: boolean; repair?: { accountId: string; expectedRevision: string } };
  valid(): boolean;
  onSaved(accountId: string): void;
}) {
  const engine = useEngine();
  const availability = useCapability<Availability>("mail.oauth.availability");
  const [status, setStatus] = useState<Status>();
  const [feedback, setFeedback] = useState("");
  const [starting, setStarting] = useState(false);
  const attempt = useRef<AbortController | null>(null);
  const session = useRef<string | null>(null);
  const saved = useRef(onSaved);
  saved.current = onSaved;
  const active = status?.phase === "waiting" || status?.phase === "finishing";
  function cancel(id: string) {
    return engine.call<Status>("mail.oauth.cancel", { sessionId: id }, { write: true });
  }

  useEffect(
    () => () => {
      attempt.current?.abort();
      const id = session.current;
      session.current = null;
      if (id) void engine.call("mail.oauth.cancel", { sessionId: id }, { write: true }).catch(() => undefined);
    },
    [engine],
  );

  useEffect(() => {
    if (!status || status.sessionId !== session.current || status.phase !== "configured" || !status.accountId) return;
    session.current = null;
    saved.current(status.accountId);
  }, [status]);

  useEffect(() => {
    if (!active || !status) return;
    const controller = new AbortController();
    const tick = setTimeout(() => {
      void engine.call<Status>("mail.oauth.status", { sessionId: status.sessionId }, { signal: controller.signal }).then(
        (result) => {
          if (controller.signal.aborted) return;
          setFeedback("");
          setStatus((current) => (current === status ? result : current));
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          const disappeared = error instanceof CapabilityError && error.code === "NOT_FOUND";
          setFeedback(disappeared ? "授权会话已结束，请重新授权。" : "暂时无法读取授权状态。");
          setStatus((current) => (current === status ? { ...status, ...(disappeared && { phase: "failed" }) } : current));
        },
      );
    }, 750);
    return () => {
      clearTimeout(tick);
      controller.abort();
    };
  }, [active, engine, status]);

  async function begin() {
    if (attempt.current || !valid()) return;
    const controller = new AbortController();
    attempt.current = controller;
    setStarting(true);
    setStatus(undefined);
    setFeedback("");
    try {
      const result = await engine.call<Status>("mail.oauth.begin", input, { write: true, signal: controller.signal });
      if (controller.signal.aborted) {
        await cancel(result.sessionId).catch(() => undefined);
        return;
      }
      session.current = result.sessionId;
      setStatus(result);
    } catch (error) {
      if (!controller.signal.aborted) setFeedback(error instanceof CapabilityError ? (reasons[String(error.details?.reason)] ?? failure) : failure);
    } finally {
      if (attempt.current === controller) attempt.current = null;
      if (!controller.signal.aborted) setStarting(false);
    }
  }

  const host = status?.host ?? availability.data?.host;
  const ready = availability.data?.[input.provider];
  const text = active ? (status.phase === "waiting" ? `请在 ${host} 的系统浏览器中完成授权。` : "正在核验邮箱身份和 IMAP 访问。") : status?.reason ? (reasons[status.reason] ?? failure) : "";
  return (
    <div>
      {availability.isError ? <p>暂时无法读取主机的授权配置。</p> : ready === false ? <p>{host} 尚未配置此授权客户端。</p> : null}
      {input.provider === "outlook" && <p>此授权用于 Outlook IMAP 和 SMTP。Microsoft Graph 权限需要独立授权。</p>}
      <Button type="button" disabled={!ready || active} loading={starting} onClick={() => void begin()}>
        {input.repair ? "在系统浏览器重新授权" : "在系统浏览器授权"}
      </Button>
      {active && (
        <Button
          type="button"
          onClick={() =>
            void cancel(status.sessionId).then(
              (result) => {
                if (session.current !== result.sessionId) return;
                setFeedback("");
                setStatus((current) => (current?.sessionId === result.sessionId ? result : current));
              },
              () => {
                if (session.current === status.sessionId) setFeedback("无法取消授权，请重试。");
              },
            )
          }
        >
          取消授权
        </Button>
      )}
      <p role="status">{feedback || text}</p>
    </div>
  );
}
