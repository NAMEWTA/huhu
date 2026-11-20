export const WINDOW_CHROME_STATE = "huhu:window-chrome:state";
export const WINDOW_CHROME_CHANGED = "huhu:window-chrome:changed";
export const WINDOW_CHROME_COLORS = "huhu:window-chrome:colors";
export const WINDOW_CHROME_HEIGHT = 40;

export function windowChromeFallback(platform: string) {
  if (platform === "win32") return { left: 0, right: 160 };
  if (platform === "darwin") return { left: 84, right: 0 };
  return { left: 144, right: 144 };
}
