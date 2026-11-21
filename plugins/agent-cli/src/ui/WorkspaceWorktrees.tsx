import { Button } from "@huhu/ui";
import { host, useCapability, useEngine } from "@huhu/workbench";
import { FolderOpen, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { Space } from "../shared/space.js";

type Worktree = { root: string; branch: string | null; availability: "available" | "missing" };

export function WorkspaceWorktrees({ space, onSpace }: { space: Space; onSpace(space: Space): void }) {
  const engine = useEngine();
  const source = { spaceId: space.id, spaceRevision: space.revision };
  const listing = useCapability<{ repository: string; worktrees: Worktree[] }>("agent.workspace.worktrees.list", source);
  const [branch, setBranch] = useState("");
  const [destination, setDestination] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function perform(input: { root: string } | { dir: string; branch: string }) {
    if (pending || listing.isError) return;
    setPending(true);
    setError(null);
    try {
      const capability = "root" in input ? "agent.workspace.worktrees.open" : "agent.workspace.worktrees.create";
      onSpace(await engine.call<Space>(capability, { ...source, ...input }, { write: true }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "无法确认 worktree 操作结果");
    } finally {
      setPending(false);
    }
  }

  async function choose() {
    try {
      const next = await host()?.pickOpenPath("directory");
      if (next) setDestination(next);
    } catch {
      setError("无法打开本机文件夹选择器");
    }
  }

  return (
    <section aria-label="Git worktree">
      <div className="row">
        <code className="hu-flex-fill">{listing.data?.repository ?? space.root}</code>
        <Button icon={RefreshCw} disabled={pending || listing.isFetching} onClick={() => void listing.refetch()}>
          刷新 worktree
        </Button>
      </div>
      {listing.isError ? <p role="alert">{listing.error.message}</p> : null}
      {listing.isFetching && !listing.data ? <p role="status">正在读取 Git worktree…</p> : null}
      {listing.data?.worktrees.map((tree) => (
        <div className="row" key={tree.root}>
          <div className="hu-flex-fill">
            <strong>{tree.branch ?? "分离 HEAD"}</strong>
            <p>
              <code>{tree.root}</code>
              {tree.availability === "missing" ? " · 目录不可用" : ""}
            </p>
          </div>
          <Button disabled={pending || listing.isError || tree.availability !== "available"} onClick={() => void perform({ root: tree.root })}>
            打开工作区
          </Button>
        </div>
      ))}
      {listing.data ? (
        <form
          className="hu-form"
          onSubmit={(event) => {
            event.preventDefault();
            void perform({ dir: destination, branch });
          }}
        >
          <label>
            新分支
            <input className="hu-input" required value={branch} onChange={(event) => setBranch(event.target.value)} />
          </label>
          <div className="row">
            <Button type="button" icon={FolderOpen} disabled={pending} onClick={() => void choose()}>
              选择空目录
            </Button>
            {destination ? <code>{destination}</code> : null}
          </div>
          <Button type="submit" icon={Plus} disabled={pending || listing.isError || !branch.trim() || !destination}>
            建立 worktree
          </Button>
        </form>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
