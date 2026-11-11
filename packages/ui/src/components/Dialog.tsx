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
}

/** 模态对话框（原型 .modal 结构）：基于原生 <dialog>，焦点陷阱、Esc、背景惰性由浏览器提供。 */
export function Dialog({ open, title, description, onClose, children, actions, testId, wide = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? " modal-wide" : ""}`}
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault(); // 由 open 状态统一关闭，避免 DOM 与状态不一致
        onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <IconButton icon={X} label="关闭" onClick={onClose} />
      </div>
      <div className="modal-body">{children}</div>
      {actions ? <div className="modal-footer">{actions}</div> : null}
    </dialog>
  );
}
