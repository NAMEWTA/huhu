import { Button, Dialog } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine } from "@huhu/workbench";
import { useEffect, useId, useRef, useState } from "react";
import type { MailAiApproval, MailAiSettings } from "../engine/ai-settings.js";
import { mailAiExcerptLimit, mailAiModeLabels, mailAiModes, mailAiQuestionLimit, type MailAiMode } from "../mail-ai.js";

export function MailAiAssistant({ body, onAdopt }: { body: string; onAdopt(text: string, trigger: HTMLButtonElement | null): void }) {
  const engine = useEngine();
  const { data: settings } = useCapability<MailAiSettings>("mail.ai.getSettings");
  const [open, setOpen] = useState(false);
  const [approval, setApproval] = useState<MailAiApproval>();
  const [mode, setMode] = useState<MailAiMode>("summary");
  const [excerpt, setExcerpt] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<string>();
  const [destination, setDestination] = useState<Pick<MailAiApproval, "endpoint" | "model">>();
  const [busy, setBusy] = useState<"prepare" | "chat">();
  const [error, setError] = useState("");
  const source = useRef<HTMLTextAreaElement>(null);
  const output = useRef<HTMLParagraphElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const active = useRef<AbortController>(null);
  const selectionHelp = useId();
  const canOpen = settings?.available && settings.enabled && (settings.endpoint.startsWith("http:") || settings.keyState === "configured");
  useEffect(() => () => active.current?.abort(), [engine]);
  useEffect(() => {
    if (result !== undefined) output.current?.focus();
  }, [result]);

  function close() {
    active.current?.abort();
    active.current = null;
    setOpen(false);
    setBusy(undefined);
    setApproval(undefined);
    setDestination(undefined);
    setMode("summary");
    setExcerpt("");
    setQuestion("");
    setResult(undefined);
    setError("");
  }

  async function call<T>(phase: "prepare" | "chat", input: unknown, update: (response: T) => void) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(phase);
    setError("");
    try {
      const response = await engine.call<T>(`mail.ai.${phase}`, input, { signal: controller.signal, write: true });
      if (!controller.signal.aborted) update(response);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof CapabilityError ? reason.message : "邮件 AI 暂时不可用，请重试。");
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(undefined);
      }
    }
  }

  function prepare() {
    void call<MailAiApproval>("prepare", {}, (confirmed) => {
      setApproval(confirmed);
      setDestination(confirmed);
    });
  }

  function start() {
    setOpen(true);
    prepare();
  }

  function select() {
    const field = source.current;
    if (!field) return;
    const selection = field.value.slice(field.selectionStart, field.selectionEnd);
    setExcerpt(selection.length <= mailAiExcerptLimit && selection.trim() ? selection : "");
    setError(selection.length > mailAiExcerptLimit ? `请选择不超过 ${mailAiExcerptLimit} 个字符的片段。` : selection.trim() ? "" : "请先选中文本。");
  }

  function confirm() {
    if (!approval || !excerpt || (mode === "chat" && !question.trim()) || active.current) return;
    setApproval(undefined);
    void call<{ text: string }>("chat", { approvalId: approval.approvalId, confirmed: true, excerpt, mode, ...(mode === "chat" && { question }) }, ({ text }) => setResult(text));
  }

  return (
    <>
      <button type="button" className="hu-btn" ref={trigger} disabled={!canOpen} onClick={start}>
        邮件 AI
      </button>
      <Dialog
        open={open}
        wide
        title={result === undefined ? "选择交给 AI 的内容" : "邮件 AI 结果"}
        error={error}
        onClose={close}
        actions={
          <>
            <Button type="button" onClick={close}>
              {result === undefined ? "取消" : "关闭结果"}
            </Button>
            {result === undefined &&
              (approval || busy === "chat" ? (
                <Button type="button" variant="primary" loading={busy === "chat"} disabled={!excerpt || (mode === "chat" && !question.trim())} onClick={confirm}>
                  同意发送所示内容
                </Button>
              ) : (
                <Button type="button" loading={busy === "prepare"} onClick={prepare}>
                  核对服务地址
                </Button>
              ))}
            {result !== undefined && mode === "reply" && (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  close();
                  onAdopt(result, trigger.current);
                }}
              >
                采纳为草稿
              </Button>
            )}
          </>
        }
      >
        {destination && (
          <p className="hu-mail-ai-text">
            目标服务 · {destination.endpoint} · {destination.model}
          </p>
        )}
        <p role="status">{busy === "prepare" ? "正在读取已保存的目的地…" : busy === "chat" ? "等待邮件 AI 回复…" : result !== undefined ? "邮件 AI 已返回文本。" : ""}</p>
        {result === undefined ? (
          <div className="hu-mail-form">
            <p className="hu-mail-help" id={selectionHelp}>
              选中正文片段后，选择「采用所选片段」。发送前请核对下面的内容和目的地。
            </p>
            <label>
              正文选取区
              <textarea className="hu-input" ref={source} rows={5} readOnly value={body} aria-describedby={selectionHelp} />
            </label>
            <div>
              <Button type="button" disabled={busy === "chat"} onClick={select}>
                采用所选片段
              </Button>
            </div>
            <label>
              操作
              <select
                className="hu-input"
                disabled={busy === "chat"}
                value={mode}
                onChange={(event) => {
                  const choice = mailAiModes.find((item) => item === event.currentTarget.value);
                  if (choice) setMode(choice);
                }}
              >
                {mailAiModes.map((item) => (
                  <option key={item} value={item}>
                    {mailAiModeLabels[item]}
                  </option>
                ))}
              </select>
            </label>
            {mode === "chat" && (
              <label>
                一并发送的问题
                <textarea className="hu-input" rows={2} value={question} maxLength={mailAiQuestionLimit} disabled={busy === "chat"} onChange={(event) => setQuestion(event.currentTarget.value)} />
              </label>
            )}
            {excerpt && (
              <label>
                将发送的邮件片段
                <textarea className="hu-input" rows={4} readOnly value={excerpt} />
              </label>
            )}
          </div>
        ) : (
          <p className="hu-mail-plain hu-mail-ai-text" tabIndex={-1} ref={output}>
            {result}
          </p>
        )}
      </Dialog>
    </>
  );
}
