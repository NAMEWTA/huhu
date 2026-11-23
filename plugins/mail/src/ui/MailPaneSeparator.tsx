import { MAIL_PANE_WIDTHS } from "@huhu/contracts";
import { useLayoutEffect, useRef, useState } from "react";

const separatorWidth = 12;
const detailPadding = 30;
const minReader = 320;

export function useMailColumn(pane: keyof typeof MAIL_PANE_WIDTHS, preferred: number) {
  const [grid, attachGrid] = useState<HTMLDivElement | null>(null);
  const [space, setSpace] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!grid) return;
    setSpace(grid.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSpace(Math.floor(entry.contentRect.width));
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, [grid]);

  const { min, max: limit } = MAIL_PANE_WIDTHS[pane];
  const reserve = pane === "accountWidth" ? separatorWidth + detailPadding + (space >= 940 ? MAIL_PANE_WIDTHS.contactWidth.min + separatorWidth + minReader : 288) : separatorWidth + minReader;
  const max = space ? Math.max(min, Math.min(limit, space - reserve)) : limit;
  return { attachGrid, min, max, width: Math.max(min, Math.min(max, preview ?? preferred)), setPreview };
}

export function MailPaneSeparator({ label, controls, column, onResize }: { label: string; controls: string; column: ReturnType<typeof useMailColumn>; onResize(width: number): void }) {
  const { width, min, max, setPreview } = column;
  const drag = useRef<{ id: number; x: number; width: number } | null>(null);
  const clamp = (next: number) => Math.max(min, Math.min(max, Math.round(next)));
  const cancelDrag = () => {
    drag.current = null;
    setPreview(null);
  };

  return (
    <div
      className="hu-mail-pane-separator"
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, x: event.clientX, width };
      }}
      onPointerMove={(event) => {
        if (drag.current?.id !== event.pointerId) return;
        setPreview(clamp(drag.current.width + event.clientX - drag.current.x));
      }}
      onPointerUp={(event) => {
        const start = drag.current;
        if (start?.id !== event.pointerId) return;
        const next = clamp(start.width + event.clientX - start.x);
        cancelDrag();
        if (event.clientX !== start.x && next !== start.width) onResize(next);
      }}
      onLostPointerCapture={cancelDrag}
      onKeyDown={(event) => {
        const { key } = event;
        if (key === "Escape" && drag.current) {
          const { id } = drag.current;
          cancelDrag();
          event.currentTarget.releasePointerCapture(id);
        } else {
          const target = key === "ArrowLeft" ? width - 12 : key === "ArrowRight" ? width + 12 : key === "Home" ? min : key === "End" ? max : undefined;
          if (target === undefined) return;
          const next = clamp(target);
          if (next !== width) onResize(next);
        }
        event.preventDefault();
      }}
    />
  );
}
