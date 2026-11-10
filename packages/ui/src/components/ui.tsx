import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

/** loading 期间禁止重复触发。 */
export function Button({ variant = "secondary", loading = false, disabled, onClick, className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`hu-btn hu-btn-${variant} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (!loading) onClick?.(e);
      }}
    >
      {loading ? <Loader2 size={16} className="hu-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export interface CompletionCircleProps {
  checked: boolean;
  /** 待 Engine 回执的乐观状态：显示为目标状态但标记 pending。 */
  pending?: boolean;
  label: string;
  onToggle(next: boolean): void;
}

/** 任务完成圆框：键盘可达，aria-checked 反映当前显示状态。 */
export function CompletionCircle({ checked, pending = false, label, onToggle }: CompletionCircleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      aria-busy={pending || undefined}
      data-pending={pending || undefined}
      className="hu-circle"
      onClick={() => onToggle(!checked)}
    >
      {checked ? <span aria-hidden>✓</span> : null}
    </button>
  );
}

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "blue" | "violet";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`hu-badge hu-badge-${tone}`}>{children}</span>;
}

export function Banner({ tone = "warning", children, action }: { tone?: "warning" | "danger" | "blue"; children: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`hu-banner hu-banner-${tone}`}>
      <span>{children}</span>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="hu-empty">
      <strong>{title}</strong>
      {hint ? <span>{hint}</span> : null}
      {action}
    </div>
  );
}
