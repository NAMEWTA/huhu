import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OperationLog, SemanticRepository, Trash, VaultFiles } from "../../packages/vault/src/index.js";
import { TasksService } from "../../plugins/tasks/src/engine/service.js";

/**
 * quality.md §1 的 scale-vault 生成器：10,000 篇笔记（约 100 MiB）、1,000 个任务、1,000 个档案。
 * 笔记按 50 个文件夹分布，带标签与双链；任务经服务写入，档案是 Archives/项目/<名称>/index.md（文件夹笔记），格式与真实使用一致。
 * 用法：`pnpm exec tsx tests/perf/scale-vault.ts <目录> [笔记数] [任务数] [档案数]`，或在测试里直接调用 createScaleVault。
 */
const WORDS = ["发布", "计划", "复盘", "架构", "接口", "性能", "索引", "笔记", "任务", "档案", "自动化", "版本", "同步", "终端", "保险箱", "插件", "网关", "编辑器", "批注", "回收站"];

export interface ScaleOptions {
  notes?: number;
  tasks?: number;
  archives?: number;
  /** 每篇笔记的段落数；默认 220 段 ≈ 10 KiB，10,000 篇约 100 MiB。 */
  paragraphs?: number;
}

export async function createScaleVault(root: string, o: ScaleOptions = {}): Promise<{ notes: number; tasks: number; archives: number }> {
  const notes = o.notes ?? 10_000;
  const tasks = o.tasks ?? 1_000;
  const archives = o.archives ?? 1_000;
  const paragraphs = o.paragraphs ?? 220;
  mkdirSync(root, { recursive: true });
  for (let i = 0; i < notes; i++) {
    const dir = path.join(root, `文件夹${i % 50}`);
    if (i < 50) mkdirSync(dir, { recursive: true });
    const body = Array.from({ length: paragraphs }, (_, k) => `${WORDS[(i + k) % WORDS.length]}${WORDS[(i * 7 + k) % WORDS.length]}相关的第 ${k} 段内容，链接 [[笔记${(i + 1) % notes}]]。`).join("\n");
    writeFileSync(path.join(dir, `笔记${i}.md`), `# 笔记${i}\n\n#${WORDS[i % WORDS.length]}\n\n${body}\n`);
  }
  // 任务经服务写入；操作日志放在 Vault 之外，不污染被测目录
  const scratch = mkdtempSync(path.join(tmpdir(), "huhu-scale-ops-"));
  const files = new VaultFiles(root);
  const repo = new SemanticRepository(files, new OperationLog(files, path.join(scratch, "ops")));
  const taskSvc = new TasksService({ repo, trash: new Trash(files), publish: () => undefined, zone: () => "UTC", now: () => new Date(), pathKind: () => null });
  for (let i = 0; i < tasks; i++) {
    await taskSvc.create(
      { title: `任务 ${i} ${WORDS[i % WORDS.length]}`, type: "human", body: `任务正文 ${i}`, tags: [WORDS[i % WORDS.length] as string], due: null, project: `项目${i % 20}`, execution: null, reminders: [] },
      { kind: "desktop" },
    );
  }
  // 档案 = Archives/<类型>/<名称>/ 下的文件夹笔记：类型的 index.md 是字段模板，档案的 index.md 存字段值
  mkdirSync(path.join(root, "Archives/项目"), { recursive: true });
  writeFileSync(path.join(root, "Archives/项目/index.md"), "---\nicon: folder\nfields:\n  - name: 负责人\n    type: text\n---\n");
  for (let i = 0; i < archives; i++) {
    const dir = path.join(root, `Archives/项目/档案 ${i}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "index.md"), `---\n负责人: "负责人${i % 30}"\n---\n档案正文 ${i}\n`);
  }
  return { notes, tasks, archives };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, n, t, a] = process.argv.slice(2);
  if (!dir) throw new Error("用法：tsx tests/perf/scale-vault.ts <目录> [笔记数] [任务数] [档案数]");
  const t0 = Date.now();
  createScaleVault(dir, { ...(n ? { notes: Number(n) } : {}), ...(t ? { tasks: Number(t) } : {}), ...(a ? { archives: Number(a) } : {}) }).then((r) => console.log(`scale-vault 已生成：${JSON.stringify(r)}，用时 ${Date.now() - t0} ms`));
}
