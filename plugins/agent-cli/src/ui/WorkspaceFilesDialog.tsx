import { Button, Dialog } from "@huhu/ui";
import { host, useCapability } from "@huhu/workbench";
import type { VaultListOutput } from "@huhu/contracts";
import { ArrowLeft, FolderOpen, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { Space } from "../shared/space.js";
import { WorkspaceWorktrees } from "./WorkspaceWorktrees.js";

type FileView = {
  path: string;
  relativeToVault: string | null;
  size: number;
} & ({ kind: "text"; text: string } | { kind: "unsupported"; reason: "size" | "encoding" });

export function WorkspaceFilesDialog({ space, open, writable, onClose, onSpace }: { space: Space; open: boolean; writable: boolean; onClose(): void; onSpace(space: Space): void }) {
  const [worktrees, showWorktrees] = useState(false);
  const [directory, setDirectory] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [openFeedback, setOpenFeedback] = useState<string | null>(null);
  const target = { spaceId: space.id, spaceRevision: space.revision };
  const list = useCapability<VaultListOutput>("agent.workspace.files.list", { ...target, directory, ...(pages.length ? { cursor: pages.at(-1) } : {}) }, { enabled: open && !worktrees });
  const preview = useCapability<FileView>("agent.workspace.files.open", { ...target, path: selected ?? "" }, { enabled: open && !!selected && !worktrees });
  const file = selected && !preview.isError && !preview.isFetching ? preview.data : undefined;
  const native = host()?.openVaultFile;
  const parentName = directory.split("/").slice(0, -1).join("/");

  function browse(path: string) {
    setSelected(null);
    setOpenFeedback(null);
    setDirectory(path);
    setPages([]);
  }

  function close() {
    showWorktrees(false);
    onClose();
  }

  if (worktrees)
    return (
      <Dialog open={open} title="工作区文件" onClose={close} wide>
        <Button icon={ArrowLeft} onClick={() => showWorktrees(false)}>
          返回文件
        </Button>
        <WorkspaceWorktrees space={space} onSpace={onSpace} />
      </Dialog>
    );
  return (
    <Dialog open={open} title="工作区文件" onClose={close} wide>
      <div className="row">
        <p className="hu-flex-fill">
          <code>{space.root}</code>
        </p>
        {host() && writable ? <Button onClick={() => showWorktrees(true)}>Git worktree</Button> : null}
      </div>
      <div className="row">
        {directory ? (
          <Button icon={ArrowLeft} onClick={() => browse(parentName)}>
            上一级
          </Button>
        ) : null}
        <code className="hu-flex-fill">{directory || "/"}</code>
        <Button icon={RefreshCw} disabled={list.isFetching} onClick={() => void list.refetch()}>
          刷新
        </Button>
      </div>
      {list.isError ? <p role="alert">{list.error.message}</p> : null}
      {list.isFetching && !list.data ? <p role="status">正在读取目录…</p> : null}
      {list.data?.entries.length === 0 ? <p>此目录中没有文件。</p> : null}
      {list.data?.entries.length ? (
        <ul aria-label="目录内容">
          {list.data.entries.map((entry) => (
            <li key={entry.path}>
              {entry.kind === "dir" ? (
                <Button icon={FolderOpen} onClick={() => browse(entry.path)}>
                  {entry.name}
                </Button>
              ) : entry.kind === "file" ? (
                <Button
                  onClick={() => {
                    setSelected(entry.path);
                    setOpenFeedback(null);
                  }}
                  aria-pressed={selected === entry.path}
                >
                  {entry.name}
                </Button>
              ) : (
                <span>{entry.name} · 链接目标不可用</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {pages.length || list.data?.nextCursor ? (
        <div className="row">
          <Button disabled={!pages.length} onClick={() => setPages((current) => current.slice(0, -1))}>
            上一页
          </Button>
          <Button disabled={!list.data?.nextCursor} onClick={() => setPages((current) => [...current, list.data!.nextCursor!])}>
            下一页
          </Button>
        </div>
      ) : null}
      {selected ? (
        <section aria-label="所选文件">
          <h3>{selected}</h3>
          {preview.isError ? (
            <>
              <p role="alert">{preview.error.message}</p>
              <Button onClick={() => void preview.refetch()}>重新打开</Button>
            </>
          ) : null}
          {preview.isFetching ? <p role="status">正在打开文件…</p> : null}
          {file ? (
            <>
              <p>
                <code>{file.path}</code>
              </p>
              {file.kind === "text" ? <pre>{file.text}</pre> : <p>{file.reason === "size" ? "文件超过 256 KiB 预览上限。" : "此文件无法按 UTF-8 文本预览。"}</p>}
              {file.relativeToVault && native ? (
                <Button
                  onClick={() =>
                    void native(file.relativeToVault!).then(
                      (result) => setOpenFeedback(result === "opened" ? "已交给系统应用打开。" : result === "revealed" ? "已在系统文件夹中定位。" : "无法通过系统应用打开此文件。"),
                      () => setOpenFeedback("无法通过系统应用打开此文件。"),
                    )
                  }
                >
                  用系统应用打开
                </Button>
              ) : null}
              {openFeedback ? <p role="status">{openFeedback}</p> : null}
            </>
          ) : null}
        </section>
      ) : null}
    </Dialog>
  );
}
