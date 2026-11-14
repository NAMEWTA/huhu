import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Presence } from "@radix-ui/react-presence";
import { X } from "lucide-react";

/** Presentation policy only. Its owner persists a preference in the current Vault. */
export type MotionPreference = "system" | "reduced" | "full";

export interface MotionPolicy {
  preference: MotionPreference;
  systemReduced: boolean;
  reduced: boolean;
}

export const MOTION_TOKENS = Object.freeze({
  feedback: 120,
  enter: 180,
  exit: 144,
  move: 220,
  reducedFade: 80,
  stagger: 30,
  maximumStaggerItems: 5,
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
});

const reducedQuery = "(prefers-reduced-motion: reduce)";
const MotionContext = React.createContext<MotionPolicy | null>(null);

function subscribeToSystemPreference(notify: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

function readSystemPreference() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(reducedQuery).matches : false;
}

function subscribeToNothing() {
  return () => {};
}

function readNoPreference() {
  return false;
}

export function useSystemReducedMotion() {
  return React.useSyncExternalStore(subscribeToSystemPreference, readSystemPreference, () => true);
}

export function resolveMotionPreference(preference: MotionPreference, systemReduced: boolean): MotionPolicy {
  // A Vault preference cannot undo the current user's OS accessibility setting.
  return { preference, systemReduced, reduced: systemReduced || preference === "reduced" };
}

export function MotionProvider({ preference = "system", children }: React.PropsWithChildren<{ preference?: MotionPreference }>) {
  const systemReduced = useSystemReducedMotion();
  const policy = React.useMemo(() => resolveMotionPreference(preference, systemReduced), [preference, systemReduced]);

  React.useLayoutEffect(() => {
    const root = document.documentElement;
    const previousMotion = root.getAttribute("data-motion");
    const previousPreference = root.getAttribute("data-motion-preference");
    root.dataset.motion = policy.reduced ? "reduced" : "full";
    root.dataset.motionPreference = policy.preference;
    return () => {
      if (previousMotion === null) root.removeAttribute("data-motion");
      else root.setAttribute("data-motion", previousMotion);
      if (previousPreference === null) root.removeAttribute("data-motion-preference");
      else root.setAttribute("data-motion-preference", previousPreference);
    };
  }, [policy]);

  return <MotionContext.Provider value={policy}>{children}</MotionContext.Provider>;
}

export function useMotionPolicy(): MotionPolicy {
  const policy = React.useContext(MotionContext);
  // Inside a provider, one shared media-query subscription is sufficient for
  // every dialog and panel. Standalone primitives still respect the OS.
  const systemReduced = React.useSyncExternalStore(policy ? subscribeToNothing : subscribeToSystemPreference, policy ? readNoPreference : readSystemPreference, () => true);
  return policy ?? resolveMotionPreference("system", systemReduced);
}

/**
 * Preserve the last committed payload while a controlled overlay closes.
 * This never defers an application mutation or writes a ref during render.
 * The host itself must remain mounted; `open && <Dialog />` prevents exits.
 */
export function useRetainedValue<T>(value: T | null | undefined): T | null {
  const previous = React.useRef<T | null>(null);
  React.useLayoutEffect(() => {
    if (value !== null && value !== undefined) previous.current = value;
  }, [value]);
  return value ?? previous.current;
}

/** Mature lifecycle implementation, exported without a second presence engine. */
export const MotionPresence = Presence;

export interface MotionSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  present: boolean;
  variant?: "page" | "panel" | "menu";
}

export const MotionSurface = React.forwardRef<HTMLDivElement, MotionSurfaceProps>(function MotionSurface({ present, variant = "page", className = "", children, ...props }, ref) {
  const { reduced } = useMotionPolicy();
  // CSS animation cancellation alone is not a reliable completion signal when
  // the OS preference changes during an exit. End visual presence directly.
  if (reduced && !present) return null;
  return (
    <Presence present={present}>
      <div {...props} ref={ref} className={`hu-motion-surface hu-motion-${variant} ${className}`} data-state={present ? "open" : "closed"} data-motion-surface={variant} aria-hidden={present ? undefined : true} inert={!present}>
        {children}
      </div>
    </Presence>
  );
});

export interface MotionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  variant?: "dialog" | "drawer";
  className?: string;
  contentClassName?: string;
  closeLabel?: string;
  busy?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Radix owns modal layering, Escape, focus trapping, scroll lock and presence.
 * huhu owns typography, motion tokens, close policy and explicit focus targets.
 */
export function MotionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
  variant = "dialog",
  className = "",
  contentClassName = "",
  closeLabel = "关闭对话框",
  busy = false,
  initialFocusRef,
  returnFocusRef,
}: MotionDialogProps) {
  const { reduced } = useMotionPolicy();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const capturedFocus = React.useRef<HTMLElement | null>(null);
  const previouslyOpen = React.useRef(open);

  const focusFirstField = React.useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !contentRef.current?.contains(active)) {
      capturedFocus.current = active;
    }
    const firstField = contentRef.current?.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),select:not([disabled])');
    const target = initialFocusRef?.current ?? firstField;
    target?.focus({ preventScroll: true });
    return Boolean(target);
  }, [initialFocusRef]);

  const restoreFocus = React.useCallback(() => {
    const requestedTarget = returnFocusRef?.current ?? capturedFocus.current;
    const canFocus = (element: HTMLElement | null | undefined) => Boolean(element?.isConnected && !element.closest("[inert]") && !element.matches(":disabled"));
    const target = canFocus(requestedTarget) ? requestedTarget : document.querySelector<HTMLElement>("[data-default-focus]");
    const active = document.activeElement;
    const currentOwnsFocus = !active || active === document.body || active === document.documentElement || Boolean(contentRef.current?.contains(active));
    // A user may have focused a new dialog or another control during an exit.
    // The departing dialog must never steal that focus back.
    if (currentOwnsFocus && target && canFocus(target)) {
      target.focus({ preventScroll: true });
    }
  }, [returnFocusRef]);

  React.useLayoutEffect(() => {
    const changed = previouslyOpen.current !== open;
    previouslyOpen.current = open;
    if (!changed) return;
    if (!open) {
      restoreFocus();
      return;
    }
    // Presence may reuse the still-mounted FocusScope when an exit is interrupted.
    // Its mount autofocus does not run again, so reentry needs an explicit target.
    const content = contentRef.current;
    if (content && !content.contains(document.activeElement) && !focusFirstField()) {
      const firstButton = content.querySelector<HTMLElement>("button:not([disabled])");
      (firstButton ?? content).focus({ preventScroll: true });
    }
  }, [open, restoreFocus, focusFirstField]);

  const showPortal = open || !reduced;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && busy) return;
        onOpenChange(nextOpen);
      }}
    >
      {showPortal && (
        <Dialog.Portal>
          <Dialog.Overlay className={`hu-modal-backdrop hu-dialog-overlay ${className}`} data-variant={variant}>
            <Dialog.Content
              {...(description ? {} : { "aria-describedby": undefined })}
              ref={contentRef}
              className={`hu-modal hu-dialog-content hu-dialog-${variant} ${wide ? "shell-modal-wide" : ""} ${contentClassName}`}
              aria-busy={busy || undefined}
              data-ui-busy={busy ? "true" : undefined}
              inert={!open}
              onEscapeKeyDown={(event) => {
                if (busy) event.preventDefault();
              }}
              onInteractOutside={(event) => {
                if (busy) event.preventDefault();
              }}
              onOpenAutoFocus={(event) => {
                if (focusFirstField()) event.preventDefault();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                restoreFocus();
              }}
            >
              <div className="hu-modal-head">
                <div>
                  <Dialog.Title asChild>
                    <h2>{title}</h2>
                  </Dialog.Title>
                  {description && (
                    <Dialog.Description asChild>
                      <p>{description}</p>
                    </Dialog.Description>
                  )}
                </div>
                <Dialog.Close asChild>
                  <button type="button" className="hu-icon-btn" aria-label={closeLabel} title={closeLabel} disabled={busy}>
                    <X size={17} aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </div>
              {children}
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}
