import { Button, Dialog, Field } from "@huhu/ui";
import { useEffect, useRef, useState } from "react";
import { useEngine } from "../engine-client/react.js";

/** 全局快速捕获：`Mod+Shift+N` 在任意页面打开，Enter 保存到收件箱（来源由身份决定：桌面界面为 quick），Shift+Enter 换行。 */
export function QuickCapture() {
  const engine = useEngine();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setOpen(true);
        setError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const close = () => {
    setOpen(false);
    setBody("");
    setError(null);
  };
  const submit = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await engine.call("inbox.capture", { body: text }, { write: true });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      title="快速捕获"
      description="写下一个想法，稍后在收件箱里整理。"
      onClose={close}
      testId="quick-capture"
      error={error}
      actions={
        <>
          <Button onClick={close}>取消</Button>
          <Button variant="primary" disabled={busy || body.trim() === ""} data-testid="quick-capture-save" onClick={() => void submit()}>
            收集
          </Button>
        </>
      }
    >
      <Field label="想法">
        <textarea
          ref={area}
          aria-label="快速捕获内容"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />
      </Field>
    </Dialog>
  );
}
