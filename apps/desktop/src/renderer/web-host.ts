import type { EngineEndpoint } from "@huhu/workbench";

export type BrowserEndpoint = EngineEndpoint & { generation: string };

export async function browserEndpoint(signal = AbortSignal.timeout(5_000)): Promise<BrowserEndpoint | null> {
  const response = await fetch("/api/v1/bootstrap", { signal });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("无法连接工作台");
  const { vaultId, generation } = (await response.json()) as Partial<BrowserEndpoint>;
  if (typeof vaultId !== "string" || typeof generation !== "string") throw new Error("无法读取工作台会话");
  return { baseUrl: location.origin, vaultId, generation };
}

export async function joinBrowserWorkbench(signal: AbortSignal): Promise<BrowserEndpoint | null> {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const invite = fragment.get("invite");
  if (invite !== null) {
    const response = await fetch("/api/v1/session", { method: "POST", headers: { authorization: `Bearer ${invite}` }, signal });
    if (response.status === 401) return null;
    if (response.status !== 204) throw new Error("无法加入工作台");
    if (location.hash === url.hash) {
      const current = new URL(location.href);
      fragment.delete("invite");
      current.hash = fragment.toString();
      history.replaceState(history.state, "", current);
    }
  }
  return browserEndpoint(signal);
}

export function browserLocation(pathname: string): { module: "tasks" | "notes"; target?: string } | null {
  const match = /^\/(tasks|notes)(?:\/(.*))?$/.exec(pathname);
  if (!match) return null;
  const module = match[1] === "tasks" ? "tasks" : "notes";
  const path = match[2];
  if (!path) return { module };
  try {
    return { module, target: decodeURIComponent(path) };
  } catch {
    return { module };
  }
}
