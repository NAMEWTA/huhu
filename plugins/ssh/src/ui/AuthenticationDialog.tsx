import { Button, Dialog } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useId, useRef, useState, type FormEvent } from "react";
import type { SshAuthenticationPrompt } from "../shared/trust.js";
import { hostEndpoint } from "./HostKeyDialog.js";

export function AuthenticationDialog({ prompt, onClose, onAnswered }: { prompt: SshAuthenticationPrompt; onClose(): void; onAnswered(): void | Promise<unknown> }) {
  const engine = useEngine();
  const formId = useId();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [alternate, setAlternate] = useState<"password" | "keyboard-interactive">("password");

  async function answer(answers: string[] | null) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const { attemptId, hop, promptId } = prompt;
      const result = await engine.call<{ applied: boolean }>("ssh.authentication.answer", { attemptId, hop, promptId, answers }, { write: true });
      if (!result.applied) setError("此认证提示已失效。");
      await onAnswered();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法提交认证回答。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (prompt.recovery) {
      void answer(alternate === "password" ? [alternate, String(form.get("password") ?? "")] : [alternate]);
      return;
    }
    void answer(prompt.questions.map((_, index) => String(form.get(String(index)) ?? "")));
  }
  return (
    <Dialog
      open
      title={prompt.recovery ? "恢复本机 SSH 身份" : "SSH 交互认证"}
      description={`目标 ${prompt.target.name} · 第 ${prompt.hop + 1} 跳 ${hostEndpoint(prompt.server)}`}
      onClose={() => {
        if (!inFlight.current) onClose();
      }}
      actions={
        <>
          <Button disabled={busy} onClick={onClose}>
            稍后回答
          </Button>
          <Button disabled={busy} onClick={() => void answer(null)}>
            取消连接
          </Button>
          <Button form={formId} type="submit" loading={busy} variant="primary">
            提交回答
          </Button>
        </>
      }
    >
      <form id={formId} method="post" className="hu-form-body" onSubmit={submit}>
        {prompt.name && <p>{prompt.name}</p>}
        {prompt.instructions && <p>{prompt.instructions}</p>}
        {prompt.recovery ? <>
          <label className="hu-field">
            替代凭据
            <select value={alternate} disabled={busy} onChange={(event) => setAlternate(event.currentTarget.value === "password" ? "password" : "keyboard-interactive")}>
              <option value="password">一次性密码</option>
              <option value="keyboard-interactive">服务器交互认证</option>
            </select>
          </label>
          {alternate === "password" && <label className="hu-field">
            一次性密码
            <input name="password" type="password" autoComplete="off" maxLength={4096} required disabled={busy} />
          </label>}
        </> : prompt.questions.map(({ text, echo }, index) => (
          <label key={index} className="hu-field">
            <span>{text || `认证问题 ${index + 1}`}</span>
            <input name={String(index)} type={echo ? "text" : "password"} autoComplete="off" maxLength={4096} disabled={busy} />
          </label>
        ))}
        {error && <p role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
