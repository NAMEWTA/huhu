import type { CapabilityCatalogEntry, McpCatalogView, McpSourcesView, TaskDto, TaskMcpTool } from "@huhu/contracts";
import { Button, DataTable, Dialog } from "@huhu/ui";
import { useCapability, useEngine } from "@huhu/workbench";
import { useId, useState } from "react";

const keyOf = ({ sourceId, upstreamIdentity, sourceRevision }: TaskMcpTool) => JSON.stringify([sourceId, upstreamIdentity, sourceRevision]);

export function TaskMcpAuthorization({ task, close, refresh }: { task: TaskDto; close(): void; refresh(): Promise<unknown> }) {
  const engine = useEngine();
  const caps = useCapability<CapabilityCatalogEntry[]>("capabilities.list", { includeInactive: true });
  const catalog = useCapability<McpCatalogView>("mcp.catalog.list");
  const sources = useCapability<McpSourcesView>("mcp.sources.list");
  const [selected, setSelected] = useState(task.mcpAuthorization?.tools ?? []);
  const [expectedVersion] = useState(task.version);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const formId = useId();
  const writable = !task.readOnly && !!engine.endpoint.token;
  const eligible = task.execution?.provider === "codex" && (task.execution.target?.mode ?? "new") === "new";
  const choices = new Map<string, { tool: TaskMcpTool; name: string; source: string; available: boolean }>();
  for (const capability of caps.data ?? []) {
    if (!capability.exposed) continue;
    const tool = { sourceId: "builtin", upstreamIdentity: capability.name, sourceRevision: null };
    choices.set(keyOf(tool), { tool, name: capability.name, source: "Huhu 内置", available: true });
  }
  for (const entry of catalog.data?.entries ?? []) {
    if (entry.kind !== "tool" || !entry.selected || entry.sourceId === "builtin") continue;
    const source = sources.data?.sources.find(({ source }) => source.sourceId === entry.sourceId);
    if (!source || source.state !== "ready") continue;
    const tool = { sourceId: entry.sourceId, upstreamIdentity: entry.upstreamIdentity, sourceRevision: source.source.revision };
    choices.set(keyOf(tool), { tool, name: entry.publicKey, source: source.source.displayName, available: true });
  }
  for (const tool of selected) {
    const key = keyOf(tool);
    if (choices.has(key)) continue;
    const source = tool.sourceId === "builtin" ? "Huhu 内置" : (sources.data?.sources.find(({ source }) => source.sourceId === tool.sourceId)?.source.displayName ?? tool.sourceId);
    choices.set(key, { tool, source, name: tool.upstreamIdentity, available: false });
  }
  const loading = caps.isPending || catalog.isPending || sources.isPending;
  async function save(tools: TaskMcpTool[]) {
    setSaving(true);
    setError(undefined);
    try {
      await engine.call("tasks.mcp.authorize", { id: task.id, expectedVersion, tools }, { write: true });
      await refresh();
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title="任务 MCP 授权"
      onClose={() => {
        if (!saving) close();
      }}
      error={error}
      actions={
        <>
          {writable && task.mcpAuthorization ? (
            <Button type="button" disabled={saving} onClick={() => void save([])}>
              撤销任务授权
            </Button>
          ) : null}
          {writable && eligible ? (
            <Button type="submit" form={formId} variant="primary" disabled={saving || loading}>
              保存工具授权
            </Button>
          ) : null}
        </>
      }
    >
      <form
        id={formId}
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          if (writable && eligible && !saving && !loading) void save(selected);
        }}
      >
        <fieldset className="tasks-mcp-tools" disabled={!writable || saving}>
          <legend>允许此任务使用的工具</legend>
          {loading ? <p role="status">正在读取能力目录…</p> : null}
          {!loading && (caps.isError || catalog.isError || sources.isError) ? <p role="status">部分能力目录无法读取。</p> : null}
          <DataTable
            label="任务工具目录"
            scrollLabel="滚动查看任务工具"
            rows={[...choices.values()]}
            rowKey={({ tool }) => keyOf(tool)}
            empty={<p>能力网关当前没有可授权的工具。</p>}
            columns={[
              { id: "tool", header: "工具", cell: ({ name }) => <code>{name}</code> },
              { id: "source", header: "来源", cell: ({ source }) => source },
              {
                id: "allow",
                header: "授权",
                cell: ({ tool, name, source, available }) => {
                  const checked = selected.some((item) => keyOf(item) === keyOf(tool));
                  return (
                    <label className="tasks-mcp-tool-choice">
                      <input
                        type="checkbox"
                        name="tool"
                        checked={checked}
                        disabled={!eligible || (!checked && (!available || selected.length >= 64))}
                        onChange={({ target }) => setSelected((items) => [...items.filter((item) => item.sourceId !== tool.sourceId || item.upstreamIdentity !== tool.upstreamIdentity), ...(target.checked ? [tool] : [])])}
                      />
                      <span>
                        {`选择 ${name}（${source}）`}
                        {available ? "" : " · 当前不可用"}
                      </span>
                    </label>
                  );
                },
              },
            ]}
          />
        </fieldset>
      </form>
    </Dialog>
  );
}
