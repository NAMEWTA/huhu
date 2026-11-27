import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { dateParts, dateValue, daysInMonth, type DateParts } from "./calendar-date.js";
import { Button, IconButton } from "./ui.js";

function utc({ year, month, day }: DateParts): Date {
  const result = new Date(0);
  result.setUTCFullYear(year, month - 1, day);
  return result;
}

function parts(value: Date): DateParts {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function addDays(current: DateParts, offset: number): DateParts {
  const date = utc(current);
  date.setUTCDate(date.getUTCDate() + offset);
  const next = parts(date);
  return next.year >= 1 && next.year <= 9999 ? next : current;
}

function addMonth(current: DateParts, offset: number): DateParts {
  const date = utc({ ...current, day: 1 });
  date.setUTCMonth(date.getUTCMonth() + offset);
  const next = parts(date);
  if (next.year < 1 || next.year > 9999) return current;
  return { ...next, day: Math.min(current.day, daysInMonth(next.year, next.month)) };
}

export function MonthCalendar({
  language,
  value,
  today,
  availableDates,
  weekStartsOn = 1,
  onChange,
}: {
  language: string;
  value: string;
  today: string;
  availableDates: ReadonlySet<string>;
  weekStartsOn?: 0 | 1;
  onChange(value: string): void;
}) {
  const heading = useId();
  const [focusDay, setFocusDay] = useState(() => dateParts(value));
  const [previousValue, setPreviousValue] = useState(value);
  if (previousValue !== value) {
    setPreviousValue(value);
    setFocusDay(dateParts(value));
  }
  const moveFocus = useRef(false);
  const focusButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    focusButton.current?.focus();
  }, [focusDay]);
  const labels = language.startsWith("en") ? { previous: "Previous month", next: "Next month", today: "Today", existing: "daily note available" } : { previous: "上个月", next: "下个月", today: "今天", existing: "已有日记" };
  const formats = useMemo(
    () => ({
      heading: new Intl.DateTimeFormat(language, { year: "numeric", month: "long", timeZone: "UTC" }),
      weekday: new Intl.DateTimeFormat(language, { weekday: "short", timeZone: "UTC" }),
      day: new Intl.DateTimeFormat(language, { dateStyle: "full", timeZone: "UTC" }),
      number: new Intl.NumberFormat(language, { useGrouping: false }),
    }),
    [language],
  );

  const { year, month, day } = focusDay;
  const title = formats.heading.format(utc({ year, month, day: 1 }));
  const leading = (utc({ year, month, day: 1 }).getUTCDay() - weekStartsOn + 7) % 7;
  const days = daysInMonth(year, month);
  const weekCount = Math.ceil((leading + days) / 7);

  function move(event: KeyboardEvent<HTMLButtonElement>) {
    const cursor = utc(focusDay);
    const weekday = (cursor.getUTCDay() - weekStartsOn + 7) % 7;
    let next: DateParts;
    switch (event.key) {
      case "ArrowLeft":
        next = addDays(focusDay, -1);
        break;
      case "ArrowRight":
        next = addDays(focusDay, 1);
        break;
      case "ArrowUp":
        next = addDays(focusDay, -7);
        break;
      case "ArrowDown":
        next = addDays(focusDay, 7);
        break;
      case "Home":
        next = addDays(focusDay, -weekday);
        break;
      case "End":
        next = addDays(focusDay, 6 - weekday);
        break;
      case "PageUp":
        next = addMonth(focusDay, event.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        next = addMonth(focusDay, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next === focusDay) return;
    moveFocus.current = true;
    setFocusDay(next);
  }

  return (
    <section className="hu-month-calendar" aria-labelledby={heading}>
      <header>
        <IconButton icon={ChevronLeft} label={labels.previous} disabled={year === 1 && month === 1} onClick={() => setFocusDay(addMonth(focusDay, -1))} />
        <strong id={heading} role="status">
          {title}
        </strong>
        <IconButton icon={ChevronRight} label={labels.next} disabled={year === 9999 && month === 12} onClick={() => setFocusDay(addMonth(focusDay, 1))} />
      </header>
      <table role="grid" aria-labelledby={heading}>
        <thead>
          <tr>
            {Array.from({ length: 7 }, (_, index) => {
              const weekday = (weekStartsOn + index) % 7;
              return (
                <th key={weekday} scope="col">
                  {formats.weekday.format(Date.UTC(2026, 0, 4 + weekday))}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: weekCount }, (_, week) => (
            <tr key={week}>
              {Array.from({ length: 7 }, (_, weekday) => {
                const number = week * 7 + weekday - leading + 1;
                if (number < 1 || number > days) return <td key={weekday} />;
                const date = { year, month, day: number };
                const iso = dateValue(date);
                const exists = availableDates.has(iso);
                return (
                  <td key={weekday} aria-selected={iso === value}>
                    <button
                      type="button"
                      tabIndex={number === day ? 0 : -1}
                      ref={number === day ? focusButton : undefined}
                      aria-current={iso === today ? "date" : undefined}
                      aria-label={`${formats.day.format(utc(date))}${exists ? ` · ${labels.existing}` : ""}`}
                      data-date={iso}
                      data-has-note={exists || undefined}
                      onFocus={() => {
                        if (number !== day) setFocusDay(date);
                      }}
                      onKeyDown={move}
                      onClick={() => onChange(iso)}
                    >
                      {formats.number.format(number)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <Button
        variant="ghost"
        onClick={() => {
          setFocusDay(dateParts(today));
          onChange(today);
        }}
      >
        {labels.today}
      </Button>
    </section>
  );
}
