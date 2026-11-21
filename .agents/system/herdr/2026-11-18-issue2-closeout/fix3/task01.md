# 收口：完成三项阻断并合并两份未完成修复（只做单元级验证）

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-fix2a`，分支 `closeout4/fix2a`（HEAD 5c25b77 是上一会话中断的未验证现场）。

用户已指示：不要再做大量测试，不跑 e2e、不跑性能、不跑全量 test:vendor。只用单元测试（vitest 定向文件）+ typecheck + lint + build 验证。

步骤：
1. `git merge --no-ff closeout4/fix2b`（e3c97da，也是未验证现场），解决冲突；`pnpm install --frozen-lockfile --prefer-offline`。
2. 完成复审 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/review/report02.md` 的三项阻断，每项先写单元测试判红再修：
   - 并发改名覆盖目标（`packages/vault/src/operations.ts`、`rename.ts`、`plugins/notes/src/engine/service.ts`）：最终一步原子独占，撞名保留双方。
   - 编码转换覆盖检查后的外部更新（`plugins/notes/src/engine/service.ts`、`packages/vault/src/write.ts`）：提交点 CAS 或可恢复原件。
   - 源码模式撤销改写混合换行（`packages/editor/src/host/markdown-file-envelope.ts`、`RichMarkdownEditor.tsx`）：`A\r\nB\nC\r\n` 删 B 后 LF 再撤销须回到原字节。
3. 其余半成品：能在小改动内完成且有单测的保留；无法完成或会破坏构建的改动回退到 closeout4/final 状态，在报告中列出回退了什么。不要留下引用不存在测试夹具的 e2e 改动导致 typecheck 失败。
4. 验证：相关单测文件、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build`、`node scripts/ok-patches.mjs --check`，vendor 有改动时用 `OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge ORCA_SRC=/home/wta/projects/huhu/temp/sources/orca` 执行 `--refresh-replay` 与 `--refresh-catalog`。
5. 提交到本分支，回报 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/fix3/report01.md`（三阻断各自的判红/转绿测试、保留与回退清单、验证命令与退出码），manifest 中 fix3 行改为 task01.md done。
