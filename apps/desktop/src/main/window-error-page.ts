import type { WindowChromeColors } from "@huhu/workbench";
import { WINDOW_CHROME_HEIGHT, windowChromeFallback } from "../window-chrome-ipc.js";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

export function windowErrorPage(detail: string, logs: string, retry: string, colors: WindowChromeColors): string {
  const { left, right } = windowChromeFallback(process.platform);
  const html = `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <meta name="color-scheme" content="light dark">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
        <title>HUHU</title>
        <style>
          body { margin: 0; font-family: system-ui, sans-serif; background: ${colors.canvas}; color: ${colors.foreground}; }
          header { background: ${colors.background}; padding-top: env(titlebar-area-y, 0px); }
          header div {
            box-sizing: border-box;
            margin-left: env(titlebar-area-x, ${left}px);
            width: env(titlebar-area-width, calc(100% - ${left + right}px));
            min-height: max(${WINDOW_CHROME_HEIGHT}px, env(titlebar-area-height, 0px));
            display: flex; align-items: center; padding-inline: 12px;
            -webkit-app-region: drag; user-select: none;
          }
          main { margin: 2rem; overflow-wrap: anywhere; }
          a { color: inherit; -webkit-app-region: no-drag; }
        </style>
      </head>
      <body>
        <header data-testid="window-titlebar"><div>HUHU</div></header>
        <main>
          <h1>HUHU 无法加载界面</h1>
          <p>${escapeHtml(detail)}</p>
          <p>日志目录　${escapeHtml(logs)}</p>
          <a href="${escapeHtml(retry)}">重新加载工作台</a>
        </main>
      </body>
    </html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
