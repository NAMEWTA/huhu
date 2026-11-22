import { APPEARANCE_CHANGED, appearanceController, TerminalView, type TerminalViewProps } from "@huhu/ui";
import { useEffect, useRef, type CSSProperties } from "react";
import { useDevicePreferences } from "./device-preferences.js";
import type { TerminalInput } from "../shared/terminal-actions.js";

const monospace = {
  theme: undefined,
  jetbrains: '"JetBrains Mono Variable", monospace',
  system: "ui-monospace, Consolas, monospace",
};

export const canScaleTerminal = () => typeof CSS !== "undefined" && CSS.supports("zoom", "1");

export function SshTerminal(props: TerminalViewProps & { onTerminalInput?: (input: TerminalInput | undefined) => void }) {
  const { fontSize, font } = useDevicePreferences();
  const scale = canScaleTerminal() ? fontSize / 13 : 1;
  const previous = useRef(font);
  useEffect(() => {
    // TerminalView re-reads its inherited font on the standard appearance event.
    if (previous.current !== font) window.dispatchEvent(new CustomEvent(APPEARANCE_CHANGED, { detail: appearanceController().get() }));
    previous.current = font;
  }, [font]);
  const style = { zoom: scale, "--font-mono": monospace[font] } as CSSProperties;
  return (
    <div className="ssh-terminal-preferences" data-testid="ssh-terminal-preferences">
      <div className="ssh-terminal-scale" style={style} data-font={font}>
        <TerminalView {...props} />
      </div>
    </div>
  );
}
