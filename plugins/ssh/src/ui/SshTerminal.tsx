import { APPEARANCE_CHANGED, appearanceController, Button, Dialog, TerminalView, type TerminalInput, type TerminalViewProps } from "@huhu/ui";
import { host } from "@huhu/workbench";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { terminalLineHeights, useDevicePreferences } from "./device-preferences.js";
import { ShortcutPicker } from "./ShortcutPanel.js";

const monospace = {
  theme: undefined,
  jetbrains: '"JetBrains Mono Variable", monospace',
  system: "ui-monospace, Consolas, monospace",
};

export const canScaleTerminal = () => typeof CSS !== "undefined" && CSS.supports("zoom", "1");

function openTerminalLink(url: string) {
  const desktop = host()?.openExternal;
  if (desktop) void desktop(url).catch(() => undefined);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export function SshTerminal(props: TerminalViewProps) {
  const { fontSize, font, terminalLineHeight, terminalCursor, terminalCursorBlink, terminalScrollback, terminalWordSeparator, terminalLinkActivation,
    terminalCopyOnSelect, terminalRightClickWord, terminalScrollOnInput, terminalHighlight, terminalCompletion, terminalBellNotice } = useDevicePreferences();
  const [input, setInput] = useState<TerminalInput>();
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const [bells, setBells] = useState(0);
  const original = useRef(props.onTerminalInput);
  original.current = props.onTerminalInput;
  const onTerminalInput = useCallback((next: TerminalInput | undefined) => {
    setInput(() => next);
    if (!next) setCompleting(false);
    original.current?.(next);
  }, []);
  const displayOptions = useMemo(
    () => ({ lineHeight: terminalLineHeights[terminalLineHeight], cursorStyle: terminalCursor, cursorBlink: terminalCursorBlink, scrollback: terminalScrollback, wordSeparator: terminalWordSeparator,
      rightClickSelectsWord: terminalRightClickWord, scrollOnUserInput: terminalScrollOnInput }),
    [terminalLineHeight, terminalCursor, terminalCursorBlink, terminalScrollback, terminalWordSeparator, terminalRightClickWord, terminalScrollOnInput],
  );
  const scale = canScaleTerminal() ? fontSize / 13 : 1;
  const previous = useRef(font);
  useEffect(() => {
    // TerminalView re-reads its inherited font on the standard appearance event.
    if (previous.current !== font) window.dispatchEvent(new CustomEvent(APPEARANCE_CHANGED, { detail: appearanceController().get() }));
    previous.current = font;
  }, [font]);
  const style = { zoom: scale, "--font-mono": monospace[font] } as CSSProperties;
  function openCompletion() {
    setCompletionError("");
    setCompleting(true);
  }
  return (
    <>
      {terminalCompletion && <Button type="button" disabled={!input} aria-keyshortcuts="Control+Space" onClick={openCompletion}>命令补全</Button>}
      {terminalBellNotice && bells > 0 && <span role="status">终端响铃次数 {bells}</span>}
      <div className="ssh-terminal-preferences" data-testid="ssh-terminal-preferences">
        <div className="ssh-terminal-scale" style={style} data-font={font}>
          <TerminalView {...props} displayOptions={displayOptions} scrollbackSearch onOpenLink={openTerminalLink} linkActivation={terminalLinkActivation}
            copyOnSelect={terminalCopyOnSelect} highlightKeyword={terminalHighlight} onTerminalInput={onTerminalInput}
            onCompletionRequest={terminalCompletion && input ? openCompletion : undefined} onBell={terminalBellNotice ? () => setBells((count) => count + 1) : undefined} />
        </div>
      </div>
      {terminalCompletion && completing && input && <Dialog open title="终端命令补全" description="选择快捷命令插入当前终端。" error={completionError} onClose={() => setCompleting(false)}>
        <ShortcutPicker onSelect={(entry) => {
          if (input(entry.text, false) === "sent") setCompleting(false);
          else setCompletionError("当前终端无法插入这条快捷命令。");
        }} />
      </Dialog>}
    </>
  );
}
