import { IconButton } from "@huhu/ui";
import { Menu } from "lucide-react";
import { host } from "../settings/host.js";

export function AppMenuButton() {
  const menu = host()?.appMenu;
  if (!menu?.button) return null;
  return (
    <IconButton
      icon={Menu}
      label="HUHU 应用菜单"
      aria-haspopup="menu"
      data-testid="app-menu-button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        void menu.open(bounds.left, bounds.bottom);
      }}
    />
  );
}
