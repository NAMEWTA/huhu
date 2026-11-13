import { Popover } from "@huhu/ui";
import { Check, ChevronDown, Folder, FolderOpen, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { host, type VaultHostState } from "../settings/host.js";

/** 顶栏中部的 Vault 切换器（modules/workbench.md §2）：当前 Vault 名称 + 下拉：最近打开过的 Vault、打开其他 Vault…、关闭 Vault。选中后经 VaultSwitchDialog 处理未保存文档再切换。 */
export function VaultMenu({ vaultName, onSwitch }: { vaultName: string; onSwitch(target?: { path: string; name: string }): void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<VaultHostState | null>(null);
  useEffect(() => {
    if (open)
      void host()
        ?.vault.state()
        .then(setState, () => setState(null));
  }, [open]);
  const pick = (target?: { path: string; name: string }) => {
    setOpen(false);
    onSwitch(target);
  };
  const recent = (state?.recent ?? []).slice(0, 8);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="window-center vault-title-button" data-testid="vault-name" aria-label="切换 Vault" aria-haspopup="menu" aria-expanded={open}>
          <Folder size={13} aria-hidden />
          <span>{vaultName}</span>
          <ChevronDown size={12} aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="knowledge-file-menu vault-menu" role="menu" aria-label="Vault 菜单" sideOffset={6} align="center" data-testid="vault-menu" style={{ minWidth: 260 }}>
          <div className="knowledge-menu-caption">最近打开过的 Vault</div>
          {recent.length === 0 ? <div className="knowledge-menu-caption">没有其他记录</div> : null}
          {recent.map((r) => {
            const current = r.path === state?.path;
            return (
              <button key={r.path} type="button" role="menuitem" data-testid="vault-recent-item" title={r.path} disabled={current} onClick={() => pick({ path: r.path, name: r.name })}>
                {current ? <Check size={14} aria-hidden /> : <Folder size={14} aria-hidden />}
                {r.name}
              </button>
            );
          })}
          <hr />
          {host()?.pickOpenPath ? (
            <button
              type="button"
              role="menuitem"
              data-testid="vault-open-other"
              onClick={() =>
                void host()
                  ?.pickOpenPath("directory")
                  .then((p) => {
                    if (p) pick({ path: p, name: p.split(/[\\/]/).filter(Boolean).at(-1) ?? p });
                    else setOpen(false);
                  })
              }
            >
              <FolderOpen size={14} aria-hidden />
              打开其他 Vault…
            </button>
          ) : null}
          <button type="button" role="menuitem" data-testid="vault-close" onClick={() => pick()}>
            <LogOut size={14} aria-hidden />
            关闭 Vault
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
