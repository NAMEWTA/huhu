import { Button } from "@huhu/ui";
import { host } from "@huhu/workbench";
import { ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";
import { v } from "./strings.js";

/** 查看器共用的工具条：面包屑 + 文件名 + 各查看器自己的操作 + “用系统应用打开”。 */
export function FileToolbar({ path, children }: { path: string; children?: ReactNode }) {
  const name = path.split("/").at(-1) ?? path;
  const [opened, setOpened] = useState<string | null>(null);
  const openExternally = async () => {
    const r = await host()?.openVaultFile?.(path);
    setOpened(r === "opened" ? v.openedExternal : r === "revealed" ? v.revealed : r === "missing" ? v.missing : v.cannotOpen);
  };
  return (
    <div className="hu-knowledge-document-toolbar">
      <div className="row grow">
        <span className="notes-breadcrumb">{path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : v.rootDir}</span>
        <span className="notes-filename">{name}</span>
      </div>
      {children}
      {host()?.openVaultFile ? (
        <Button icon={ExternalLink} data-testid="file-open-external" onClick={() => void openExternally()}>
          {v.openExternal}
        </Button>
      ) : null}
      {opened ? (
        <span className="small muted" role="status">
          {opened}
        </span>
      ) : null}
    </div>
  );
}
