import { useRef } from "react";
import { fileColumnLimits } from "./device-preferences.js";

type Drag = { pointer: number; x: number; width: number; direction: number };
const { min, max } = fileColumnLimits;
const clamp = (width: number) => Math.max(min, Math.min(max, Math.round(width)));

export function FileColumnResize({ label, width, preview, save }: { label: string; width: number; preview(width?: number): void; save(width: number): void }) {
  const drag = useRef<Drag>(undefined);
  function clear() {
    if (!drag.current) return;
    drag.current = undefined;
    preview();
  }
  return (
    <span
      className="ssh-file-col-resizer"
      role="separator"
      tabIndex={0}
      aria-label={`调整“${label}”列宽`}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-valuetext={`${width} 像素`}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || drag.current) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, x: event.clientX, width, direction: getComputedStyle(event.currentTarget).direction === "rtl" ? -1 : 1 };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (start?.pointer === event.pointerId) preview(clamp(start.width + start.direction * (event.clientX - start.x)));
      }}
      onPointerUp={(event) => {
        const start = drag.current;
        if (start?.pointer !== event.pointerId) return;
        const next = clamp(start.width + start.direction * (event.clientX - start.x));
        clear();
        if (next !== start.width) save(next);
      }}
      onPointerCancel={clear}
      onLostPointerCapture={clear}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
        if (event.key === "Escape" && drag.current) {
          const pointer = drag.current.pointer;
          clear();
          event.currentTarget.releasePointerCapture(pointer);
          event.preventDefault();
          return;
        }
        if (drag.current) return;
        const step = (event.shiftKey ? 40 : 8) * (getComputedStyle(event.currentTarget).direction === "rtl" ? -1 : 1);
        const targets: Record<string, number> = { ArrowLeft: width - step, ArrowRight: width + step, Home: min, End: max };
        if (!Object.hasOwn(targets, event.key)) return;
        const target = clamp(targets[event.key]!);
        event.preventDefault();
        if (target !== width) save(target);
      }}
    />
  );
}
