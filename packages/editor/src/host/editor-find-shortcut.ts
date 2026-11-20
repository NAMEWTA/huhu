import { matchesKeyboardShortcut } from "@/lib/keyboard-shortcuts";

/** ORCA's editor.find action maps to the same binding used by Huhu's rich editor. */
export const matchesEditorFind = (event: KeyboardEvent): boolean => matchesKeyboardShortcut(event, "find");
