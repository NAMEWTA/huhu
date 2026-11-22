import { Button, type TerminalInput } from "@huhu/ui";
import { useState } from "react";

type Target = { id: string; label: string; sessionId: string; send: TerminalInput | undefined };

const INPUT_ERRORS = {
  unavailable: "已失去输入控制，请重新选择目标",
  "control-character": "请移除文本中的终端控制字符",
  "bracketed-paste-required": "当前终端需要单行文本才能插入，也不能接收制表符",
} satisfies Record<Exclude<ReturnType<TerminalInput>, "sent">, string>;

export function TerminalActions({ targets }: { targets: Target[] }) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ text: string; targets: Target[] }>();
  const [feedback, setFeedback] = useState("");
  const current = targets.filter((item) => item.send && selected[item.id] === item.sessionId);
  const canApply = preview && preview.targets.every((before) => current.some((after) => after.id === before.id && after.sessionId === before.sessionId && after.send === before.send));

  function clearPreview() {
    setPreview(undefined);
    setFeedback("");
  }

  function apply(enter: boolean) {
    if (!canApply || !preview) {
      setFeedback("目标已变化，请重新预览。");
      return;
    }
    const outcome = preview.targets.map(({ label, send }) => {
      const result = send?.(preview.text, enter) ?? "unavailable";
      return result === "sent" ? `${label} 已${enter ? "发送" : "插入"}` : `${label} 未接收，${INPUT_ERRORS[result]}`;
    });
    setPreview(undefined);
    setFeedback(outcome.join("。") + "。");
  }

  return (
    <details className="hu-card-alt hu-stack">
      <summary>快捷文本与广播</summary>
      <fieldset className="hu-stack">
        <legend>可见目标</legend>
        {targets.length === 0 && <p>当前没有可输入的可见分栏。</p>}
        {targets.map(({ id, label, sessionId, send }) => (
          <label className="row" key={id}>
            <input
              type="checkbox"
              checked={Boolean(send && selected[id] === sessionId)}
              disabled={!send}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setSelected((current) => ({ ...current, [id]: checked ? sessionId : "" }));
                clearPreview();
              }}
            />
            {label}
            {send ? "" : " · 无输入控制"}
          </label>
        ))}
      </fieldset>
      <label className="hu-field">
        快捷文本
        <textarea
          rows={3}
          value={text}
          maxLength={8192}
          onChange={(event) => {
            setText(event.currentTarget.value);
            clearPreview();
          }}
        />
      </label>
      <Button
        type="button"
        disabled={!text || !current.length}
        onClick={() => {
          setPreview({ text, targets: current });
          setFeedback("");
        }}
      >
        预览
      </Button>
      {preview && (
        <>
          <p>{preview.targets.map(({ label }) => label).join("、")}</p>
          <pre>{preview.text}</pre>
          <div className="ssh-workspace-controls">
            <Button type="button" disabled={!canApply} onClick={() => apply(false)}>
              插入
            </Button>
            <Button type="button" disabled={!canApply} onClick={() => apply(true)}>
              发送并回车
            </Button>
          </div>
        </>
      )}
      <p role="status">{feedback}</p>
    </details>
  );
}
