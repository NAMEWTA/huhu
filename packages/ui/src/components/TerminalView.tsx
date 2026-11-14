import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { APPEARANCE_CHANGED } from "../theme.js";

export interface TerminalViewProps {
  /** Engine 基址（http://127.0.0.1:port）与令牌；WebSocket 经 `Sec-WebSocket-Protocol: bearer.<token>` 鉴权。 */
  baseUrl: string;
  token: string;
  /** 会话 id（Agent 会话；SSH shell 用 `ssh-` 前缀）。 */
  sessionId: string;
  observe?: boolean;
  ariaLabel: string;
  /** 程序结束或连接断开时通知宿主。 */
  onExit?(reason: string): void;
}

const ANSI = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"] as const;

/** xterm 不解析 CSS 变量：从宿主元素读出主题生成的 --term-* 与 --font-mono 的具体值。 */
function readTheme(el: HTMLElement): { theme: Record<string, string>; fontFamily: string } {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(`--${name}`).trim();
  const theme: Record<string, string> = { background: v("term-bg"), foreground: v("term-fg"), cursor: v("term-cursor"), selectionBackground: v("term-selection") };
  ANSI.forEach((name, i) => (theme[name] = v(`term-ansi-${i}`)));
  return { theme, fontFamily: v("font-mono") || "monospace" };
}

/** 终端视图：xterm.js ↔ Engine `/ws/terminal/:id`。关闭视图只 detach，进程继续运行。 */
export function TerminalView({ baseUrl, token, sessionId, observe = false, ariaLabel, onExit }: TerminalViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"connecting" | "open" | "ended" | "lost">("connecting");
  const [attempt, setAttempt] = useState(0); // 控制者离开后重新连接以接管输入
  const [demoted, setDemoted] = useState(false); // 另一个视图正在输入：本视图被服务端降级为观察者
  const exit = useRef(onExit);
  exit.current = onExit;

  useEffect(() => {
    if (!host.current) return;
    const look = readTheme(host.current);
    // minimumContrastRatio：xterm 自带，保证任何 ANSI 前景 / 背景组合都可读（例如浅色主题下的“白色”文字）
    const term = new Terminal({ cursorBlink: true, fontFamily: look.fontFamily, theme: look.theme, minimumContrastRatio: 4.5, fontSize: 13, convertEol: false, scrollback: 5000 });
    const el = host.current;
    const restyle = () => {
      const next = readTheme(el);
      term.options.theme = next.theme;
      term.options.fontFamily = next.fontFamily;
    };
    window.addEventListener(APPEARANCE_CHANGED, restyle);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();
    const url = new URL(baseUrl.replace(/^http/, "ws") + `/ws/terminal/${encodeURIComponent(sessionId)}`);
    url.searchParams.set("cols", String(term.cols));
    url.searchParams.set("rows", String(term.rows));
    if (observe) url.searchParams.set("mode", "observe");
    const ws = new WebSocket(url.toString(), [`bearer.${token}`]);
    ws.binaryType = "arraybuffer";
    let ended = false;
    let disposed = false; // 本次连接已被清理（切换会话 / 卸载 / 重连）：旧 socket 的回调不再改状态
    let observing = observe;
    setDemoted(false);
    ws.onopen = () => setState("open");
    ws.onmessage = (m) => {
      if (typeof m.data === "string") {
        try {
          const msg = JSON.parse(m.data) as { type?: string; mode?: string; reason?: { reason?: string; exit_code?: number | null } | null };
          if (disposed) return;
          if (msg.type === "mode" && msg.mode === "observe") {
            observing = true;
            setDemoted(true);
          } else if (msg.type === "mode" && msg.mode === "control-free") {
            setAttempt((a) => a + 1); // 另一个视图离开了：重新连接，成为控制者
          } else if (msg.type === "closed") {
            ended = true;
            setState("ended");
            exit.current?.(msg.reason?.reason ?? "exited");
          }
        } catch {
          /* 非 JSON 文本忽略 */
        }
      } else term.write(new Uint8Array(m.data as ArrayBuffer));
    };
    ws.onclose = () => {
      if (!ended && !disposed) {
        setState("lost");
        exit.current?.("lost");
      }
    };
    const enc = new TextEncoder();
    const inputSub = term.onData((d) => {
      if (!observing && ws.readyState === WebSocket.OPEN) ws.send(enc.encode(d));
    });
    const resizeSub = term.onResize(({ cols, rows }) => {
      if (!observing && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols, rows }));
    });
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* 容器不可见时忽略 */
      }
    });
    ro.observe(host.current);
    return () => {
      disposed = true;
      window.removeEventListener(APPEARANCE_CHANGED, restyle);
      ro.disconnect();
      inputSub.dispose();
      resizeSub.dispose();
      ws.close(); // detach
      term.dispose();
    };
  }, [baseUrl, token, sessionId, observe, attempt]);

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
