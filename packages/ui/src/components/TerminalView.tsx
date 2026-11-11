import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";

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

/** 终端视图：xterm.js ↔ Engine `/ws/terminal/:id`。关闭视图只 detach，进程继续运行。 */
export function TerminalView({ baseUrl, token, sessionId, observe = false, ariaLabel, onExit }: TerminalViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"connecting" | "open" | "ended" | "lost">("connecting");
  const [demoted, setDemoted] = useState(false); // 另一个视图正在输入：本视图被服务端降级为观察者
  const exit = useRef(onExit);
  exit.current = onExit;

  useEffect(() => {
    if (!host.current) return;
    const term = new Terminal({ cursorBlink: true, fontFamily: "var(--font-mono), monospace", fontSize: 13, convertEol: false, scrollback: 5000 });
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
    let observing = observe;
    setDemoted(false);
    ws.onopen = () => setState("open");
    ws.onmessage = (m) => {
      if (typeof m.data === "string") {
        try {
          const msg = JSON.parse(m.data) as { type?: string; mode?: string; reason?: { reason?: string; exit_code?: number | null } | null };
          if (msg.type === "mode" && msg.mode === "observe") {
            observing = true;
            setDemoted(true);
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
      if (!ended) {
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
      ro.disconnect();
      inputSub.dispose();
      resizeSub.dispose();
      ws.close(); // detach
      term.dispose();
    };
  }, [baseUrl, token, sessionId, observe]);

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
