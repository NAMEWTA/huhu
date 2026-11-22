import { z } from "zod";

export const shortcutNames = { list: "ssh.shortcuts.list", save: "ssh.shortcuts.save" } as const;
export const MAX_SHORTCUTS = 200;
export const MAX_SHORTCUT_LABEL = 80;
export const MAX_SHORTCUT_TEXT = 8192;
export const MAX_SHORTCUT_LIBRARY_BYTES = 256 * 1024;
export const SHORTCUTS_CHANGED = "ssh-shortcuts";

/** Matches the terminal's C0 and C1 restrictions while preserving its literal whitespace policy. */
export function hasShortcutControl(text: string): boolean {
  return /(?![\t\r\n])\p{Cc}/u.test(text);
}

const Label = z
  .string()
  .trim()
  .max(MAX_SHORTCUT_LABEL)
  .refine((value) => !/\p{Cc}/u.test(value));
export const Shortcut = z.strictObject({
  id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._-]+$/u),
  name: Label.refine(Boolean),
  group: Label.optional(),
  text: z
    .string()
    .min(1)
    .max(MAX_SHORTCUT_TEXT)
    .refine((value) => !hasShortcutControl(value)),
});
export type Shortcut = z.infer<typeof Shortcut>;

const Shortcuts = z
  .array(Shortcut)
  .max(MAX_SHORTCUTS)
  .refine((entries) => new Set(entries.map(({ id }) => id)).size === entries.length, "快捷文本 ID 必须唯一");
const Revision = z.string().min(1).max(128).nullable();
export const ShortcutLibrary = z.strictObject({ revision: Revision, shortcuts: Shortcuts });
export type ShortcutLibrary = z.infer<typeof ShortcutLibrary>;
export const SaveShortcuts = z.strictObject({ expectedRevision: Revision, shortcuts: Shortcuts });
export type SaveShortcuts = z.infer<typeof SaveShortcuts>;
export const ShortcutLibraryFile = z.strictObject({ version: z.literal(1), shortcuts: Shortcuts });
