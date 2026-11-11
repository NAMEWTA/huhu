import React, { createContext, forwardRef, useContext, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ElementType, type ReactElement, type ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as RovingFocus from "@radix-ui/react-roving-focus";
import * as Switch from "@radix-ui/react-switch";

const HasTooltipProvider = createContext(false);

/** One shared delay group: first hint waits; neighbouring hints appear immediately. */
export function ControlsProvider({ children }: { children: ReactNode }) {
  return (
    <HasTooltipProvider.Provider value>
      <Tooltip.Provider delayDuration={500} skipDelayDuration={300}>
        {children}
      </Tooltip.Provider>
    </HasTooltipProvider.Provider>
  );
}

export function Hint({ label, children, side = "bottom" }: { label: ReactNode; children: ReactElement; side?: "top" | "right" | "bottom" | "left" }) {
  const provided = useContext(HasTooltipProvider);
  const content = (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="huhu-tooltip" side={side} sideOffset={7} collisionPadding={10}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
  return provided ? content : <ControlsProvider>{content}</ControlsProvider>;
}

type Icon = ElementType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
export interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: string;
  icon?: Icon;
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton({ variant = "default", icon: Icon, children, className = "", ...props }, ref) {
  return (
    <button ref={ref} type="button" className={`btn btn-${variant} ${className}`} {...props}>
      {Icon && <Icon size={16} aria-hidden />} {children}
    </button>
  );
});

export interface IconActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: Icon;
  label: string;
}

export const IconActionButton = forwardRef<HTMLButtonElement, IconActionButtonProps>(function IconActionButton({ icon: Icon, label, className = "", ...props }, ref) {
  const button = (
    <button ref={ref} type="button" className={`icon-btn ${className}`} aria-label={label} title={props.disabled ? label : undefined} {...props}>
      <Icon size={17} aria-hidden />
    </button>
  );
  return props.disabled ? button : <Hint label={label}>{button}</Hint>;
});

export interface SegmentedItem {
  id: string;
  label: ReactNode;
  icon?: Icon;
  disabled?: boolean;
}

/** Radix owns arrow/Home/End roving focus; Enter/Space activates the focused option. */
export function ChoiceSegmented({ items, value, onChange, className = "", label = "视图选项" }: { items: SegmentedItem[]; value: string; onChange: (id: string) => void; className?: string; label?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ x: 0, width: 0 });
  const identity = items.map((item) => `${item.id}:${!!item.disabled}`).join("|");
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = () => {
      const active = element.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      if (!active) return;
      const x = active.offsetLeft;
      const width = active.offsetWidth;
      setIndicator((last) => (last.x === x && last.width === width ? last : { x, width }));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.querySelectorAll("button")) observer.observe(child);
    return () => observer.disconnect();
  }, [value, identity]);
  const style: CSSProperties = {
    transform: `translateX(${indicator.x}px)`,
    width: indicator.width,
  };
  return (
    <RovingFocus.Root orientation="horizontal" loop asChild>
      <div ref={root} className={`segmented huhu-segmented ${className}`} role="tablist" aria-label={label} data-measured={indicator.width > 0 ? "true" : undefined}>
        <span className="huhu-segmented-indicator" style={style} aria-hidden="true" />
        {items.map((item) => {
          const Icon = item.icon;
          const selected = value === item.id;
          return (
            <RovingFocus.Item key={item.id} focusable={!item.disabled} active={selected} asChild>
              <button type="button" role="tab" aria-selected={selected} className={selected ? "active" : ""} disabled={item.disabled} onClick={() => onChange(item.id)}>
                {Icon && <Icon size={14} aria-hidden />} {item.label}
              </button>
            </RovingFocus.Item>
          );
        })}
      </div>
    </RovingFocus.Root>
  );
}

export function ChoiceSwitch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <Switch.Root checked={!!checked} onCheckedChange={onChange} aria-label={label} disabled={disabled} className={`toggle huhu-switch ${checked ? "is-on" : ""}`}>
      <Switch.Thumb />
    </Switch.Root>
  );
}
