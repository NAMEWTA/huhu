import * as Popover from "@radix-ui/react-popover";
import { CalendarDays } from "lucide-react";
import { useRef, useState } from "react";
import { dismissChildOnEscape, invokerOverlayContainer } from "./host-ui.js";
import { dateParts, dateValue, daysInMonth, today, type DateParts } from "./calendar-date.js";
import { Button, IconButton, Select } from "./ui.js";

export function DateCalendar({ label, language, value, clearable, onChange }: {
  label: string;
  language: string;
  value: string | null;
  clearable: boolean;
  onChange(value: string | null): boolean;
}) {
  const [draft, setDraft] = useState(() => dateParts(value));
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const container = open && trigger.current ? invokerOverlayContainer(trigger.current) : null;
  const dialog = container?.matches("dialog[open]") ? container : undefined;
  const english = language.startsWith("en");
  const title = english ? `Choose ${label}` : `选择${label}`;
  const yearLabel = english ? "Year" : "年";
  const monthLabel = english ? "Month" : "月";
  const dayLabel = english ? "Day" : "日";
  const validYear = Number.isInteger(draft.year) && draft.year >= 1 && draft.year <= 9999;
  const days = daysInMonth(validYear ? draft.year : 2000, draft.month);
  const validDay = draft.day > 0 && draft.day <= days;
  const monthName = new Intl.DateTimeFormat(language || undefined, { month: "long", timeZone: "UTC" });
  const pick = (parts: DateParts) => {
    if (onChange(dateValue(parts))) setOpen(false);
  };
  return (
    <Popover.Root open={open} onOpenChange={(next) => {
      if (next) setDraft(dateParts(value));
      setOpen(next);
    }}>
      <Popover.Trigger asChild>
        <IconButton ref={trigger} icon={CalendarDays} label={title} size={15} />
      </Popover.Trigger>
      {container ? (
        <Popover.Portal container={container}>
          <Popover.Content aria-label={title} className="hu-date-calendar" align="end" sideOffset={4} collisionBoundary={dialog ?? []} collisionPadding={8}
            onEscapeKeyDown={(event) => {
              if (event.isComposing || event.keyCode === 229) {
                event.preventDefault();
                return;
              }
              if (trigger.current) dismissChildOnEscape(event, trigger.current, () => setOpen(false));
            }}>
            <div className="hu-date-parts">
              <label>
                {yearLabel}
                <input aria-label={yearLabel} type="number" min={1} max={9999} value={draft.year || ""} onChange={(event) => setDraft({ ...draft, year: Number(event.target.value) })} />
              </label>
              <label>
                {monthLabel}
                <Select aria-label={monthLabel} value={draft.month} onChange={(event) => setDraft({ ...draft, month: Number(event.target.value) })}>
                  {Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{monthName.format(Date.UTC(2000, index, 1))}</option>)}
                </Select>
              </label>
              <label>
                {dayLabel}
                <Select aria-label={dayLabel} value={draft.day <= days ? draft.day : ""} onChange={(event) => setDraft({ ...draft, day: Number(event.target.value) })}>
                  {draft.day > days ? <option value="" disabled /> : null}
                  {Array.from({ length: days }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
                </Select>
              </label>
            </div>
            <div className="hu-date-calendar-actions">
              {clearable ? <Button variant="ghost" disabled={!value} onClick={() => {
                if (onChange(null)) setOpen(false);
              }}>{english ? "Clear" : "清除"}</Button> : null}
              <Button variant="ghost" onClick={() => pick(today())}>{english ? "Today" : "今天"}</Button>
              <Button variant="primary" disabled={!validYear || !validDay} onClick={() => pick(draft)}>{english ? "Apply" : "确定"}</Button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}
