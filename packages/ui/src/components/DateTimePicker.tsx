import { X } from "lucide-react";
import { useRef, type ComponentProps } from "react";
import { DateCalendar } from "./DateCalendar.js";
import { localInputToIso, isoToLocalInput } from "./datetime.js";
import { HostDateField } from "./host-ui.js";
import { IconButton } from "./ui.js";

interface DateInputProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue"> {
  label: string;
  type: "date" | "datetime-local" | "time";
  value: string | null;
  onChange(value: string | null, input: HTMLInputElement): void;
  clearable?: boolean;
}

/** Shared native input for dates and clock times. Values follow the input type's canonical format. */
export function DateInput({ label, type, value, onChange, clearable = true, disabled, ...inputProps }: DateInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const language = inputProps.lang || (typeof document === "undefined" ? "" : document.documentElement.lang) || "zh-CN";
  return (
    <span className="hu-datetime">
      <input
        {...inputProps}
        ref={input}
        type={type}
        aria-label={label}
        value={value ?? ""}
        lang={language}
        disabled={disabled}
        onChange={(e) => {
          e.target.setCustomValidity("");
          if (e.target.validity.badInput) return;
          onChange(e.target.value || null, e.target);
        }}
      />
      {type === "date" && !disabled ? <DateCalendar label={label} language={language} value={value} onChange={(date) => {
        if (!input.current) return;
        input.current.setCustomValidity("");
        onChange(date, input.current);
      }} /> : null}
      {clearable && value && !disabled ? <IconButton icon={X} label={language?.startsWith("en") ? `Clear ${label}` : `清除${label}`} size={14} onClick={() => {
        input.current?.setCustomValidity("");
        if (input.current) onChange(null, input.current);
        input.current?.focus();
      }} /> : null}
    </span>
  );
}

type DateTimePickerProps = Omit<DateInputProps, "value" | "onChange" | "type"> & {
  field: HostDateField;
  onChange(field: HostDateField): void;
};

/** Edit each host date type in its own representation. Scheduling owns fold/gap resolution. */
export function DateTimePicker({ field, onChange, ...props }: DateTimePickerProps) {
  const value = field.kind === "local-date-time" ? field.value?.local ?? null
    : field.kind === "instant" && field.value ? isoToLocalInput(field.value) : field.value;
  return <DateInput
    {...props}
    type={field.kind === "date" ? "date" : "datetime-local"}
    step={props.step ?? (field.kind === "date" ? undefined : 1)}
    value={value}
    onChange={(text, input) => {
      if (field.kind === "instant" && field.value && text && (text === value || `${text}:00` === value)) return;
      const next = field.kind === "local-date-time"
        ? { ...field, value: text ? { local: text } : null }
        : { ...field, value: field.kind === "instant" && text ? localInputToIso(text) : text };
      const parsed = HostDateField.safeParse(next);
      if (parsed.success) onChange(parsed.data);
      else input.setCustomValidity(input.lang.startsWith("en") ? "Enter a date or time that exists and is unambiguous." : "请选择存在且不重复的日期或时刻。");
    }}
  />;
}
