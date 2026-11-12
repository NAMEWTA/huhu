import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";

export interface ComboboxOption {
  value: string;
  label?: string;
  hint?: string;
}

export interface ComboboxProps {
  label: string;
  value: string;
  onChange(value: string): void;
  options: readonly ComboboxOption[];
  placeholder?: string;
  /** 允许输入列表之外的值（如任务“项目”）；否则失焦时回到上次选中的值。 */
  allowCustom?: boolean;
  /** 没有匹配项时的文案。 */
  emptyText?: string;
  testId?: string;
}

/** 可输入、可搜索的选择框（design-system.md Select / Combobox）：↑↓ 移动、Enter 选中、Esc 关闭、没有结果时显示文案。ARIA combobox + listbox 模式。 */
export function Combobox({ label, value, onChange, options, placeholder, allowCustom = false, emptyText = "没有匹配项", testId }: ComboboxProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null); // null：显示当前值；非 null：用户正在输入
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const shown = query ?? options.find((o) => o.value === value)?.label ?? value;
  const matches = useMemo(() => {
    const q = (query ?? "").trim().toLowerCase();
    return q === "" ? options : options.filter((o) => (o.label ?? o.value).toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, query]);
  useEffect(() => setActive(0), [query, open]);
  const choose = (v: string) => {
    onChange(v);
    setQuery(null);
    setOpen(false);
  };
  const commit = () => {
    if (allowCustom && query !== null) onChange(query.trim());
    setQuery(null);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <input
          ref={input}
          className="hu-combobox"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${id}-list`}
          aria-activedescendant={open && matches[active] ? `${id}-${active}` : undefined}
          data-testid={testId}
          autoComplete="off"
          placeholder={placeholder}
          value={shown}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (allowCustom) onChange(e.target.value);
          }}
          onBlur={() => window.setTimeout(commit, 0)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) return setOpen(true);
              if (matches.length) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
            } else if (e.key === "Enter") {
              if (open && matches[active]) {
                e.preventDefault();
                choose(matches[active].value);
              } else if (allowCustom) {
                e.preventDefault();
                commit();
                setOpen(false);
              }
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation(); // 不要连带关闭外层对话框
              setOpen(false);
              setQuery(null);
            }
          }}
        />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="hu-combobox-list"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target === input.current) e.preventDefault();
          }}
          style={{ width: "var(--radix-popover-trigger-width)" }}
        >
          <ul id={`${id}-list`} role="listbox" aria-label={label}>
            {matches.map((o, i) => (
              <li
                key={o.value}
                id={`${id}-${i}`}
                role="option"
                aria-selected={o.value === value}
                data-active={i === active || undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
              >
                <span>{o.label ?? o.value}</span>
                {o.hint ? <small>{o.hint}</small> : null}
              </li>
            ))}
            {matches.length === 0 ? (
              <li role="presentation" className="hu-combobox-empty">
                {allowCustom && query?.trim() ? `按回车使用“${query.trim()}”` : emptyText}
              </li>
            ) : null}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
