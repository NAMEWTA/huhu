import { defineConfig } from "vitest/config";

// 限制全局并发，避免多个 worktree 并行跑测试时耗尽内存被 systemd-oomd 杀掉。
export default defineConfig({
  test: {
    maxWorkers: 3,
  },
});
