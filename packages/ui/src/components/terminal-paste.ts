export type ShortcutPasteError = "bracketed-paste-required" | "control-character";

/** A shortcut carries literal text. Only the explicit send action may emit an Enter. */
export function shortcutPasteError(text: string, enter: boolean, bracketed: boolean): ShortcutPasteError | undefined {
  let needsBracketedPaste = false;
  for (const character of text) {
    if (character === "\t") {
      needsBracketedPaste = true;
    } else if (character === "\r" || character === "\n") {
      needsBracketedPaste ||= !enter;
    } else {
      const code = character.charCodeAt(0);
      if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return "control-character";
    }
  }
  return needsBracketedPaste && !bracketed ? "bracketed-paste-required" : undefined;
}
