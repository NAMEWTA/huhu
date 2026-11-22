import { Button, Dialog } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useId, useState } from "react";

interface Review {
  ruleVersion: string;
  target: string | null;
  command: string;
  shell: "powershell" | "sh";
  executable?: string;
  unavailableReason?: string;
  space: { root: string };
  names: string[];
  approvalId: string | null;
}

export function TerminalApproval({ ruleId }: { ruleId: string }) {
  const engine = useEngine();
  const form = useId();
  const hint = useId();
  const unavailableHint = useId();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const names = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const valid = names.length > 0 && names.length <= 64 && new Set(names).size === names.length && names.every((name) => /^HUHU_RULE_SECRET_[A-Z0-9_]{1,80}$/.test(name));
  const canApprove = !!review?.target && !review.unavailableReason;
  const shellLabel = review?.shell === "sh" ? "sh 命令" : "PowerShell 命令";

  async function inspect() {
    setOpen(true);
    setReview(null);
    setNotice("");
    setError("");
    setBusy(true);
    try {
      const current = await engine.call<Review>("automations.terminal.approval.review", { ruleId });
      setReview(current);
      setInput(current.names.join("\n"));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "无法读取批准目标。");
    } finally {
      setBusy(false);
    }
  }

  async function save(action: "approve" | "revoke") {
    if (!review || busy) return;
    if (action === "approve" && !canApprove) return;
    setBusy(true);
    setError("");
    try {
      if (action === "revoke") {
        await engine.call("automations.terminal.approval.revoke", { ruleId, expectedApprovalId: review.approvalId }, { write: true });
        setNotice("已撤销本机批准。");
      } else {
        await engine.call("automations.terminal.approval.approve", { ruleId, expectedRuleVersion: review.ruleVersion, target: review.target, names, expectedApprovalId: review.approvalId }, { write: true });
        setNotice("已批准本机手动使用。可在工具设置中分别开放所需能力。");
      }
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "无法确认批准状态。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => void inspect()}>管理 CLI / MCP 授权</Button>
      <p role="status">{notice}</p>
      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="终端规则的外部授权"
        error={error}
        actions={
          <>
            {review?.approvalId ? (
              <Button disabled={busy} variant="danger" onClick={() => void save("revoke")}>
                撤销批准
              </Button>
            ) : null}
            <Button disabled={busy} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" form={form} disabled={!canApprove || !valid || busy} aria-describedby={review?.unavailableReason ? unavailableHint : undefined}>
              批准这条规则
            </Button>
          </>
        }
      >
        {review ? (
          <form
            id={form}
            className="hu-form-body"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) void save("approve");
            }}
          >
            <p>开放相应工具后，CLI 和 MCP 可以运行这条已批准的命令，并替换或清除下列变量的保护值。请核对命令如何使用这些值。</p>
            {review.unavailableReason ? (
              <p id={unavailableHint} role="status">
                {review.unavailableReason}
              </p>
            ) : null}
            <dl>
              <dt>{shellLabel}</dt>
              <dd>
                <pre className="hu-tw-source-preview" aria-label={shellLabel} role="region" tabIndex={0}>
                  <code>{review.command}</code>
                </pre>
              </dd>
              {review.executable ? (
                <div>
                  <dt>解释器</dt>
                  <dd>
                    <code>{review.executable}</code>
                  </dd>
                </div>
              ) : null}
              <dt>工作目录</dt>
              <dd>
                <code>{review.space.root}</code>
              </dd>
            </dl>
            <label className="hu-field">
              <span className="hu-field-label">批准的变量名</span>
              <textarea required readOnly={review.names.length > 0} rows={3} value={input} aria-describedby={hint} onChange={(event) => setInput(event.target.value)} />
            </label>
            <p id={hint}>每行一个，以 HUHU_RULE_SECRET_ 开头。名称只能包含大写英文字母、数字和下划线。</p>
          </form>
        ) : busy ? (
          <p>正在读取命令和工作目录…</p>
        ) : null}
      </Dialog>
    </>
  );
}
