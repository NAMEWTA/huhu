import type { LucideIcon } from "lucide-react";

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: LucideIcon }[];
  onChange(v: T): void;
  testId?: string;
}

/** 分段控件（原型 .segmented）：单选组，方向键切换（roving tabindex）。 */
export function Segmented<T extends string>({ label, value, options, onChange, testId }: SegmentedProps<T>) {
  const go = (e: { currentTarget: HTMLElement }, to: number) => {
    const next = options[(to + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    e.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role=radio]")[(to + options.length) % options.length]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="segmented" data-testid={testId}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={o.value === value ? "active" : ""}
          data-value={o.value}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault();
              go(e, i + 1);
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault();
              go(e, i - 1);
            }
          }}
        >
          {o.icon ? <o.icon size={13} aria-hidden /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}
