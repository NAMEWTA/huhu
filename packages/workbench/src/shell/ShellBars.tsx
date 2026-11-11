import { IconButton } from "@huhu/ui";
import { applyAppearance } from "@huhu/ui";
import { Command, Keyboard, Moon, Sun } from "lucide-react";
import type { StoreApi } from "zustand/vanilla";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import type { UiState } from "../state/ui-store.js";

interface Settings {
  appearance: { theme: "pearl" | "suliworld" | "soft"; mode: "light" | "dark" | "system" } & Record<string, unknown>;
}
const prefersDark = (): boolean => window.matchMedia("(prefers-color-scheme: dark)").matches;

/** 面包屑栏的明暗切换（原型 月亮 / 太阳按钮）：在浅色和深色之间切换并保存到设置。 */
export function ThemeToggle() {
  const engine = useEngine();
  const qc = useQueryClient();
  const settings = useCapability<Settings>("settings.get", {});
  const mode = settings.data?.appearance.mode ?? "system";
  const dark = mode === "dark" || (mode === "system" && prefersDark());
  return (
    <IconButton
      icon={dark ? Sun : Moon}
      label="切换明暗主题"
      data-testid="theme-toggle"
      onClick={() => {
        void engine
          .call<Settings>("settings.update", { patch: { appearance: { mode: dark ? "light" : "dark" } } }, { write: true })
          .then((next) => {
            applyAppearance(document.documentElement, next.appearance, prefersDark());
            return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === "settings.get" });
          })
          .catch(() => undefined);
      }}
    />
  );
}

/** 底部状态栏（原型 status-bar）：Vault 状态 / 插件数 / MCP 开关 / 命令面板 / 快捷键。 */
export function ShellStatusBar({ ui }: { ui: StoreApi<UiState> }) {
  const plugins = useCapability<{ id: string; state: string }[]>("plugins.list", {});
  const gw = useCapability<{ mcp: { enabled: boolean } }>("gateway.get", {});
  const open = (id: string) => ui.getState().openModule(id);
  const active = (plugins.data ?? []).filter((p) => p.state === "active").length;
  return (
    <>
      <div className="row">
        <span className="status-dot" />
        <button type="button" onClick={() => open("health")}>
          Vault就绪
        </button>
        <span className="status-divider" />
        <button type="button" onClick={() => open("plugins")}>
          {active} 个插件
        </button>
        <button type="button" onClick={() => open("gateway")}>
          MCP {gw.data?.mcp.enabled ? "已开启" : "已关闭"}
        </button>
      </div>
      <div className="row">
        <span className="status-local">Vault 文件读写</span>
        <span className="status-divider" />
        <button type="button" onClick={() => ui.getState().setPaletteOpen(true)}>
          <Command size={11} aria-hidden /> 命令面板
        </button>
        <button type="button" aria-label="快捷键" onClick={() => open("settings")}>
          <Keyboard size={13} aria-hidden />
        </button>
      </div>
    </>
  );
}
