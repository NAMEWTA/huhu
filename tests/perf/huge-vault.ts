import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 知识库文件树大 Vault 验收夹具：
 *  - 100 个分区目录 × 800 个文件 = 80,000（md / txt / json / txt 轮换，每 4 个里 1 篇笔记）；
 *  - 一个平铺的 `巨型目录/`：25,000 个 txt，超过树的单层分页上限（2000 条 × 10 页 = 20,000），用来验证“已加载，未完整统计”。
 * 合计 105,000 个文件；文件内容极小（体积不是这个场景要测的）。
 * 用法：`node tests/perf/huge-vault.ts <目录>`，或在 E2E 里调用 createHugeVault。
 */
export interface HugeVaultInfo {
  files: number;
  sections: number;
  perSection: number;
  flat: number;
  notes: number;
}

export function createHugeVault(root: string, o: { sections?: number; perSection?: number; flat?: number } = {}): HugeVaultInfo {
  const sections = o.sections ?? 100;
  const perSection = o.perSection ?? 800;
  const flat = o.flat ?? 25_000;
  mkdirSync(root, { recursive: true });
  let notes = 0;
  for (let s = 0; s < sections; s++) {
    const dir = path.join(root, `分区${s}`);
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < perSection; i++) {
      const kind = i % 4;
      if (kind === 0) {
        writeFileSync(path.join(dir, `笔记${s}-${i}.md`), `# 笔记${s}-${i}\n\n分区 ${s} 的第 ${i} 篇。\n`);
        notes++;
      } else if (kind === 2) writeFileSync(path.join(dir, `数据${s}-${i}.json`), `{"s":${s},"i":${i}}\n`);
      else writeFileSync(path.join(dir, `文本${s}-${i}.txt`), `${s}/${i}\n`);
    }
  }
  const flatDir = path.join(root, "巨型目录");
  mkdirSync(flatDir, { recursive: true });
  for (let i = 0; i < flat; i++) writeFileSync(path.join(flatDir, `条目${String(i).padStart(5, "0")}.txt`), `${i}\n`);
  return { files: sections * perSection + flat, sections, perSection, flat, notes };
}

const [, script, dir] = process.argv;
if (script && import.meta.url === pathToFileURL(script).href) {
  if (!dir) throw new Error("用法：node tests/perf/huge-vault.ts <目录>");
  const t0 = Date.now();
  console.log(`huge-vault 已生成：${JSON.stringify(createHugeVault(dir))}，用时 ${Date.now() - t0} ms`);
}
