import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
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
export function DateInput({ label, type, value, onChange, clearable = true, disabled, readOnly, ...inputProps }: DateInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [error, setError] = useState("");
  const language = inputProps.lang || (typeof document === "undefined" ? "" : document.documentElement.lang) || "zh-CN";
  const english = language.startsWith("en");

  useEffect(() => {
    input.current?.setCustomValidity("");
    setError("");
  }, [value]);

  function commit(text: string | null, element: HTMLInputElement) {
    if (element.matches(":disabled") || element.readOnly) return false;
    element.setCustomValidity("");
    const { badInput, rangeUnderflow, rangeOverflow, stepMismatch } = element.validity;
    if (badInput || rangeUnderflow || rangeOverflow || stepMismatch) {
      const message = rangeUnderflow ? (english ? `Enter a value on or after ${element.min}.` : `请选择不早于 ${element.min} 的日期或时间。`)
        : rangeOverflow ? (english ? `Enter a value on or before ${element.max}.` : `请选择不晚于 ${element.max} 的日期或时间。`)
        : english ? "Enter a valid date or time." : "请输入有效的日期或时间。";
      element.setCustomValidity(message);
    } else {
      onChange(text, element);
    }
    const message = element.validity.customError ? element.validationMessage : "";
    setError(message);
    return !message;
  }

  function choose(text: string | null) {
    const element = input.current;
    if (!element) return false;
    const previous = element.value;
    element.value = text ?? "";
    try {
      return commit(text, element);
    } finally {
      element.value = previous;
    }
  }

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
        readOnly={readOnly}
        aria-invalid={error ? true : inputProps["aria-invalid"]}
        aria-describedby={[inputProps["aria-describedby"], error ? errorId : undefined].filter(Boolean).join(" ") || undefined}
        onChange={(event) => { commit(event.currentTarget.value || null, event.currentTarget); }}
      />
      {type === "date" && !disabled && !readOnly ? <DateCalendar label={label} language={language} value={value} clearable={clearable} onChange={choose} /> : null}
      {clearable && value && !disabled && !readOnly ? <IconButton icon={X} label={english ? `Clear ${label}` : `清除${label}`} size={14} onClick={() => {
        if (choose(null)) input.current?.focus();
      }} /> : null}
      {error ? <small className="hu-datetime-error hu-field-error" id={errorId} role="alert">{error}</small> : null}
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
