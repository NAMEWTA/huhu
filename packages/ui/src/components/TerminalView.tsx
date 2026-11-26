import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ILinkHandler, type ITerminalOptions } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { APPEARANCE_CHANGED } from "../theme.js";
import { shortcutPasteError, type ShortcutPasteError } from "./terminal-paste.js";
import { searchTerminal, terminalHttpUrl, terminalLinks } from "./terminal-content.js";
import type { TerminalHighlightPattern } from "./terminal-highlight-patterns.js";
import { observeTerminalHighlights } from "./terminal-highlights.js";

/** Input is sent only through the socket currently controlling this terminal. */
export type TerminalInput = ((text: string, enter: boolean) => "sent" | "unavailable" | ShortcutPasteError) & { sendKeys?(keys: string): void };
export type TerminalControl = { id: string; canInput: boolean };
export type PrepareTerminalHandoff = (id: string, members?: number) => Promise<boolean>;
type DisplayOptions = Pick<ITerminalOptions, "cursorBlink" | "cursorStyle" | "lineHeight" | "scrollback" | "wordSeparator" | "scrollOnUserInput" | "rightClickSelectsWord">;
const defaultDisplayOptions = { cursorBlink: true, cursorStyle: "block", lineHeight: 1, scrollback: 5000, scrollOnUserInput: true } satisfies DisplayOptions;

export interface TerminalViewProps {
  /** 工作台所在的 Engine 基址；桌面附带回环令牌，浏览器自动携带同源 cookie。 */
  baseUrl: string;
  token: string | undefined;
  /** 会话 id（Agent 会话；SSH shell 用 `ssh-` 前缀）。 */
  sessionId: string;
  observe?: boolean;
  ariaLabel: string;
  /** View preferences can change without replacing the terminal connection. */
  displayOptions?: DisplayOptions;
  scrollbackSearch?: boolean;
  onOpenLink?(url: string): void;
  linkActivation?: boolean;
  /** 程序结束或连接断开时通知宿主。 */
  onExit?(reason: string): void;
  /** 桥接器授予输入控制后发布，离开此连接时撤回。 */
  onTerminalInput?(input: TerminalInput | undefined): void;
  /** 当前连接的 Agent 审查控制证明，离开连接时撤回。 */
  onTerminalControl?(control: TerminalControl | undefined): void;
  handoffId?: string;
  focusOnHandoff?: boolean;
  attachWhenHidden?: boolean;
  onTerminalHandoff?(prepare: PrepareTerminalHandoff | undefined): void;
  onHandoffControl?(): void;
  onTerminalKey?(keys: string): void;
  copyOnSelect?: boolean;
  highlightRules?: readonly TerminalHighlightPattern[];
  onCompletionRequest?: (() => void) | undefined;
  onBell?: (() => void) | undefined;
}

const ANSI = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"] as const;

/** xterm 不解析 CSS 变量：从宿主元素读出主题生成的 --term-* 与 --font-mono 的具体值。 */
function readTheme(el: HTMLElement): { theme: Record<string, string>; fontFamily: string; fontSize: number } {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(`--${name}`).trim();
  const theme: Record<string, string> = { background: v("term-bg"), foreground: v("term-fg"), cursor: v("term-cursor"), selectionBackground: v("term-selection") };
  ANSI.forEach((name, i) => (theme[name] = v(`term-ansi-${i}`)));
  return { theme, fontFamily: v("font-mono") || "monospace", fontSize: Number.parseFloat(cs.fontSize) || 13 };
}

/** 终端视图：xterm.js ↔ Engine `/ws/terminal/:id`。关闭视图只 detach，进程继续运行。 */
export function TerminalView({ baseUrl, token, sessionId, observe = false, ariaLabel, displayOptions, scrollbackSearch = false, onOpenLink, linkActivation = true, onExit, onTerminalInput, onTerminalControl, handoffId, focusOnHandoff = true, attachWhenHidden = false, onTerminalHandoff, onHandoffControl, onTerminalKey, copyOnSelect, highlightRules, onCompletionRequest, onBell }: TerminalViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"connecting" | "open" | "ended" | "lost">("connecting");
  const [attempt, setAttempt] = useState(0); // 控制者离开后重新连接以接管输入
  const [demoted, setDemoted] = useState(false); // 另一个视图正在输入：本视图被服务端降级为观察者
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResult, setSearchResult] = useState("");
  const search = useRef<{ find(text: string, direction: "next" | "previous"): boolean; close(): void }>(undefined);
  const searchInput = useRef<HTMLInputElement>(null);
  const openLink = useRef(onOpenLink);
  openLink.current = onOpenLink;
  const linksEnabled = useRef(linkActivation);
  linksEnabled.current = linkActivation;
  const hasLinkHandler = onOpenLink !== undefined;
  const exit = useRef(onExit);
  exit.current = onExit;
  const controlChanged = useRef(onTerminalControl);
  controlChanged.current = onTerminalControl;
  const handoffChanged = useRef(onTerminalHandoff);
  handoffChanged.current = onTerminalHandoff;
  const handoffControl = useRef(onHandoffControl);
  handoffControl.current = onHandoffControl;
  const focusTransferred = useRef(focusOnHandoff);
  focusTransferred.current = focusOnHandoff;
  const terminalKey = useRef(onTerminalKey);
  terminalKey.current = onTerminalKey;
  const clipboardSelection = useRef(copyOnSelect);
  clipboardSelection.current = copyOnSelect;
  const completion = useRef(onCompletionRequest);
  completion.current = onCompletionRequest;
  const bellNotice = useRef(onBell);
  bellNotice.current = onBell;
  const rules = useRef(highlightRules);
  rules.current = highlightRules;
  const refreshHighlights = useRef<() => void>(undefined);
  const supportsHighlight = highlightRules !== undefined;
  const currentDisplay = useRef(displayOptions);
  currentDisplay.current = displayOptions;
  const applyDisplay = useRef<((options: DisplayOptions | undefined) => void) | undefined>(undefined);

  useEffect(() => {
    if (!host.current) return;
    const el = host.current;
    const linkHandler = {
      activate(event: MouseEvent, text: string) {
        if (!linksEnabled.current || (!event.ctrlKey && !event.metaKey)) return;
        const url = terminalHttpUrl(text);
        if (!url) return;
        event.preventDefault();
        openLink.current?.(url);
      },
      hover(_event: MouseEvent, text: string) {
        if (!linksEnabled.current) return;
        const url = terminalHttpUrl(text);
        if (url) el.title = `${url}（Ctrl 或 ⌘ 加点击打开）`;
      },
      leave() {
        el.removeAttribute("title");
      },
    } satisfies ILinkHandler;
    // minimumContrastRatio：xterm 自带，保证任何 ANSI 前景 / 背景组合都可读（例如浅色主题下的“白色”文字）
    const term = new Terminal({ ...readTheme(el), ...defaultDisplayOptions, ...currentDisplay.current, ...(hasLinkHandler && { linkHandler }), minimumContrastRatio: 4.5, convertEol: false, allowProposedApi: supportsHighlight });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    const bell = term.onBell(() => bellNotice.current?.());
    const selection = term.onSelectionChange(() => {
      const selected = clipboardSelection.current && term.getSelection();
      if (selected) void navigator.clipboard?.writeText(selected).catch(() => undefined);
    });
    const highlights = supportsHighlight ? observeTerminalHighlights(term, el, () => rules.current ?? []) : undefined;
    refreshHighlights.current = highlights?.update;
    const links = hasLinkHandler ? term.registerLinkProvider({
      provideLinks(row, callback) {
        if (!linksEnabled.current) return callback(undefined);
        const result = terminalLinks(term.buffer.active, term.cols, row - 1);
        callback(result.map(({ range, text }) => ({
          range: { start: { x: range.start.x + 1, y: range.start.y + 1 }, end: { x: range.end.x, y: range.end.y + 1 } },
          text,
          activate: linkHandler.activate,
          hover: linkHandler.hover,
          leave: linkHandler.leave,
        })));
      },
    }) : undefined;
    if (scrollbackSearch) {
      let previous = "";
      search.current = {
        find(text, direction) {
          const start = text === previous ? term.getSelectionPosition()?.start : undefined;
          previous = text;
          const result = searchTerminal(term.buffer.active, term.cols, text, direction, start);
          if (!result) {
            term.clearSelection();
            return false;
          }
          term.select(result.start.x, result.start.y, (result.end.y - result.start.y) * term.cols + result.end.x - result.start.x);
          term.scrollToLine(result.start.y);
          return true;
        },
        close() {
          previous = "";
          term.clearSelection();
          term.focus();
        },
      };
    }
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || event.isComposing || event.keyCode === 229) return true;
      if (completion.current && event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && event.code === "Space") {
        event.preventDefault();
        completion.current();
        return false;
      }
      if (!scrollbackSearch || !(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "f") return true;
      event.preventDefault();
      setSearching(true);
      searchInput.current?.focus();
      return false;
    });
    let ws: WebSocket | undefined;
    let sentSize: { cols: number; rows: number } | undefined;
    let ended = false;
    let disposed = false; // 本次连接已被清理（切换会话 / 卸载 / 重连）：旧 socket 的回调不再改状态
    let observing = observe || handoffId !== undefined;
    let inputGranted = false;
    let prepared: { id: string; resolve(ready: boolean): void } | undefined;
    let control: TerminalControl | undefined;
    const enc = new TextEncoder();
    const canSend = () => !disposed && !ended && !observing && ws?.readyState === WebSocket.OPEN;
    const setControl = (next?: TerminalControl) => {
      if (control?.id === next?.id && control?.canInput === next?.canInput) return;
      control = next;
      controlChanged.current?.(next);
    };
    const revokeInput = () => {
      prepared?.resolve(false);
      handoffChanged.current?.(undefined);
      if (!inputGranted) return;
      inputGranted = false;
      onTerminalInput?.(undefined);
    };
    const prepareHandoff: PrepareTerminalHandoff = (id, members) => {
      if (!canSend() || prepared) return Promise.resolve(false);
      return new Promise((resolve) => {
        const timeout = setTimeout(() => prepared?.resolve(false), 3000);
        prepared = { id, resolve: (ready) => {
          clearTimeout(timeout);
          prepared = undefined;
          resolve(ready);
        } };
        ws!.send(JSON.stringify({ type: "prepare-handoff", id, members }));
      });
    };
    const sendInput: TerminalInput = (text, enter) => {
      if (!inputGranted || !canSend()) return "unavailable";
      const error = shortcutPasteError(text, enter, term.modes.bracketedPasteMode);
      if (error) return error;
      term.paste(text);
      if (enter) ws?.send(enc.encode("\r"));
      return "sent";
    };
    sendInput.sendKeys = (keys) => {
      if (inputGranted && canSend()) ws?.send(enc.encode(keys));
    };
    const syncSize = () => {
      const { cols, rows } = term;
      if (!canSend() || !el.clientWidth || !el.clientHeight || (sentSize?.cols === cols && sentSize.rows === rows)) return;
      ws?.send(JSON.stringify({ type: "resize", cols, rows }));
      sentSize = { cols, rows };
    };
    const connect = () => {
      const url = new URL(baseUrl.replace(/^http/, "ws") + `/ws/terminal/${encodeURIComponent(sessionId)}`);
      const { cols, rows } = term;
      sentSize = handoffId ? undefined : { cols, rows };
      url.searchParams.set("cols", String(cols));
      url.searchParams.set("rows", String(rows));
      if (observe || handoffId) url.searchParams.set("mode", "observe");
      const socket = new WebSocket(url.toString(), token ? [`bearer.${token}`] : undefined);
      ws = socket;
      socket.binaryType = "arraybuffer";
      setDemoted(false);
      setState("connecting");
      socket.onopen = () => {
        if (!disposed) {
          setState("open");
          if (handoffId) socket.send(JSON.stringify({ type: "claim-handoff", id: handoffId }));
          else syncSize();
        }
      };
      socket.onmessage = (m) => {
        if (disposed) return;
        if (typeof m.data === "string") {
          try {
            const msg = JSON.parse(m.data) as { type?: string; mode?: string; id?: string; controlId?: string; reason?: { reason?: string; exit_code?: number | null } | null };
            if (msg.type === "handoff-prepared" && prepared && prepared.id === msg.id) prepared.resolve(true);
            if (msg.type === "mode" && msg.mode === "control" && !observe) {
              observing = false;
              syncSize();
              setDemoted(false);
              setControl(msg.controlId ? { id: msg.controlId, canInput: true } : undefined);
              if (handoffId) {
                if (focusTransferred.current) term.focus();
                handoffControl.current?.();
              } else {
                handoffChanged.current?.(prepareHandoff);
              }
              if (onTerminalInput && !inputGranted && canSend()) {
                inputGranted = true;
                onTerminalInput(sendInput);
              }
            } else if (msg.type === "mode" && msg.mode === "observe") {
              observing = true;
              sentSize = undefined;
              revokeInput();
              setControl(!observe && msg.controlId ? { id: msg.controlId, canInput: false } : undefined);
              setDemoted(true);
            } else if (msg.type === "mode" && msg.mode === "control-free") {
              observing = true;
              revokeInput();
              setControl();
              setAttempt((a) => a + 1); // 另一个视图离开了：重新连接，成为控制者
            } else if (msg.type === "closed") {
              ended = true;
              revokeInput();
              setControl();
              setState("ended");
              exit.current?.(msg.reason?.reason ?? "exited");
            }
          } catch {
            /* 非 JSON 文本忽略 */
          }
        } else term.write(new Uint8Array(m.data as ArrayBuffer));
      };
      socket.onclose = () => {
        revokeInput();
        setControl();
        if (!ended && !disposed) {
          setState("lost");
          exit.current?.("lost");
        }
      };
    };
    const inputSub = term.onData((d) => {
      if (canSend()) ws?.send(enc.encode(d));
    });
    // xterm's keyboard event excludes device reports, mouse events, and programmatic paste.
    const keySub = term.onKey(({ key }) => {
      if (inputGranted && canSend()) terminalKey.current?.(key);
    });
    let frame: number | undefined;
    const measure = () => {
      frame = undefined;
      // A hidden pane keeps its last grid and socket. FitAddon otherwise clamps a zero-sized host to 2×1.
      if (!el.clientWidth || !el.clientHeight) {
        if (attachWhenHidden && !ws) connect();
        return;
      }
      const proposed = fit.proposeDimensions();
      if (!proposed || !Number.isFinite(proposed.cols) || !Number.isFinite(proposed.rows)) return;
      fit.fit();
      if (ws) syncSize();
      else connect();
    };
    const scheduleFit = () => {
      if (!disposed && frame === undefined) frame = window.requestAnimationFrame(measure);
    };
    applyDisplay.current = (options) => {
      term.options = { ...defaultDisplayOptions, ...options };
      scheduleFit();
    };
    const restyle = () => {
      const next = readTheme(el);
      term.options.theme = next.theme;
      term.options.fontFamily = next.fontFamily;
      term.options.fontSize = next.fontSize;
      scheduleFit();
      highlights?.schedule();
    };
    // xterm updates its cell metrics on DPR changes, even when the CSS box keeps its size.
    let resolution: MediaQueryList;
    const watchResolution = () => {
      resolution?.removeEventListener("change", watchResolution);
      resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      resolution.addEventListener("change", watchResolution);
      scheduleFit();
    };
    const ro = new ResizeObserver(scheduleFit);
    ro.observe(el);
    window.addEventListener(APPEARANCE_CHANGED, restyle);
    document.fonts.addEventListener("loadingdone", scheduleFit);
    void document.fonts.ready.then(scheduleFit);
    watchResolution();
    return () => {
      disposed = true;
      applyDisplay.current = undefined;
      search.current = undefined;
      refreshHighlights.current = undefined;
      highlights?.dispose();
      selection.dispose();
      bell.dispose();
      links?.dispose();
      el.removeAttribute("title");
      revokeInput();
      setControl();
      window.removeEventListener(APPEARANCE_CHANGED, restyle);
      ro.disconnect();
      inputSub.dispose();
      keySub.dispose();
      resolution?.removeEventListener("change", watchResolution);
      document.fonts.removeEventListener("loadingdone", scheduleFit);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      ws?.close(); // detach
      term.dispose();
    };
  }, [baseUrl, token, sessionId, observe, attempt, onTerminalInput, hasLinkHandler, scrollbackSearch, handoffId, attachWhenHidden, supportsHighlight]);

  useEffect(() => applyDisplay.current?.(displayOptions), [displayOptions]);
  useEffect(() => refreshHighlights.current?.(), [highlightRules]);
  useEffect(() => { if (searching) searchInput.current?.focus(); }, [searching]);

  function find(direction: "next" | "previous") {
    if (searchText) setSearchResult(search.current?.find(searchText, direction) ? "已定位匹配内容" : "当前终端回滚中无匹配");
  }
  function closeSearch() {
    setSearching(false);
    setSearchResult("");
    search.current?.close();
  }

  return (
    <div className="hu-terminal-wrap" data-testid="terminal-view" data-state={state}>
      <div ref={host} className="hu-terminal" role="application" aria-label={ariaLabel} />
      {scrollbackSearch && (
        <div className="hu-terminal-search">
          {searching ? (
            <form role="search" aria-label="终端回滚搜索" onSubmit={(event) => { event.preventDefault(); find("next"); }}>
              <input
                ref={searchInput}
                type="search"
                aria-label="查找终端回滚"
                value={searchText}
                maxLength={256}
                onChange={(event) => { setSearchText(event.currentTarget.value); setSearchResult(""); }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                  if (event.key === "Escape") { event.preventDefault(); closeSearch(); }
                  if (event.key === "Enter" && event.shiftKey) { event.preventDefault(); find("previous"); }
                }}
              />
              <button type="button" disabled={!searchText} onClick={() => find("previous")}>上一处</button>
              <button type="submit" disabled={!searchText}>下一处</button>
              <button type="button" onClick={closeSearch}>关闭搜索</button>
              {searchResult && <p role="status">{searchResult}</p>}
            </form>
          ) : <button type="button" onClick={() => setSearching(true)}>查找终端回滚</button>}
        </div>
      )}
      {observe || demoted ? (
        <div className="hu-terminal-overlay" data-testid="terminal-observer" style={{ inset: "auto 8px 8px auto", padding: "2px 8px", pointerEvents: "none" }}>
          观察模式 · 不能输入
        </div>
      ) : null}
      {state === "ended" ? <div className="hu-terminal-overlay">程序已结束</div> : state === "lost" ? <div className="hu-terminal-overlay">连接已断开</div> : null}
    </div>
  );
}
