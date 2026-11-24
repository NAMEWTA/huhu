import path from "node:path";
import { HuhuError, KINDS, errors, isWorkbenchCaller } from "@huhu/contracts";
import { machineId, normalizeRelPath, parseFrontmatter, parseTaskBody, patchFrontmatter, replaceBody, replaceTaskSection, splitDocument } from "@huhu/vault";
import type { Context } from "@huhu/cordis";
import { bindCapability, ExposureStore, OperationReceipts, toolSelection, type CapabilityContext, type HuhuApi } from "@huhu/kernel";
import { AutoSync } from "./auto-sync.js";
import { versioningTools as caps } from "./descriptors.js";
import { FileHistory } from "./history.js";
import { PendingHistory } from "./pending-history.js";
import { allowToolPath, assertToolPath, VaultGit, type RepositoryBaseline } from "./repo.js";
import { GitRemoteCredentials, httpTarget, type GitAuthSummary, type GitCredentialHost } from "./remote-auth.js";
import type { SafeGitSnapshots } from "./safe-git.js";
import { VaultSync } from "./sync.js";

export { versioningCapabilityDescriptors } from "./descriptors.js";
export { FileHistory } from "./history.js";
import { gitInstalled } from "./git.js";
export { GitRunner } from "./git.js";
export { VaultGit } from "./repo.js";
const DEBOUNCE_MS = 2000;

export interface VersioningOptions {
  debounceMs?: number;
  credentialHost?: GitCredentialHost;
  safeSnapshots?: SafeGitSnapshots;
  notifyHistoryFailure?: (id: string, title: string) => void;
  /** 恢复任务文件后通知 automations：该输入不应被重复处理（缺省时从 `automations` 服务取）。 */
  holdRestoredInput?: (taskId: string, inputHash: string) => void;
}

/**
 * 恢复后对语义文件的保护：
 * - 任务运行与自动化运行记录只允许查看历史，退出结果和回执由各自的运行服务维护；
 * - 自动化规则恢复后一律暂停（旧版本里的 enabled: true 不能立刻重新生效）；
 * - 任务文件只恢复 `<task>` 内容与普通字段；当前的 `status`、`completedAt`、`origin` 与整个 `<comments>` 区段保持不变；
 *   恢复到旧版（schema 1）的任务文件会被拒绝（项目不再读取旧格式）。
 */
export function guardRestoredContent(relInput: string, restored: string, current = ""): string {
  const rel = normalizeRelPath(relInput); // 与 restore 内部一致：忽略 "./"、重复斜杠
  // 大小写不敏感的文件系统上同一目录可由不同写法指向。
  const dir = rel.split("/")[0]?.toLowerCase();
  if (dir === KINDS["automation-run"].dir.toLowerCase() || dir === KINDS["task-run"].dir.toLowerCase()) {
    throw errors.invalidInput("运行记录可查看历史，但不能覆盖当前回执或执行结果");
  }
  if (dir === KINDS["automation-rule"].dir.toLowerCase()) return patchFrontmatter(restored, { enabled: false });
  if (rel.startsWith("Tasks/")) {
    const old = parseFrontmatter(restored).data;
    if ((old["huhu"] as { schema?: number } | undefined)?.schema !== 2) throw errors.invalidInput("这个版本是旧版任务文件（schema 1），不能恢复");
    if (!current) return restored;
    const cur = parseFrontmatter(current).data;
    const withMeta = patchFrontmatter(restored, { status: cur["status"], completedAt: cur["completedAt"] ?? null, origin: cur["origin"] });
    const oldTask = parseTaskBody(splitDocument(restored).body).task;
    const curBody = splitDocument(current).body;
    return replaceBody(withMeta, oldTask === null ? curBody : replaceTaskSection(curBody, oldTask));
  }
  return restored;
}

export function apply(ctx: Context, api: HuhuApi, opts: VersioningOptions = {}): { history: FileHistory } {
  const files = api.vault.files;
  const history = new FileHistory(files);
  const exposure = new ExposureStore(files, path.join(api.vault.stateDir, "plugins.json"));
  const external = (context: CapabilityContext) => !isWorkbenchCaller(context.caller);
  const check = (context: CapabilityContext, id: string) => {
    context.signal.throwIfAborted();
    if (["cli", "mcp", "http"].includes(context.caller) && toolSelection(exposure.snapshot(), id) !== true) throw errors.capabilityNotExposed(id);
  };
  const required = <T>(context: CapabilityContext, value: T | undefined, field: string): T | undefined => {
    if (external(context) && value === undefined) throw errors.invalidInput(`需要提供 ${field}`);
    return value;
  };
  const historyPath = (context: CapabilityContext, rel: string) => (external(context) ? assertToolPath(files.root, rel, true) : rel);
  const pending = new PendingHistory(files, api.vault.stateDir, history, opts.debounceMs ?? DEBOUNCE_MS, (id, title) => opts.notifyHistoryFailure?.(id, title));
  api.provide("versioningHistory", { saved: (rel: string, bytes: Uint8Array) => pending.observe(rel, "edit", bytes) });
  api.events.subscribe((e) => {
    if (e.type === "vault.fileChanged") {
      const p = e.payload as { path: string; change: string; version?: string };
      // A notes.save notification follows the already captured bytes.
      if (p.change !== "deleted" && p.version === undefined) pending.observe(p.path, "external");
    }
  });

  api.defineCapability(
    bindCapability(caps.historyTimeline, async (c, i) => {
      const entries = await history.timeline(historyPath(c, i.path));
      return external(c) ? entries.filter((entry) => allowToolPath(entry.path) || entry.path.startsWith(".agents/skills/huhu/")) : entries;
    }),
  );
  api.defineCapability(
    bindCapability(caps.historyRead, async (c, i) => {
      const rel = historyPath(c, i.path);
      if (!external(c)) return { text: await history.read({ id: i.entryId, path: rel }) };
      const entry = (await history.timeline(rel)).find(({ id }) => id === i.entryId);
      if (!entry) throw errors.notFound("该文件没有此历史版本");
      historyPath(c, entry.path);
      const text = await history.read(entry);
      check(c, caps.historyRead.name);
      return { text };
    }),
  );
  api.defineCapability(
    bindCapability(caps.historyCheckpoint, async (c, i) => {
      if (external(c) && [...i.title].some((character) => character < " " || character === "\u007f" || character === "|")) throw errors.invalidInput("检查点标题必须是单行文本");
      const rel = historyPath(c, i.path);
      const expectedVersion = required(c, i.expectedVersion, "expectedVersion");
      check(c, caps.historyCheckpoint.name);
      await pending.drainPath(rel);
      return history.record(rel, "checkpoint", i.title, expectedVersion, () => check(c, caps.historyCheckpoint.name));
    }),
  );
  api.defineCapability(
    bindCapability(caps.historyRestore, async (c, i) => {
      const rel = historyPath(c, i.path);
      check(c, caps.historyRestore.name);
      await pending.drainPath(rel);
      const r = await history.restore(rel, i.entryId, i.expectedCurrentVersion, {
        beforeWrite: () => check(c, caps.historyRestore.name),
        transform: (restored, current, entry) => {
          historyPath(c, entry.path);
          check(c, caps.historyRestore.name);
          return guardRestoredContent(rel, restored, current);
        },
        afterWrite: async () => {
          // 指南文件被恢复：交给 agent-guide 标记为 needs-check（不由它自动覆盖）
          if (normalizeRelPath(rel).startsWith(".agents/skills/huhu/")) await api.service<{ markNeedsCheck(paths: string[]): Promise<void> }>("agent-guide")?.markNeedsCheck([normalizeRelPath(rel)]);
          // 任务文件：恢复后的输入不应触发自动化重复处理（restore 之后读取新的 inputHash）
          const id = normalizeRelPath(rel).split("/")[0]?.toLowerCase() === "tasks" ? /--(task-[0-9a-z]+)\.md$/.exec(path.basename(rel))?.[1] : undefined;
          if (!id) return;
          const hold = opts.holdRestoredInput ?? api.service<{ holdRestoredInput(taskId: string, inputHash: string): void }>("automations")?.holdRestoredInput;
          const q = api.service<{ snapshot(taskId: string): { inputHash: string } }>("taskQuery");
          if (hold && q) hold(id, q.snapshot(id).inputHash);
        },
      });
      return { restored: r.restored !== null || r.checkpoint !== null };
    }),
  );

  const git = new VaultGit(files.root);
  api.defineCapability(
    bindCapability(caps.gitStatus, async (c) => {
      // 这台电脑没有 git：界面给出安装说明，而不是一个看不懂的错误
      if (!(await gitInstalled())) return { isRepo: false, installed: false, branch: null, files: [] };
      if (!git.isRepo()) return { isRepo: false, installed: true, branch: null, files: [] };
      if (!external(c)) return { isRepo: true, installed: true, ...(await git.status()) };
      return sync.exclusive(async () => {
        const repository = await git.baseline();
        const status = await git.status(true);
        return { isRepo: true, installed: true, ...status, repository, files: status.files.filter(({ path, from }) => allowToolPath(path) && (!from || allowToolPath(from))) };
      });
    }),
  );
  api.defineCapability(
    bindCapability(caps.gitInit, (c) =>
      sync.exclusive(() => {
        files.assertWritable();
        check(c, caps.gitInit.name);
        return git.init(external(c));
      }),
    ),
  );
  api.defineCapability(
    bindCapability(caps.gitLog, async (c, i) => {
      if (external(c)) await git.toolIdentity();
      return git.log(i.limit, "HEAD", external(c));
    }),
  );
  api.defineCapability(
    bindCapability(caps.gitDiff, async (c, i) => {
      let rel = i.path;
      if (external(c)) {
        await git.toolIdentity();
        if (!rel) throw errors.invalidInput("Git 工具差异读取需要指定单个文件");
        rel = assertToolPath(files.root, rel);
      }
      const diff = await git.diff({ ...(rel ? { path: rel } : {}), ...(i.staged ? { staged: true } : {}), ...(i.commit ? { commit: i.commit } : {}), tool: external(c) });
      check(c, caps.gitDiff.name);
      return { diff };
    }),
  );
  const editIndex = (c: CapabilityContext, id: string, paths: string[], expected: RepositoryBaseline | undefined, edit: (paths: string[]) => Promise<void>) =>
    sync.exclusive(async () => {
      files.assertWritable();
      if (external(c)) {
        await git.assertBaseline(required(c, expected, "expected")!);
        paths = paths.map((rel) => assertToolPath(files.root, rel));
        if (new Set(paths).size !== paths.length) throw errors.invalidInput("Git 文件路径不能重复");
      }
      check(c, id);
      await edit(paths);
      return { ok: true as const };
    });
  api.defineCapability(bindCapability(caps.gitStage, (c, i) => editIndex(c, caps.gitStage.name, i.paths, i.expected, (paths) => git.stage(paths))));
  api.defineCapability(bindCapability(caps.gitUnstage, (c, i) => editIndex(c, caps.gitUnstage.name, i.paths, i.expected, (paths) => git.unstage(paths))));
  api.defineCapability(
    bindCapability(caps.gitCommit, (c, i) =>
      sync.exclusive(async () => {
        files.assertWritable();
        const checkCommit = () => check(c, caps.gitCommit.name);
        if (external(c)) {
          return git.commitExpected(i.message, required(c, i.expected, "expected")!, checkCommit);
        }
        checkCommit();
        return git.commit(i.message);
      }),
    ),
  );
  const sync = new VaultSync(
    files.root,
    undefined,
    {
      // 覆盖前给每个冲突文件留一个可恢复的检查点（规格总则 8）
      // 失败则中止解决，此时还没有覆盖任何文件
      beforeOverwrite: async (paths) => {
        for (const p of paths) {
          await pending.drainPath(p);
          await history.record(p, "checkpoint", "解决冲突前");
        }
      },
      // 带 frontmatter 的文件，解决后必须仍能解析（语义文件的 kind 校验由各插件在读取时再次把关）
      validateResolved: (_p, text) => {
        if (text.startsWith("---") && parseFrontmatter(text).errors.length) throw errors.invalidInput("文件元数据无法解析");
      },
    },
    opts.credentialHost && new GitRemoteCredentials(opts.credentialHost),
    files.readOnly,
    opts.safeSnapshots,
  );
  let publishStatus = () => {};
  // 自动同步：按模式与间隔定时拉取/推送；认证失败或冲突后暂停，插件停用即停止
  const auto = new AutoSync({
    config: () => sync.config(),
    run: (mode, isCurrent, repair) => sync.runAutomatic(mode, isCurrent, repair),
    authTarget: () => sync.authTarget(),
    canRun: () => !files.readOnly,
    hasConflict: () => sync.status().name === "conflict",
    schedule: (fn, ms) => {
      const t = setTimeout(fn, ms);
      t.unref();
      return () => clearTimeout(t);
    },
    onChange: () => publishStatus(),
  });
  publishStatus = () => {
    const st = sync.status();
    const paused = auto.state().pausedReason;
    api.events.publish("sync.statusChanged", { status: st.name, ahead: 0, behind: 0, conflicts: st.name === "conflict" ? st.detail.split("、").filter(Boolean).length : 0, ...(paused ? { pausedReason: paused } : {}) });
  };
  ctx.effect(() => async () => {
    auto.stop();
    sync.dispose();
    await sync.idle();
    await pending.close();
  });
  api.events.subscribe((e) => {
    if (e.type === "engine.closing") sync.dispose();
  });
  api.defineCapability(bindCapability(caps.syncGet, (c) => (external(c) ? sync.toolConfig() : sync.config())));
  api.defineCapability(
    bindCapability(caps.syncAuthGet, async (c, { remote }) => {
      const summary = await sync.authStatus(remote);
      check(c, caps.syncAuthGet.name);
      return summary;
    }),
  );
  const authReceipts = new OperationReceipts(path.join(api.vault.stateDir, "runtime", machineId(), "versioning-auth-intents.ndjson"));
  const configuringAuth = new Map<string, Promise<GitAuthSummary>>();
  api.defineCapability(
    bindCapability(caps.syncAuthConfigure, async (c, { operationId, ...input }) => {
      const configure = () =>
        sync.configureAuth(
          input,
          c.signal,
          (target, result) => {
            auto.credentialsChanged(input.expectedRevision, { source: "versioning", target, revision: result.revision }, input.credential.action === "replace" && result.state === "configured");
          },
          () => check(c, caps.syncAuthConfigure.name),
        );
      if (!external(c)) return configure();
      files.assertWritable();
      const key = required(c, operationId, "operationId")!;
      const target = httpTarget(input.remote);
      if (!target) throw errors.invalidInput("认证仅适用于当前 HTTPS 远端");
      const owner = JSON.stringify([c.caller, c.subject ?? c.caller]);
      const claim = authReceipts.claim(owner, caps.syncAuthConfigure.name, key, { ...input, remote: target });
      if (claim.mismatch) throw errors.idempotencyMismatch();
      if (!claim.fresh) {
        if (claim.entry.phase === "completed" && claim.entry.result.ok) return caps.syncAuthConfigure.output.parse(claim.entry.result.data);
        const running = configuringAuth.get(claim.entry.operationId);
        if (running) return running;
        throw new HuhuError("INTERNAL", "认证配置结果未知，请读取当前目标的认证状态", { retryable: false, details: { outcome: "unknown", operationId: key } });
      }
      if (claim.entry.phase !== "accepted") throw new Error("Invalid Git authentication operation");
      const accepted = claim.entry;
      const running = configure().then((summary) => {
        authReceipts.complete(accepted, "completed", { ok: true, data: summary });
        return summary;
      });
      configuringAuth.set(accepted.operationId, running);
      try {
        return await running;
      } finally {
        configuringAuth.delete(accepted.operationId);
      }
    }),
  );
  api.defineCapability(
    bindCapability(caps.syncUpdate, async (c, { expectedRevision, ...patch }) => {
      const next = await sync.updateConfig(patch, c.signal, required(c, expectedRevision, "expectedRevision"), () => check(c, caps.syncUpdate.name));
      auto.configChanged();
      return next;
    }),
  );
  api.defineCapability(
    bindCapability(caps.syncPreview, async (c, i) => {
      try {
        return await sync.preview(c.signal, required(c, i.expected, "expected"), () => check(c, caps.syncPreview.name));
      } catch (e) {
        auto.noteManualFailure(e);
        throw e;
      }
    }),
  );
  api.defineCapability(
    bindCapability(caps.syncRun, async (c, i) => {
      try {
        const r = await sync.run(i.mode, c.signal, required(c, i.expected, "expected"), () => check(c, caps.syncRun.name));
        auto.restart(); // 手动同步成功：清除暂停与退避
        return r;
      } catch (e) {
        auto.noteManualFailure(e);
        throw e;
      } finally {
        publishStatus(); // 成功、冲突、离线、认证失败都发布真实状态
      }
    }),
  );
  api.defineCapability(bindCapability(caps.conflictsList, async (c) => ({ conflict: external(c) ? sync.conflictSummary() : await sync.conflicts() })));
  api.defineCapability(
    bindCapability(caps.conflictsRead, async (c, i) => {
      const conflict = await sync.conflictFile(i.path, required(c, i.expected, "expected"));
      check(c, caps.conflictsRead.name);
      return conflict;
    }),
  );
  api.defineCapability(
    bindCapability(caps.conflictsResolve, async (c, i) => {
      try {
        const r = await sync.resolveConflicts(
          i.sessionId,
          i.resolutions,
          (e) => auto.noteManualFailure(e),
          required(c, i.expected, "expected"),
          () => check(c, caps.conflictsResolve.name),
        );
        auto.configChanged();
        return r;
      } finally {
        publishStatus();
      }
    }),
  );
  api.defineCapability(
    bindCapability(caps.conflictsCancel, async (c, i) => {
      const r = await sync.cancelConflicts(required(c, i.expected, "expected"), () => check(c, caps.conflictsCancel.name));
      auto.configChanged();
      publishStatus();
      return r;
    }),
  );
  api.defineCapability(
    bindCapability(caps.syncStatus, async (c) => {
      const pausedReason = auto.state().pausedReason;
      if (!external(c)) return { ...(await sync.visibleStatus()), pausedReason, authPause: auto.authPause() };
      const { name } = sync.status();
      const detail = { idle: "", conflict: "存在待解决的同步冲突", offline: "无法连接 Git 远端", "auth-failed": "Git 远端认证失败", "not-configured": "尚未配置 Git 远端", "read-only": "Vault 以只读方式打开", unknown: "上一次同步未完成" }[
        name
      ];
      return { name, detail, pausedReason, authPause: auto.authPause() };
    }),
  );
  auto.restart(); // 启动时按已保存的模式与间隔排程
  return { history };
}
