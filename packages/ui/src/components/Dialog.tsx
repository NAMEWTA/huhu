import { X } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { IconButton } from "./ui.js";

export interface DialogProps {
  open: boolean;
  title: string;
  ariaLabel?: string;
  description?: string;
  /** Esc 或点右上角关闭。点背景不关闭（表单里误点会丢草稿）。 */
  onClose(): void;
  children: ReactNode;
  /** 底部操作区（按钮）。 */
  actions?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  testId?: string;
  className?: string;
  wide?: boolean;
  dismissOnBackdrop?: boolean;
  /** 对话框内操作失败的提示：显示在对话框里（页面上的提示会被遮罩盖住）。 */
  error?: string | null | undefined;
}

/** 模态对话框（原型 .modal 结构）：基于原生 <dialog>，焦点陷阱、Esc、背景惰性由浏览器提供。 */
export function Dialog({ open, title, ariaLabel, description, onClose, children, actions, initialFocusRef, returnFocusRef, testId, className, wide = false, dismissOnBackdrop = false, error }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [present, setPresent] = useState(open);
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    const previousFocus = d.ownerDocument.activeElement;
    const invoker = returnFocusRef?.current ?? previousFocus;
    if (open && !d.open) {
      d.showModal();
      const initial = initialFocusRef?.current ??
        d.querySelector<HTMLElement>(".hu-modal-body input:not([type=hidden]), .hu-modal-body textarea, .hu-modal-body select");
      initial?.focus();
    }
    if (!open && d.open) d.close();
    setPresent(open);
    return () => {
      if (!open) return;
      if (d.open) d.close();
      // Native focus return can miss a dialog removed in this commit or an async invoker that lost focus before showModal().
      queueMicrotask(() => {
        const active = d.ownerDocument.activeElement;
        if (!d.open && invoker instanceof HTMLElement && invoker.isConnected
          && active !== invoker && (active === d.ownerDocument.body || active === previousFocus || d.contains(active))) {
          invoker.focus();
        }
      });
    };
  }, [open, initialFocusRef, returnFocusRef]);
  if (!open && !present) return null;
  return (
    <dialog
      ref={ref}
      className={`hu-modal${wide ? " shell-modal-wide" : ""}${className ? ` ${className}` : ""}`}
      aria-labelledby={ariaLabel ? undefined : titleId}
      aria-label={ariaLabel}
      data-testid={testId}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault(); // 由 open 状态统一关闭，避免 DOM 与状态不一致
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
      }}
      onPointerDown={dismissOnBackdrop ? (event) => {
        if (event.target !== event.currentTarget) return;
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) onClose();
      } : undefined}
    >
      <div className="hu-modal-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <IconButton icon={X} label="关闭" onClick={onClose} />
      </div>
      <div className="hu-modal-body">
        {error ? (
          <p role="alert" className="hu-field-error">
            {error}
          </p>
        ) : null}
        {children}
      </div>
      {actions ? <div className="hu-modal-footer">{actions}</div> : null}
    </dialog>
  );
}
