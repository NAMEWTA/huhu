import { dialog, shell, type BrowserWindow } from "electron";

export function externalHttpUrl(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 4096 || !/^https?:\/\//i.test(input) || /[\p{Cc}\s]/u.test(input)) return null;
  const url = URL.parse(input);
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
  return url.href;
}

export async function confirmExternalLink(win: BrowserWindow, input: unknown, isCurrent = () => true): Promise<boolean> {
  const url = externalHttpUrl(input);
  if (!url || win.isDestroyed() || !isCurrent()) return false;
  const { response } = await dialog.showMessageBox(win, {
    type: "question",
    message: "在系统浏览器中打开此链接？",
    detail: url,
    buttons: ["取消", "打开链接"],
    cancelId: 0,
    defaultId: 0,
    noLink: true,
  });
  if (response !== 1 || win.isDestroyed() || !isCurrent()) return false;
  try {
    await shell.openExternal(url);
    return true;
  } catch {
    await dialog.showMessageBox(win, { type: "error", message: "无法在系统浏览器中打开链接", detail: url });
    return false;
  }
}
