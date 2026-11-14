import { CheckCircle2, Circle, Loader2, Search, X, type LucideIcon } from "lucide-react";
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
      className={`hu-btn${variant === "secondary" ? "" : ` hu-btn-${variant}`} ${className}`.trim()}
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
    <button type="button" {...rest} className={`hu-icon-btn ${className}`.trim()} aria-label={label} title={label}>
      <Icon size={size} aria-hidden />
    </button>
  );
}

export function Field({ label, description, error, children }: { label: string; description?: string | undefined; error?: string | null | undefined; children: ReactNode }) {
  return (
    <div className="hu-field">
      <span className="hu-field-label">{label}</span>
      {children}
      {description ? <span className="hu-field-description">{description}</span> : null}
      {error ? (
        <span role="alert" className="hu-field-error">
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
      className={`hu-knowledge-task-check hu-tw-completion${checked ? " is-completed" : ""}`}
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

export function Badge({ tone = "neutral", children, "data-testid": testId }: { tone?: BadgeTone; children: ReactNode; "data-testid"?: string }) {
  return (
    <span className={`hu-badge hu-badge-${tone}`} {...(testId ? { "data-testid": testId } : {})}>
      {children}
    </span>
  );
}

export function Banner({ tone = "warning", children, action, "data-testid": testId }: { tone?: "warning" | "danger" | "blue"; children: ReactNode; action?: ReactNode; "data-testid"?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`hu-banner hu-banner-${tone}`} {...(testId ? { "data-testid": testId } : {})}>
      <span>{children}</span>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint, action, icon: Icon = Search }: { title: string; hint?: string | undefined; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="hu-empty-state">
      <div className="hu-empty-icon">
        <Icon size={26} aria-hidden />
      </div>
      <h3>{title}</h3>
      {hint ? <p>{hint}</p> : null}
      {action}
    </div>
  );
}

/** 页头（原型 PageHead）：eyebrow / 标题 / 说明 + 右侧操作区。 */
export function PageHead({ eyebrow, title, description, actions, children }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="hu-page-head">
      <div className="grow">
        {eyebrow ? <div className="hu-eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="hu-page-actions">{actions}</div> : null}
    </header>
  );
}

/** 搜索框（原型 SearchBox）：左侧放大镜，有内容时右侧出现清空按钮。 */
export function SearchBox({ value, onChange, placeholder = "搜索…", className = "" }: { value: string; onChange(v: string): void; placeholder?: string; className?: string }) {
  return (
    <div className={`hu-search-box ${className}`.trim()}>
      <Search size={15} aria-hidden />
      <input aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value ? (
        <button type="button" aria-label="清空搜索" onClick={() => onChange("")}>
          <X size={13} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
