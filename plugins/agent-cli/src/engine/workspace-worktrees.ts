import { readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { errors, HuhuError } from "@huhu/contracts";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { SpaceSchema } from "../shared/space.js";
import { protectedKindOf } from "@huhu/vault";
import { z } from "zod";
import type { SpaceStore } from "./spaces.js";
import { runWorkspaceGit } from "./review.js";

const selection = z.strictObject({ spaceId: z.string().min(1).max(128), spaceRevision: z.int().nonnegative() });
const pathInput = z.string().min(1).max(4096);
const Worktree = z.strictObject({ root: pathInput, branch: z.string().nullable(), availability: z.enum(["available", "missing"]) });
type Worktree = z.infer<typeof Worktree>;
const base = { plugin: "agent-cli", exposable: false, defaultExposed: false, desktopOnly: true } as const;
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
  const current = (input: z.infer<typeof selection>) => selectedDirectory(spaces.validateForLaunch(input.spaceId, input.spaceRevision).root);
  const bind = (root: string, name: string) => spaces.list().find((space) => space.root === root) ?? spaces.save({ root, name });
  api.defineCapability(
    def({
      ...base,
      name: "agent.workspace.worktrees.list",
      scope: "read",
      input: selection,
      output: z.strictObject({ repository: z.string(), worktrees: z.array(Worktree) }),
      handler: async ({ signal }, input) => {
        const repo = await repository(current(input), signal);
        return { repository: repo, worktrees: await treeList(repo, signal) };
      },
    }),
  );
  api.defineCapability(
    def({
      ...base,
      name: "agent.workspace.worktrees.open",
      scope: "write",
      input: selection.extend({ root: pathInput }),
      output: SpaceSchema,
      handler: async ({ signal }, input) => {
        const repo = await repository(current(input), signal);
        const root = directory(input.root);
        const selected = (await treeList(repo, signal)).find((tree) => root && tree.root === root && tree.availability === "available");
        if (!selected) throw errors.notFound("原 worktree 目录已移动或由其他操作移除");
        current(input);
        return bind(selectedDirectory(selected.root), selected.branch ?? path.basename(selected.root));
      },
    }),
  );
  api.defineCapability(
    def({
      ...base,
      name: "agent.workspace.worktrees.create",
      scope: "write",
      timeoutMs: 45_000,
      input: selection.extend({ dir: pathInput, branch: z.string().trim().min(1).max(128) }),
      output: SpaceSchema,
      handler: async ({ signal }, input) => {
        const repo = await repository(current(input), signal);
        const destination = directory(input.dir);
        if (!destination || readdirSync(selectedDirectory(destination)).length > 0) throw errors.invalidInput("请选择空的本机文件夹");
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(input.branch)) throw errors.invalidInput("新分支名无效");
        const ref = await runWorkspaceGit(repo, ["check-ref-format", "--branch", input.branch], signal);
        if (ref.code !== 0 || ref.stdout.trim() !== input.branch) throw errors.invalidInput("新分支名无效");
        if (current(input) !== repo || directory(destination) !== destination || readdirSync(destination).length > 0) throw errors.invalidInput("仓库或目录已变化，请重新选择");
        const hooksDisabled = process.platform === "win32" ? "NUL" : "/dev/null";
        const result = await runWorkspaceGit(repo, ["-c", "core.hooksPath=" + hooksDisabled, "-c", "submodule.recurse=false", "worktree", "add", "-b", input.branch, "--", destination], signal);
        signal.throwIfAborted();
        const created = (await treeList(repo, signal)).find((tree) => tree.root === destination && tree.availability === "available" && tree.branch === input.branch);
        if (!created || result.code !== 0) throw errors.invalidInput("Git 未确认已创建 worktree，请刷新列表检查目标与同名分支");
        return bind(created.root, input.branch);
      },
    }),
  );
}
