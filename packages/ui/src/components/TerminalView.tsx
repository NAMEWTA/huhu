import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITerminalOptions } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { APPEARANCE_CHANGED } from "../theme.js";
import { shortcutPasteError, type ShortcutPasteError } from "./terminal-paste.js";

/** Input is sent only through the socket currently controlling this terminal. */
export type TerminalInput = (text: string, enter: boolean) => "sent" | "unavailable" | ShortcutPasteError;
export type TerminalControl = { id: string; canInput: boolean };
type DisplayOptions = Pick<ITerminalOptions, "cursorBlink" | "cursorStyle" | "lineHeight" | "scrollback">;
const defaultDisplayOptions = { cursorBlink: true, cursorStyle: "block", lineHeight: 1, scrollback: 5000 } satisfies DisplayOptions;

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
  /** 程序结束或连接断开时通知宿主。 */
  onExit?(reason: string): void;
  /** 桥接器授予输入控制后发布，离开此连接时撤回。 */
  onTerminalInput?(input: TerminalInput | undefined): void;
  /** 当前连接的 Agent 审查控制证明，离开连接时撤回。 */
  onTerminalControl?(control: TerminalControl | undefined): void;
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
export function TerminalView({ baseUrl, token, sessionId, observe = false, ariaLabel, displayOptions, onExit, onTerminalInput, onTerminalControl }: TerminalViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"connecting" | "open" | "ended" | "lost">("connecting");
  const [attempt, setAttempt] = useState(0); // 控制者离开后重新连接以接管输入
  const [demoted, setDemoted] = useState(false); // 另一个视图正在输入：本视图被服务端降级为观察者
  const exit = useRef(onExit);
  exit.current = onExit;
  const controlChanged = useRef(onTerminalControl);
  controlChanged.current = onTerminalControl;
  const currentDisplay = useRef(displayOptions);
  currentDisplay.current = displayOptions;
  const applyDisplay = useRef<((options: DisplayOptions | undefined) => void) | undefined>(undefined);

  useEffect(() => {
    if (!host.current) return;
    const el = host.current;
    // minimumContrastRatio：xterm 自带，保证任何 ANSI 前景 / 背景组合都可读（例如浅色主题下的“白色”文字）
    const term = new Terminal({ ...readTheme(el), ...defaultDisplayOptions, ...currentDisplay.current, minimumContrastRatio: 4.5, convertEol: false });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    let ws: WebSocket | undefined;
    let sentSize: { cols: number; rows: number } | undefined;
    let ended = false;
    let disposed = false; // 本次连接已被清理（切换会话 / 卸载 / 重连）：旧 socket 的回调不再改状态
    let observing = observe;
    let inputGranted = false;
    let control: TerminalControl | undefined;
    const enc = new TextEncoder();
    const canSend = () => !disposed && !ended && !observing && ws?.readyState === WebSocket.OPEN;
    const setControl = (next?: TerminalControl) => {
      if (control?.id === next?.id && control?.canInput === next?.canInput) return;
      control = next;
      controlChanged.current?.(next);
    };
    const revokeInput = () => {
      if (!inputGranted) return;
      inputGranted = false;
      onTerminalInput?.(undefined);
    };
    const sendInput: TerminalInput = (text, enter) => {
      if (!inputGranted || !canSend()) return "unavailable";
      const error = shortcutPasteError(text, enter, term.modes.bracketedPasteMode);
      if (error) return error;
      term.paste(text);
      if (enter) ws?.send(enc.encode("\r"));
      return "sent";
    };
    const syncSize = () => {
      const { cols, rows } = term;
      if (!canSend() || (sentSize?.cols === cols && sentSize.rows === rows)) return;
      ws?.send(JSON.stringify({ type: "resize", cols, rows }));
      sentSize = { cols, rows };
    };
    const connect = () => {
      const url = new URL(baseUrl.replace(/^http/, "ws") + `/ws/terminal/${encodeURIComponent(sessionId)}`);
      const { cols, rows } = term;
      sentSize = { cols, rows };
      url.searchParams.set("cols", String(cols));
      url.searchParams.set("rows", String(rows));
      if (observe) url.searchParams.set("mode", "observe");
      const socket = new WebSocket(url.toString(), token ? [`bearer.${token}`] : undefined);
      ws = socket;
      socket.binaryType = "arraybuffer";
      setDemoted(false);
      setState("connecting");
      socket.onopen = () => {
        if (!disposed) {
          setState("open");
          syncSize();
        }
      };
      socket.onmessage = (m) => {
        if (disposed) return;
        if (typeof m.data === "string") {
          try {
            const msg = JSON.parse(m.data) as { type?: string; mode?: string; controlId?: string; reason?: { reason?: string; exit_code?: number | null } | null };
            if (msg.type === "mode" && msg.mode === "control" && !observe) {
              observing = false;
              syncSize();
              setDemoted(false);
              setControl(msg.controlId ? { id: msg.controlId, canInput: true } : undefined);
              if (onTerminalInput && !inputGranted && canSend()) {
                inputGranted = true;
                onTerminalInput(sendInput);
              }
            } else if (msg.type === "mode" && msg.mode === "observe") {
              observing = true;
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
    let frame: number | undefined;
    const measure = () => {
      frame = undefined;
      // A hidden pane keeps its last grid and socket. FitAddon otherwise clamps a zero-sized host to 2×1.
      if (!el.clientWidth || !el.clientHeight) return;
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
      revokeInput();
      setControl();
      window.removeEventListener(APPEARANCE_CHANGED, restyle);
      ro.disconnect();
      inputSub.dispose();
      resolution?.removeEventListener("change", watchResolution);
      document.fonts.removeEventListener("loadingdone", scheduleFit);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      ws?.close(); // detach
      term.dispose();
    };
  }, [baseUrl, token, sessionId, observe, attempt, onTerminalInput]);

  useEffect(() => applyDisplay.current?.(displayOptions), [displayOptions]);

  return (
    <div className="hu-terminal-wrap" data-testid="terminal-view" data-state={state}>
      <div ref={host} className="hu-terminal" role="application" aria-label={ariaLabel} />
      {observe || demoted ? (
        <div className="hu-terminal-overlay" data-testid="terminal-observer" style={{ inset: "auto 8px 8px auto", padding: "2px 8px", pointerEvents: "none" }}>
          观察模式 · 不能输入
        </div>
      ) : null}
      {state === "ended" ? <div className="hu-terminal-overlay">程序已结束</div> : state === "lost" ? <div className="hu-terminal-overlay">连接已断开</div> : null}
    </div>
  );
}
