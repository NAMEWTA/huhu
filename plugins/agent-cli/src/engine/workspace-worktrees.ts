import { readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { errors, HuhuError } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, durableExternal, type HuhuApi } from "@huhu/kernel";
import { isAgentTool, publicAgentTool, vaultWorkspaceDirectory, workspaceStamp } from "./tool-access.js";
import { SpaceSchema } from "../shared/space.js";
import { protectedKindOf } from "@huhu/vault";
import { z } from "zod";
import type { SpaceStore } from "./spaces.js";
import { runWorkspaceGit } from "./review.js";

const selection = z.strictObject({ spaceId: z.string().min(1).max(128), spaceRevision: z.int().nonnegative() });
const pathInput = z.string().min(1).max(4096);
const Worktree = z.strictObject({ root: pathInput, branch: z.string().nullable(), availability: z.enum(["available", "missing"]) });
type Worktree = z.infer<typeof Worktree>;

export const agentWorkspaceWorktreeDescriptors = {
  workspaceWorktreesList: defineCapabilityDescriptor({
    ...publicAgentTool,
    name: "agent.workspace.worktrees.list",
    scope: "read",
    risk: "normal",
    title: "列出 Git worktree",
    description: "查看工作台最近读取的 worktree。",
    desktopOnly: true,
    input: selection,
    output: z.strictObject({ repository: z.string(), worktrees: z.array(Worktree), observedAt: z.string().optional() }),
  }),
  workspaceWorktreesOpen: defineCapabilityDescriptor({
    ...publicAgentTool,
    name: "agent.workspace.worktrees.open",
    scope: "write",
    risk: "normal",
    title: "打开 Git worktree",
    description: "将核实的 worktree 绑定到 Space。",
    desktopOnly: true,
    ...durableExternal,
    input: selection.extend({ root: pathInput }),
    output: SpaceSchema,
  }),
  workspaceWorktreesCreate: defineCapabilityDescriptor({
    ...publicAgentTool,
    name: "agent.workspace.worktrees.create",
    scope: "execute",
    risk: "high",
    title: "创建 Git worktree",
    description: "在获准目录创建分支并绑定 Space。",
    desktopOnly: true,
    ...durableExternal,
    timeoutMs: 45_000,
    input: selection.extend({ dir: pathInput, branch: z.string().trim().min(1).max(128) }),
    output: SpaceSchema,
  }),
};

const unavailable = () => new HuhuError("GIT_OFFLINE", "无法读取此工作区的 Git 资料，请重查");

function directory(requested: string): string | null {
  if (!path.isAbsolute(requested) || requested.includes("\0") || requested.includes("\r") || requested.includes("\n")) return null;
  try {
    const real = realpathSync(requested);
    return statSync(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

async function repository(root: string, signal: AbortSignal): Promise<string> {
  const result = await runWorkspaceGit(root, ["rev-parse", "--show-toplevel"], signal);
  signal.throwIfAborted();
  const actual = result.code === 0 ? directory(result.stdout.replace(/\r?\n$/, "")) : null;
  if (!actual || actual !== root) throw errors.invalidInput("请选择 Git 仓库的根目录作为工作区");
  return actual;
}

async function treeList(root: string, signal: AbortSignal): Promise<Worktree[]> {
  const result = await runWorkspaceGit(root, ["worktree", "list", "--porcelain", "-z"], signal);
  signal.throwIfAborted();
  if (result.code !== 0) throw unavailable();
  const list: Worktree[] = [];
  for (const row of result.stdout.split("\0\0")) {
    const [id, ...fields] = row.split("\0");
    if (!id?.startsWith("worktree ") || fields.includes("bare")) continue;
    const reported = id.slice("worktree ".length);
    const real = directory(reported);
    const ref = fields.find((field) => field.startsWith("branch refs/heads/"));
    list.push({ root: real ?? reported, branch: ref?.slice("branch refs/heads/".length) ?? null, availability: real ? "available" : "missing" });
  }
  return list;
}

export function registerWorkspaceWorktrees(api: HuhuApi, spaces: SpaceStore) {
  const selectedDirectory = (root: string) => {
    if (protectedKindOf(root.split(path.sep).slice(1).join("/"))) throw errors.permissionDenied("受保护目录不可用于 worktree");
    return root;
  };
  const current = (input: z.infer<typeof selection>) => {
    const space = spaces.validateForLaunch(input.spaceId, input.spaceRevision);
    selectedDirectory(space.root);
    return space;
  };
  const snapshots = new Map<string, { stamp: string; repository: string; worktrees: Worktree[]; observedAt: string }>();
  const authorized = (root: string) => (spaces.list().some((space) => space.root === root) ? root : vaultWorkspaceDirectory(api.vault.files.root, root));
  const bind = (root: string, name: string) => spaces.list().find((space) => space.root === root) ?? spaces.save({ root, name });
  api.defineCapability(
    bindCapability(agentWorkspaceWorktreeDescriptors.workspaceWorktreesList, async ({ signal, caller }, input) => {
      const space = current(input);
      const stamp = workspaceStamp(space);
      if (isAgentTool(caller)) {
        const snapshot = snapshots.get(space.id);
        if (snapshot?.stamp !== stamp) throw unavailable();
        return { repository: snapshot.repository, worktrees: snapshot.worktrees, observedAt: snapshot.observedAt };
      }
      const repo = await repository(space.root, signal);
      const worktrees = await treeList(repo, signal);
      if (workspaceStamp(current(input)) === stamp) snapshots.set(space.id, { stamp, repository: repo, worktrees, observedAt: new Date().toISOString() });
      return { repository: repo, worktrees };
    }),
  );
  api.defineCapability(
    bindCapability(agentWorkspaceWorktreeDescriptors.workspaceWorktreesOpen, async ({ signal, caller }, input) => {
      api.vault.files.assertWritable();
      const space = current(input);
      const stamp = workspaceStamp(space);
      const root = isAgentTool(caller) ? authorized(input.root) : directory(input.root);
      const repo = await repository(space.root, signal);
      const selected = (await treeList(repo, signal)).find((tree) => root && tree.root === root && tree.availability === "available");
      if (!selected) throw errors.notFound("原 worktree 目录已移动或由其他操作移除");
      if (workspaceStamp(current(input)) !== stamp || directory(selected.root) !== selected.root) throw errors.invalidInput("仓库或 worktree 目录已变化");
      return bind(selectedDirectory(selected.root), selected.branch ?? path.basename(selected.root));
    }),
  );
  api.defineCapability(
    bindCapability(agentWorkspaceWorktreeDescriptors.workspaceWorktreesCreate, async ({ signal, caller }, input) => {
      api.vault.files.assertWritable();
      const space = current(input);
      const stamp = workspaceStamp(space);
      const destination = isAgentTool(caller) ? vaultWorkspaceDirectory(api.vault.files.root, input.dir) : directory(input.dir);
      if (!destination || readdirSync(selectedDirectory(destination)).length > 0) throw errors.invalidInput("请选择空的本机文件夹");
      const repo = await repository(space.root, signal);
      const destinationStamp = workspaceStamp({ ...space, root: destination });
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(input.branch)) throw errors.invalidInput("新分支名无效");
      const ref = await runWorkspaceGit(repo, ["check-ref-format", "--branch", input.branch], signal);
      if (ref.code !== 0 || ref.stdout.trim() !== input.branch) throw errors.invalidInput("新分支名无效");
      if (workspaceStamp(current(input)) !== stamp || directory(destination) !== destination || workspaceStamp({ ...space, root: destination }) !== destinationStamp || readdirSync(destination).length > 0)
        throw errors.invalidInput("仓库或目录已变化，请重新选择");
      const hooksDisabled = process.platform === "win32" ? "NUL" : "/dev/null";
      const result = await runWorkspaceGit(repo, ["-c", "core.hooksPath=" + hooksDisabled, "-c", "submodule.recurse=false", "worktree", "add", "-b", input.branch, "--", destination], signal);
      signal.throwIfAborted();
      const created = (await treeList(repo, signal)).find((tree) => tree.root === destination && tree.availability === "available" && tree.branch === input.branch);
      if (!created || result.code !== 0) {
        if (isAgentTool(caller)) throw new HuhuError("RUN_UNKNOWN", "Git 未确认已创建 worktree，请通过原仓库核对目标与分支", { details: { outcome: "unknown" } });
        throw errors.invalidInput("Git 未确认已创建 worktree，请刷新列表检查目标与同名分支");
      }
      snapshots.delete(space.id);
      return bind(created.root, input.branch);
    }),
  );
}
