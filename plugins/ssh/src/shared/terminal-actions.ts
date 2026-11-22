/** The TerminalView controller sends only through the WebSocket bound to this view. */
export type TerminalInput = (text: string, enter: boolean) => boolean;
