import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** 恢复后暂停：`.huhu/automations/holds.json`，键为 taskId，值为被暂停的 inputHash。输入变化（hash 不同）即自动失效。 */
export class HoldStore {
  constructor(private readonly file: string) {}

  private load(): Record<string, string> {
    if (!existsSync(this.file)) return {};
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as Record<string, string>;
    } catch {
      // 不静默当作空表再覆盖写入：那会丢掉其他任务的"恢复后暂停"保护
      throw new Error("holds.json 无法解析，请修复或删除后重试");
    }
  }

  hold(taskId: string, inputHash: string): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ ...this.load(), [taskId]: inputHash }, null, 2));
  }

  isHeld(taskId: string, inputHash: string): boolean {
    try {
      return this.load()[taskId] === inputHash;
    } catch {
      return true; // 读不了时宁可不处理，也不要重复执行
    }
  }

  /** 用户点“继续自动处理”。 */
  release(taskId: string): void {
    const cur = this.load();
    delete cur[taskId];
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(cur, null, 2));
  }

  /** 清理已失效的 hold（任务当前 hash 已不同）。 */
  prune(current: (taskId: string) => string | null): void {
    const cur = this.load();
    let changed = false;
    for (const [id, h] of Object.entries(cur)) if (current(id) !== h) { delete cur[id]; changed = true; }
    if (changed) writeFileSync(this.file, JSON.stringify(cur, null, 2));
  }
}
