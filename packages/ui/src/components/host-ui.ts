import { z } from "zod";

/** A child surface stays within the workbench or its nearest open dialog. */
export function overlayContainer(workbench: HTMLElement, invoker: HTMLElement): HTMLElement | null {
  if (!workbench.isConnected || !workbench.contains(invoker)) return null;
  const dialog = invoker.closest<HTMLDialogElement>("dialog[open]");
  return dialog && workbench.contains(dialog) ? dialog : workbench;
}

/** Standalone editor and UI entries have a document body in place of the workbench. */
export function invokerOverlayContainer(invoker: HTMLElement): HTMLElement | null {
  const workbench = invoker.closest<HTMLElement>(".hu-app") ?? invoker.ownerDocument.body;
  return overlayContainer(workbench, invoker);
}

/** Lets editor key handlers ask the host to close without bypassing its cancel policy. */
export function requestDialogClose(dialog: HTMLDialogElement): void {
  if (typeof dialog.requestClose === "function") dialog.requestClose();
  else if (dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) dialog.close();
}

/** Wire this only while this child surface is open, in order from the inside out. */
export function dismissChildOnEscape(event: KeyboardEvent, invoker: HTMLElement, dismiss: () => void): boolean {
  if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.keyCode === 229) return false;
  event.preventDefault();
  event.stopPropagation();
  dismiss();
  if (invoker.isConnected) invoker.focus();
  return true;
}

const timeZone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
});

/** A cleared field has no value. Clearing a local time keeps the form's selected zone. */
export const HostDateField = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("date"), value: z.iso.date().nullable() }),
  z.strictObject({ kind: z.literal("instant"), value: z.iso.datetime().nullable() }),
  z.strictObject({
    kind: z.literal("local-date-time"),
    zone: timeZone,
    value: z.strictObject({
      local: z.templateLiteral([z.iso.date(), "T", z.iso.time()]),
      disambiguation: z.enum(["earlier", "later"]).optional(),
    }).nullable(),
  }),
]);
export type HostDateField = z.infer<typeof HostDateField>;
