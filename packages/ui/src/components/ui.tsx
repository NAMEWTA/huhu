import { CheckCircle2, Circle, Loader2, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: LucideIcon;
}

/** loading 期间禁止重复触发。 */
export function Button({ variant = "secondary", loading = false, icon: Icon, disabled, onClick, className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`btn${variant === "secondary" ? "" : ` btn-${variant}`} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (!loading) onClick?.(e);
      }}
    >
      {loading ? <Loader2 size={14} className="hu-spin" aria-hidden /> : Icon ? <Icon size={14} aria-hidden /> : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  /** 无障碍名称，同时作为悬停提示。 */
  label: string;
  size?: number;
}

/** 图标按钮（原型 .icon-btn，32×32）：只有图标，所以必须给 label。 */
export function IconButton({ icon: Icon, label, size = 16, className = "", ...rest }: IconButtonProps) {
  return (
    <button type="button" {...rest} className={`icon-btn ${className}`.trim()} aria-label={label} title={label}>
      <Icon size={size} aria-hidden />
    </button>
  );
}

export function Field({ label, description, error, children }: { label: string; description?: string | undefined; error?: string | null | undefined; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {description ? <span className="field-description">{description}</span> : null}
      {error ? (
        <span role="alert" className="field-error">
          {error}
        </span>
      ) : null}
    </div>
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
      aria-disabled={pending || undefined}
      data-pending={pending || undefined}
      className={`knowledge-task-check tw-completion${checked ? " is-completed" : ""}`}
      onClick={(e) => {
        e.stopPropagation(); // 圆框在可点击的行 / 卡片里：只勾选，不顺带打开详情
        if (!pending) onToggle(!checked);
      }}
    >
      {checked ? <CheckCircle2 size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
    </button>
  );
}

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "blue" | "violet";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
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
