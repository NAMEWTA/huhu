import { Button, type TerminalInput } from "@huhu/ui";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { hasShortcutControl, MAX_SHORTCUT_TEXT } from "../shared/shortcuts.js";
import { ShortcutPicker } from "./ShortcutPanel.js";

type Target = { id: string; label: string; sessionId: string; send: TerminalInput | undefined };
type Preview = { text: string; targets: Target[]; fromLibrary: boolean };

const INPUT_ERRORS = {
  unavailable: "已失去输入控制，请重新选择目标",
  "control-character": "请移除文本中的终端控制字符",
  "bracketed-paste-required": "当前终端需要单行文本才能插入，也不能接收制表符",
} satisfies Record<Exclude<ReturnType<TerminalInput>, "sent">, string>;

export function TerminalActions({ targets, activeTargetId }: { targets: Target[]; activeTargetId?: string | undefined }) {
  const details = useRef<HTMLDetailsElement>(null);
  const textId = useId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [feedback, setFeedback] = useState("");
  const eligible = targets.filter(({ send }) => Boolean(send));
  const current = eligible.filter(({ id, sessionId }) => selected[id] === sessionId);
  const active = eligible.find(({ id }) => id === activeTargetId) ?? (activeTargetId === undefined && targets.length === 1 ? eligible[0] : undefined);
  const bindingValid = preview?.targets.length === current.length && preview.targets.every((before) => current.some((after) => after.id === before.id && after.sessionId === before.sessionId && after.send === before.send));
  const canApply = Boolean(preview && bindingValid && preview.targets.length > 0);

  useLayoutEffect(() => {
    // A temporary loss of visibility or control must also invalidate the preview after recovery.
    if (preview && !bindingValid) {
      setPreview(undefined);
      setFeedback("目标已变化，请重新预览。");
    }
  }, [bindingValid, preview]);

  function clearPreview() {
    setPreview(undefined);
    setFeedback("");
  }

  function choose(next: Record<string, string>) {
    setSelected(next);
    setFeedback("");
    setPreview(preview?.fromLibrary ? { ...preview, targets: eligible.filter(({ id, sessionId }) => next[id] === sessionId) } : undefined);
  }

  function apply(enter: boolean) {
    if (!details.current?.open || !canApply || !preview) {
      setFeedback("目标已变化，请重新预览。");
      return;
    }
    const disallowed = hasShortcutControl(preview.text);
    const outcome = preview.targets.map(({ label, send }) => {
      const result = disallowed ? "control-character" : (send?.(preview.text, enter) ?? "unavailable");
      return result === "sent" ? `${label} 已${enter ? "发送" : "插入"}` : `${label} 未接收，${INPUT_ERRORS[result]}`;
    });
    setPreview(undefined);
    setFeedback(outcome.join("。") + "。");
  }

  return (
    <details
      ref={details}
      className="hu-card-alt hu-stack"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (!event.currentTarget.open) clearPreview();
      }}
    >
      <summary
        onClick={() => {
          if (details.current?.open) clearPreview();
        }}
      >
        快捷文本与广播
      </summary>
      {open && (
        <ShortcutPicker
          onSelect={(entry) => {
            setText(entry.text);
            setPreview({ text: entry.text, targets: current, fromLibrary: true });
            setFeedback("");
          }}
        />
      )}
      <fieldset className="hu-stack">
        <legend>可见目标</legend>
        <div className="ssh-workspace-controls">
          <Button
            type="button"
            disabled={!active}
            onClick={() => {
              if (active) choose({ [active.id]: active.sessionId });
            }}
          >
            当前分栏
          </Button>
          <Button type="button" disabled={!eligible.length} onClick={() => choose(Object.fromEntries(eligible.map(({ id, sessionId }) => [id, sessionId])))}>
            全部可输入分栏
          </Button>
        </div>
        {targets.length === 0 && <p>当前没有可输入的可见分栏。</p>}
        {targets.map(({ id, label, sessionId, send }) => (
          <label className="row" key={id}>
            <input
              type="checkbox"
              checked={Boolean(send && selected[id] === sessionId)}
              disabled={!send}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                choose({ ...selected, [id]: checked ? sessionId : "" });
              }}
            />
            {label}
            {send ? "" : " · 无输入控制"}
          </label>
        ))}
      </fieldset>
      <label className="hu-field" htmlFor={textId}>
        快捷文本
        <textarea
          id={textId}
          rows={3}
          value={text}
          maxLength={MAX_SHORTCUT_TEXT}
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
          setPreview({ text, targets: current, fromLibrary: false });
          setFeedback("");
        }}
      >
        预览
      </Button>
      {preview && (
        <>
          {preview.targets.length > 0 && <p>{preview.targets.map(({ label }) => label).join("、")}</p>}
          <pre role="region" aria-label="快捷文本预览" tabIndex={0}>
            <code>{preview.text}</code>
          </pre>
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
