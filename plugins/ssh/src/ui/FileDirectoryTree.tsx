import { Button } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { useState } from "react";
import type { FileDirectory } from "../shared/files.js";

export function directoryAncestors(cwd: string) {
  if (!cwd.startsWith("/")) return [];
  const path = ["/"];
  for (const name of cwd.split("/").filter(Boolean)) path.push(`${path.at(-1)!.replace(/\/$/u, "")}/${name}`);
  return path;
}

type Props = { fileSessionId: string; cwd: string; showDotFiles: boolean; openPath(path: string): void };

function Branch({ name, path, ...props }: Props & { name: string; path: string }) {
  const [expanded, expand] = useState(false);
  const listing = useCapability<FileDirectory>("ssh.sftp.list", { fileSessionId: props.fileSessionId, path }, { enabled: expanded });
  const folders = listing.data?.entries.filter(({ type, name }) => type === "dir" && (props.showDotFiles || !name.startsWith("."))) ?? [];
  return (
    <details onToggle={(event) => expand(event.currentTarget.open)}>
      <summary>{name}</summary>
      {expanded && (
        <>
          <Button type="button" aria-current={props.cwd === path ? "location" : undefined} onClick={() => props.openPath(path)}>
            打开 {name}
          </Button>
          {listing.isError && <p role="alert">无法读取此目录。</p>}
          {folders.length > 0 && (
            <ul>
              {folders.map((entry) => {
                const child = `${path === "/" ? "" : path}/${entry.name}`;
                return (
                  <li key={child}>
                    <Branch {...props} name={entry.name} path={child} />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </details>
  );
}

export function FileDirectoryTree(props: Props) {
  return (
    <nav aria-label="远端目录树">
      <Branch {...props} name="根目录" path="/" />
    </nav>
  );
}
