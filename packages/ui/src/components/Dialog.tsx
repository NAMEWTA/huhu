import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "./ui.js";

export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** Esc 或点右上角关闭。点背景不关闭（表单里误点会丢草稿）。 */
  onClose(): void;
  children: ReactNode;
  /** 底部操作区（按钮）。 */
  actions?: ReactNode;
  testId?: string;
  wide?: boolean;
  /** 对话框内操作失败的提示：显示在对话框里（页面上的提示会被遮罩盖住）。 */
  error?: string | null | undefined;
}

/** 模态对话框（原型 .modal 结构）：基于原生 <dialog>，焦点陷阱、Esc、背景惰性由浏览器提供。 */
export function Dialog({ open, title, description, onClose, children, actions, testId, wide = false, error }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const opener = document.activeElement as HTMLElement | null;
    if (open && !d.open) {
      d.showModal();
      // 焦点进入第一个表单控件（没有就保持在对话框内）；关闭后回到打开它的按钮
      d.querySelector<HTMLElement>(".hu-modal-body input:not([type=hidden]), .hu-modal-body textarea, .hu-modal-body select")?.focus();
    }
    if (!open && d.open) d.close();
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className={`hu-modal${wide ? " shell-modal-wide" : ""}`}
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault(); // 由 open 状态统一关闭，避免 DOM 与状态不一致
        onClose();
      }}
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
