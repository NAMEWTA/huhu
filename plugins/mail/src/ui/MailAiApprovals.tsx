import { Button, Dialog } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine, useEngineEvents } from "@huhu/workbench";
import { useState } from "react";
import type { MailAiReview } from "../engine/ai-settings.js";
import { mailAiModeLabels } from "../mail-ai.js";

export function MailAiApprovals({ readOnly }: { readOnly: boolean }) {
  const engine = useEngine();
  const pending = useCapability<{ requests: MailAiReview[] }>("mail.ai.approvals.review", {}, { enabled: !readOnly });
  const [request, setRequest] = useState<MailAiReview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requests = pending.data?.requests ?? [];
  useEngineEvents((event) => {
    if (readOnly) return;
    if (event.type === "entity.changed" && "kind" in event.payload && ["mail-ai-approval", "mail-account", "mail-cache", "tool-access"].includes(String(event.payload.kind))) void pending.refetch();
  });

  function close() {
    if (busy) return;
    setRequest(undefined);
    setError("");
  }

  async function decide(action: "approve" | "cancel") {
    if (!request || busy || readOnly) return;
    setBusy(true);
    setError("");
    try {
      const { approvalId, digest } = request;
      await engine.call(`mail.ai.approvals.${action}`, { approvalId, digest }, { write: true });
      setRequest(undefined);
      void pending.refetch();
    } catch (cause) {
      setError(cause instanceof CapabilityError ? cause.message : "无法更新邮件 AI 请求。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!readOnly && requests.length > 0 && (
        <Button type="button" onClick={() => setRequest(requests[0])}>
          待确认的邮件 AI 请求（{requests.length}）
        </Button>
      )}
      <Dialog
        open={request !== undefined}
        title="核对外部工具的邮件 AI 请求"
        description="批准后，该工具可以将下方片段和问题向所示服务发送一次。"
        error={error}
        wide
        onClose={close}
        actions={
          <>
            <Button type="button" disabled={busy} onClick={close}>
              稍后处理
            </Button>
            <Button type="button" disabled={busy || readOnly} onClick={() => void decide("cancel")}>
              拒绝请求
            </Button>
            <Button type="button" variant="primary" disabled={busy || readOnly} onClick={() => void decide("approve")}>
              批准一次发送
            </Button>
          </>
        }
      >
        {request && (
          <dl className="hu-mail-form">
            <div>
              <dt>邮箱与目录</dt>
              <dd>
                {request.email} · {request.source.folder}
              </dd>
            </div>
            <div>
              <dt>服务与模型</dt>
              <dd className="hu-mail-plain">
                {request.endpoint} · {request.model}
              </dd>
            </div>
            <div>
              <dt>操作</dt>
              <dd>{mailAiModeLabels[request.mode]}</dd>
            </div>
            <div>
              <dt>将发送的正文片段</dt>
              <dd className="hu-mail-plain">{request.excerpt}</dd>
            </div>
            {request.question && (
              <div>
                <dt>将发送的问题</dt>
                <dd className="hu-mail-plain">{request.question}</dd>
              </div>
            )}
          </dl>
        )}
      </Dialog>
    </>
  );
}
