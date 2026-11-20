import { randomUUID } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { layoutProblem, WorkspaceDraft, WorkspaceName, WorkspaceTemplate } from "../shared/workspace.js";
import type { HostConfigurations } from "./host-configurations.js";
import { routeForHost, workspaceTarget } from "./workspace-target.js";

const FILE = ".huhu/ssh/workspace-templates.json";
const State = z.strictObject({ version: z.literal(1), templates: z.array(WorkspaceTemplate) });
export const TemplateRevision = z.strictObject({ id: z.uuid(), expectedRevision: z.uuid() });
export const SaveTemplate = WorkspaceDraft.extend({
  name: WorkspaceName,
  previous: TemplateRevision.optional(),
  rebindHostIds: z.array(z.string()).max(12).optional(),
});

export class WorkspaceTemplates {
  constructor(
    private readonly files: HuhuApi["vault"]["files"],
    private readonly hosts: HostConfigurations,
  ) {}

  private read() {
    const file = this.files.read(FILE);
    if (!file) {
      if (this.files.exists(FILE)) throw errors.invalidInput("工作区模板路径上应是普通文件");
      return { templates: [], fileVersion: null } as const;
    }
    let data: unknown;
    try {
      data = JSON.parse(file.bytes.toString("utf8"));
    } catch {
      throw errors.invalidInput("工作区模板文件不是有效 JSON");
    }
    const parsed = State.safeParse(data);
    if (!parsed.success) throw errors.invalidInput("工作区模板文件格式无效");
    const templates = parsed.data.templates;
    if (new Set(templates.map(({ id }) => id)).size !== templates.length) throw errors.invalidInput("工作区模板 ID 重复");
    return { templates, fileVersion: file.version };
  }

  list(): WorkspaceTemplate[] {
    return [...this.read().templates];
  }

  get(id: string): WorkspaceTemplate {
    const template = this.list().find((candidate) => candidate.id === id);
    if (!template) throw errors.notFound("工作区模板已移除");
    return template;
  }

  assertUnused(hostId: string): void {
    const references = this.list().filter(({ panes }) => panes.some((pane) => pane.hostId === hostId));
    if (references.length) throw errors.invalidInput(`该主机仍被工作区模板引用：${references.map(({ name }) => name).join("、")}。请先移除模板中的引用。`);
  }

  save(input: z.infer<typeof SaveTemplate>, signal: AbortSignal, expectedTargets?: ReadonlyMap<string, string>) {
    return this.hosts.withStableDirectory(async () => {
      this.files.assertWritable();
      const { templates, fileVersion } = this.read();
      const previous = this.checkPrevious(templates, input.previous);
      const problem = layoutProblem(input.panes, input.layout);
      if (problem) throw errors.invalidInput(problem);
      const hosts = new Map((await this.hosts.list()).map((host) => [host.id, host]));
      const oldTargets = new Map(previous?.panes.map(({ hostId, target }) => [hostId, target]));
      const rebound = new Set(input.rebindHostIds);
      const panes = input.panes.map((pane) => {
        const target = (rebound.has(pane.hostId) ? undefined : oldTargets.get(pane.hostId)) ?? workspaceTarget(routeForHost(hosts, pane.hostId));
        if (expectedTargets && expectedTargets.get(pane.hostId) !== target) throw new HuhuError("VERSION_CONFLICT", "运行所绑定的 SSH 主机身份已变更，请重新选择主机");
        return { ...pane, target };
      });
      const saved: WorkspaceTemplate = { id: previous?.id ?? randomUUID(), revision: randomUUID(), name: input.name, panes, layout: input.layout };
      signal.throwIfAborted();
      await this.write(previous ? templates.map((entry) => (entry.id === saved.id ? saved : entry)) : [...templates, saved], fileVersion);
      return saved;
    });
  }

  delete(input: z.infer<typeof TemplateRevision>, signal: AbortSignal) {
    return this.hosts.withStableDirectory(async () => {
      this.files.assertWritable();
      const { templates, fileVersion } = this.read();
      this.checkPrevious(templates, input);
      signal.throwIfAborted();
      await this.write(
        templates.filter(({ id }) => id !== input.id),
        fileVersion,
      );
      return { ok: true as const };
    });
  }

  private checkPrevious(templates: readonly WorkspaceTemplate[], previous?: z.infer<typeof TemplateRevision>) {
    if (!previous) return undefined;
    const current = templates.find(({ id }) => id === previous.id);
    if (!current) throw errors.notFound("工作区模板已移除");
    if (current.revision !== previous.expectedRevision) throw errors.versionConflict(current.revision);
    return current;
  }

  private async write(templates: WorkspaceTemplate[], expectedVersion: string | null) {
    await this.files.write(FILE, Buffer.from(JSON.stringify({ version: 1, templates }, null, 2) + "\n"), { expectedVersion });
  }
}
