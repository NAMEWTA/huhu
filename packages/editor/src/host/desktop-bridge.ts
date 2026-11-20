// window.okDesktop 的 Huhu 等价物（design §4）：只提供 vendor 编辑器实际读取的成员，其余缺省（vendor 全部以可选链读取）。
// 没有等价物的能力（skill / noteWindow / startup 云功能等）保持 undefined，对应入口由 OkHost.features 关闭。
import type { OkDesktopBridge } from "@inkeep/open-knowledge-core/desktop-bridge";
import type { OkHost } from "./ok-host";

const owners: OkHost[] = [];
let previous: OkDesktopBridge | undefined;
let installed: OkDesktopBridge | undefined;

export function installDesktopBridge(host: OkHost): () => void {
  const w = window as unknown as { okDesktop?: OkDesktopBridge };
  if (!owners.length) {
    previous = w.okDesktop;
    const p = navigator.platform.toLowerCase();
    installed = {
      platform: p.includes("win") ? "win32" : p.includes("mac") ? "darwin" : "linux",
      config: { projectPath: "", singleFile: false },
      shell: {
        openExternal: async (url: string) => {
          await owners.at(-1)?.openExternal(url);
        },
        recordHandoff: async () => {},
      },
      cliCommandName: null,
      mcpServerName: null,
    } as unknown as OkDesktopBridge;
    w.okDesktop = installed;
  }
  owners.push(host);
  return () => {
    const index = owners.indexOf(host);
    if (index < 0) return;
    owners.splice(index, 1);
    if (owners.length) return;
    if (w.okDesktop === installed) {
      if (previous === undefined) delete w.okDesktop;
      else w.okDesktop = previous;
    }
    previous = undefined;
    installed = undefined;
  };
}
