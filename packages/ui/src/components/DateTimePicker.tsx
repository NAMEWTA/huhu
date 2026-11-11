import { X } from "lucide-react";
import { localInputToIso, isoToLocalInput } from "./datetime.js";
import { IconButton } from "./ui.js";

export interface DateTimePickerProps {
  label: string;
  /** date 模式：YYYY-MM-DD；datetime 模式：ISO 时间（UTC，如 2026-11-10T01:30:00Z）。 */
  value: string | null;
  onChange(v: string | null): void;
  mode?: "date" | "datetime";
  clearable?: boolean;
  testId?: string;
}

/** 日期 / 日期时间选择：用原生控件（键盘、读屏、本地化都由浏览器负责），值的格式在这里统一。 */
export function DateTimePicker({ label, value, onChange, mode = "date", clearable = true, testId }: DateTimePickerProps) {
  const text = mode === "date" ? (value ?? "") : value ? isoToLocalInput(value) : "";
  return (
    <span className="hu-datetime">
      <input
        type={mode === "date" ? "date" : "datetime-local"}
        aria-label={label}
        data-testid={testId}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return onChange(null);
          onChange(mode === "date" ? v : localInputToIso(v));
        }}
      />
      {clearable && value ? <IconButton icon={X} label={`清除${label}`} size={14} onClick={() => onChange(null)} /> : null}
    </span>
  );
}
