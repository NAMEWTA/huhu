import { randomUUID } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { BoundWorkspacePane, layoutProblem, MAX_WORKSPACE_PANES, removePaneAt, splitPaneAt, workspaceTree, WorkspaceDraft, WorkspaceLayout, WorkspaceName, type ChangeWorkbenchWorkspaceRun, type ChangeWorkspaceRun, type WorkspaceRun, type WorkspaceRunPane } from "../shared/workspace.js";
import type { HostConfigurations } from "./host-configurations.js";
import type { SshManager } from "./manager.js";
import { routeForHost, workspaceTarget } from "./workspace-target.js";
import type { WorkspaceTemplates } from "./workspace-templates.js";

const FILE = ".huhu/runtime/ssh/workspace-runs.json";
export const RunId = z.strictObject({ id: z.uuid() });
export const SaveRunTemplate = RunId.extend({ name: WorkspaceName });
export const StartWorkspace = z.union([z.strictObject({ templateId: z.uuid(), expectedRevision: z.uuid() }), WorkspaceDraft.extend({ name: WorkspaceName })]);
const Binding = BoundWorkspacePane.extend({ paneId: z.uuid(), label: z.string() });
const SavedRun = z
  .strictObject({
    id: z.uuid(),
    templateId: z.uuid().optional(),
    name: WorkspaceName,
    generation: z.number().int().min(1),
    layoutRevision: z.uuid().optional(),
    layout: WorkspaceLayout,
    panes: z.array(Binding).min(1).max(MAX_WORKSPACE_PANES),
  })
  .superRefine(({ panes, layout }, ctx) => {
    const problem = layoutProblem(panes, layout);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
    if (new Set(panes.map(({ paneId }) => paneId)).size !== panes.length) ctx.addIssue({ code: "custom", message: "工作区分栏 ID 重复" });
  });
const State = z.strictObject({ version: z.literal(1), runs: z.array(SavedRun) });
type SavedRun = z.infer<typeof SavedRun>;
type PaneState = Pick<WorkspaceRunPane, "sessionId" | "error">;
type LiveRun = { generation: number; panes: Map<string, PaneState>; controllers: Map<string, AbortController> };

export function editWorkspacePanes<Pane extends { paneId: string; hostId: string; label: string }>(current: { layout: WorkspaceLayout; panes: Pane[] }, change: ChangeWorkspaceRun["change"]) {
  const byId = new Map(current.panes.map((pane) => [pane.paneId, pane]));
  let layout = current.layout;
  let panes: Pane[];
  if (change.action === "layout") {
    if (change.paneIds.length !== byId.size || new Set(change.paneIds).size !== byId.size || change.paneIds.some((paneId) => !byId.has(paneId))) throw errors.invalidInput("分栏位置必须包含当前的所有分栏");
    panes = change.paneIds.map((paneId) => byId.get(paneId)!);
    layout = change.layout;
  } else if (change.action === "rename") {
    if (!byId.has(change.paneId)) throw errors.notFound("工作区分栏");
    panes = current.panes.map((pane) => pane.paneId === change.paneId ? { ...pane, label: change.label } : pane);
  } else {
    const closed = change.action === "close" ? [change.paneId] : change.paneIds;
    const removed = new Set(closed);
    if (closed.length !== removed.size) throw errors.invalidInput("关闭的分栏不能重复");
    if (closed.some((paneId) => !byId.has(paneId))) throw errors.notFound("工作区分栏");
    if (closed.length >= current.panes.length) throw errors.invalidInput("请通过关闭运行关闭最后一个分栏");
    panes = current.panes.filter(({ paneId }) => !removed.has(paneId));
    if (layout.kind === "custom") {
      let tree = layout.tree;
      for (let index = current.panes.length - 1; index >= 0; index--) {
        if (removed.has(current.panes[index]!.paneId)) tree = removePaneAt(tree, index)!;
      }
      layout = { kind: "custom", tree };
    }
  }
  const problem = layoutProblem(panes, layout);
  if (problem) throw errors.invalidInput(problem);
  return { layout, panes };
}

export class WorkspaceRuns {
  private live = new Map<string, LiveRun>();
  private disposed = false;

  constructor(
    private readonly files: HuhuApi["vault"]["files"],
    private readonly hosts: HostConfigurations,
    private readonly templates: WorkspaceTemplates,
    private readonly manager: SshManager,
    private readonly changed: (id: string) => void,
  ) {}

  list(): WorkspaceRun[] {
    return this.read().runs.map((run) => this.view(run));
  }

  start(input: z.infer<typeof StartWorkspace>, signal: AbortSignal) {
    return this.hosts.withStableDirectory(async () => {
      this.files.assertWritable();
      const { runs, fileVersion } = this.read();
      const hosts = new Map((await this.hosts.list()).map((host) => [host.id, host]));
      const template = "templateId" in input ? this.templates.get(input.templateId) : undefined;
      if (template && "expectedRevision" in input && template.revision !== input.expectedRevision) throw errors.versionConflict(template.revision);
      const draft = template ?? ("panes" in input ? input : undefined);
      if (!draft) throw errors.invalidInput("请选择要启动的工作区");
      const problem = layoutProblem(draft.panes, draft.layout);
      if (problem) throw errors.invalidInput(problem);
      const targets = new Map(template?.panes.map(({ hostId, target }) => [hostId, target]));
      const panes = draft.panes.map((pane) => ({
        ...pane,
        paneId: randomUUID(),
        label: hosts.get(pane.hostId)?.name ?? pane.hostId,
        target: targets.get(pane.hostId) ?? workspaceTarget(routeForHost(hosts, pane.hostId)),
      }));
      const run: SavedRun = { id: randomUUID(), generation: 1, name: draft.name, ...(template ? { templateId: template.id } : {}), layout: draft.layout, panes };
      await this.write([...runs, run], fileVersion, signal);
      this.begin(run);
      return this.view(run);
    });
  }

  reconnect(id: string, signal: AbortSignal) {
    return this.hosts.withStableDirectory(async () => {
      const { runs, fileVersion } = this.read();
      const saved = this.find(runs, id);
      if (this.live.get(id)?.generation === saved.generation) return this.view(saved);
      const run = { ...saved, generation: saved.generation + 1, layoutRevision: randomUUID() };
      await this.write(
        runs.map((entry) => (entry.id === run.id ? run : entry)),
        fileVersion,
        signal,
      );
      this.begin(run);
      return this.view(run);
    });
  }

  close(id: string, signal: AbortSignal) {
    return this.hosts.withStableDirectory(async () => {
      const { runs, fileVersion } = this.read();
      this.find(runs, id);
      await this.write(
        runs.filter((run) => run.id !== id),
        fileVersion,
        signal,
      );
      this.release(id);
      this.changed(id);
      return { ok: true as const };
    });
  }

  changeLayout({ id, expectedLayoutRevision, change }: ChangeWorkbenchWorkspaceRun, signal: AbortSignal): Promise<WorkspaceRun> {
    return this.hosts.withStableDirectory(async () => {
      const { runs, fileVersion } = this.read();
      const current = this.find(runs, id);
      const revision = current.layoutRevision ?? current.id;
      if (expectedLayoutRevision !== revision) throw errors.versionConflict(revision);
      const edited = change.action === "split" ? await this.split(current, change) : editWorkspacePanes(current, change);
      const { layout, panes } = edited;
      const saved = { ...current, layout, panes, layoutRevision: randomUUID() };
      await this.write(
        runs.map((run) => (run.id === id ? saved : run)),
        fileVersion,
        signal,
      );
      const live = this.live.get(id);
      if (live) {
        const kept = new Set(panes.map(({ paneId }) => paneId));
        for (const { paneId } of current.panes) if (!kept.has(paneId)) this.releasePane(live, paneId);
        if ("pane" in edited && !this.disposed) this.beginPane(saved, live, edited.pane);
      }
      this.changed(id);
      return this.view(saved);
    });
  }

  private async split(current: SavedRun, change: Extract<ChangeWorkbenchWorkspaceRun["change"], { action: "split" }>) {
    if (this.live.get(current.id)?.generation !== current.generation) throw errors.invalidInput("请先重连此工作区");
    const index = current.panes.findIndex(({ paneId }) => paneId === change.paneId);
    if (index < 0) throw errors.notFound("工作区分栏");
    if (current.panes.length >= MAX_WORKSPACE_PANES || current.panes.some(({ hostId }) => hostId === change.hostId)) throw errors.invalidInput("请选择尚未使用的 SSH 主机，每个工作区最多 12 个分栏");
    const hosts = new Map((await this.hosts.list()).map((host) => [host.id, host]));
    const route = routeForHost(hosts, change.hostId);
    if (route.some((host) => !("revision" in host))) throw errors.invalidInput("请先修复新分栏的 SSH 主机或跳板");
    const pane = { paneId: randomUUID(), hostId: change.hostId, label: route.at(-1)!.name, target: workspaceTarget(route) };
    const panes = current.panes.toSpliced(index + 1, 0, pane);
    const layout = { kind: "custom", tree: splitPaneAt(workspaceTree(current.layout, current.panes.length), index, change.axis) } as const;
    return { pane, panes, layout };
  }

  saveTemplate(id: string, name: string, signal: AbortSignal) {
    const run = this.find(this.read().runs, id);
    const panes = run.panes.map(({ hostId, loginCommand }) => ({ hostId, ...(loginCommand === undefined ? {} : { loginCommand }) }));
    return this.templates.save({ name, layout: run.layout, panes }, signal, new Map(run.panes.map(({ hostId, target }) => [hostId, target])));
  }

  dispose(): void {
    this.disposed = true;
    for (const id of this.live.keys()) this.release(id);
  }

  private begin(run: SavedRun): void {
    if (this.disposed) return;
    const live: LiveRun = { generation: run.generation, controllers: new Map(), panes: new Map() };
    this.live.set(run.id, live);
    for (const pane of run.panes) this.beginPane(run, live, pane);
    this.changed(run.id);
  }

  private beginPane(run: SavedRun, live: LiveRun, pane: SavedRun["panes"][number]) {
    const controller = new AbortController();
    live.controllers.set(pane.paneId, controller);
    void this.manager
      .openWorkspaceShell(pane, controller.signal, () => this.changed(run.id))
      .then(
        (shell) => {
          if (this.live.get(run.id) === live && !controller.signal.aborted) live.panes.set(pane.paneId, { sessionId: shell.id });
          else this.manager.closeShell(shell.id);
        },
        (error: unknown) => {
          if (this.live.get(run.id) !== live || controller.signal.aborted) return;
          live.panes.set(pane.paneId, {
            error: error instanceof HuhuError ? { code: error.code, message: error.message } : { code: "INTERNAL", message: "无法建立该分栏的 SSH 会话" },
          });
        },
      )
      .finally(() => {
        if (this.live.get(run.id) === live) this.changed(run.id);
      });
  }

  private release(id: string): void {
    const live = this.live.get(id);
    if (!live) return;
    this.live.delete(id);
    for (const paneId of live.controllers.keys()) this.releasePane(live, paneId);
  }

  private releasePane(live: LiveRun, paneId: string): void {
    live.controllers.get(paneId)?.abort();
    live.controllers.delete(paneId);
    const shell = live.panes.get(paneId)?.sessionId;
    live.panes.delete(paneId);
    if (shell) this.manager.closeShell(shell);
  }

  private view(run: SavedRun): WorkspaceRun {
    const live = this.live.get(run.id);
    const panes = run.panes.map(({ paneId, hostId, label, target }): WorkspaceRunPane => {
      const base = { paneId, hostId, label };
      if (live?.generation !== run.generation) return { ...base, phase: "reconnect" };
      const pane = live.panes.get(paneId);
      if (pane?.error) return { ...base, phase: "failed", error: pane.error };
      if (pane?.sessionId) return { ...base, phase: this.manager.shellInfo(pane.sessionId)?.state === "running" ? "ready" : "ended", sessionId: pane.sessionId };
      const prompt = this.manager.workspacePrompt(hostId, target);
      const authPrompt = this.manager.workspaceAuthentication(hostId, target);
      if (authPrompt) return { ...base, phase: "authentication", authPrompt };
      return prompt ? { ...base, phase: "trust", prompt } : { ...base, phase: "connecting" };
    });
    return { ...run, panes };
  }

  private find(runs: readonly SavedRun[], id: string): SavedRun {
    const run = runs.find((entry) => entry.id === id);
    if (!run) throw errors.notFound("工作区运行已关闭");
    return run;
  }

  private read() {
    const file = this.files.read(FILE);
    if (!file) {
      if (this.files.exists(FILE)) throw errors.invalidInput("工作区绑定路径上应是普通文件");
      return { runs: [], fileVersion: null };
    }
    let data: unknown;
    try {
      data = JSON.parse(file.bytes.toString("utf8"));
    } catch {
      throw errors.invalidInput("工作区绑定文件不是有效 JSON");
    }
    const parsed = State.safeParse(data);
    if (!parsed.success) throw errors.invalidInput("工作区绑定文件格式无效");
    if (new Set(parsed.data.runs.map(({ id }) => id)).size !== parsed.data.runs.length) throw errors.invalidInput("工作区运行 ID 重复");
    return { runs: parsed.data.runs, fileVersion: file.version };
  }

  private async write(runs: SavedRun[], expectedVersion: string | null, signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.disposed) throw errors.notFound("工作区所属 Vault 已关闭");
    await this.files.write(FILE, Buffer.from(JSON.stringify({ version: 1, runs }, null, 2) + "\n"), { expectedVersion });
  }
}
