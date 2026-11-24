import { appearanceController, Button, EmptyState } from "@huhu/ui";
import { installBrowserDraftGuard, switchBrowserDraftScope } from "@huhu/workbench";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browserEndpoint, joinBrowserWorkbench, type BrowserEndpoint } from "../renderer/web-host.js";
import { WorkbenchApp } from "../renderer/workbench.js";

appearanceController().refresh();

type BrowserState = { status: "loading" | "expired" | "unavailable" } | { status: "ready"; endpoint: BrowserEndpoint };

function BrowserRoot() {
  const [session, setSession] = useState<BrowserState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    void joinBrowserWorkbench(signal).then(
      (endpoint) => {
        if (!controller.signal.aborted) {
          switchBrowserDraftScope(endpoint);
          setSession(endpoint ? { status: "ready", endpoint } : { status: "expired" });
        }
      },
      () => {
        if (!controller.signal.aborted) setSession({ status: "unavailable" });
      },
    );
    return () => controller.abort();
  }, []);

  const endpoint = session.status === "ready" ? session.endpoint : undefined;
  useEffect(() => (endpoint ? installBrowserDraftGuard() : undefined), [endpoint]);

  const checkSession = useCallback((state: "connected" | "reconnecting") => {
    if (state !== "reconnecting" || !endpoint) return;
    void browserEndpoint()
      .then((current) => {
        if (current?.generation === endpoint.generation && current?.vaultId === endpoint.vaultId && current.browserSessionId === endpoint.browserSessionId) return;
        switchBrowserDraftScope(null, endpoint);
        setSession((previous) => {
          return previous.status === "ready" && previous.endpoint === endpoint ? { status: "expired" } : previous;
        });
      })
      .catch(() => undefined); // 暂时断网时由事件流重连，保留正在编辑的内容。
  }, [endpoint]);

  if (session.status === "ready") return <WorkbenchApp key={session.endpoint.generation} endpoint={session.endpoint} state="ready" browser onConnection={checkSession} />;
  if (session.status === "loading") return <EmptyState title="正在连接工作台" />;
  return <EmptyState title={session.status === "expired" ? "浏览器会话不可用" : "无法连接工作台"} hint="打开桌面端提供的有效邀请链接。" action={<Button onClick={() => location.reload()}>重新连接</Button>} />;
}

createRoot(document.getElementById("root")!).render(<BrowserRoot />);
