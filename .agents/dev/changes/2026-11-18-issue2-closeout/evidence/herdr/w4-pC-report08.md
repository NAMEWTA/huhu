# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pC
- task：task08.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/task08.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report08.md
- 执行结果：done

## 结论

第一次拖放把根级「甲」移到「目标」后，旧树行仍可能短暂存在。修复前，把旧行映射成 `notes.move {path:"目标", targetDir:"甲"}` 会重建根级「甲」并移走「目标」。修复后，同一个请求返回 `NOT_FOUND` 和「目标文件夹不存在：甲」，磁盘上的目录与笔记字节保持原样。现有文件树会捕获移动失败、显示错误并重新同步树模型。确定性过期目标验证走真实引擎能力，真实拖放则继续验证文件夹无法拖入自己的后代。

## 产物与改动

分支 `closeout/issue2-session` 先快进至 `471dfdf`，再提交 `4f5d524ebf1e570ed7c5fc09269dad642cd1cea8`。工作区干净。

- `plugins/notes/src/engine/service.ts` 在 `NotesService.move` 校验非空目标为现存目录。校验放在接收目标目录的入口，档案调用的 `moveEntry` 和同目录 `notes.rename` 路径维持原行为。
- `apps/engine/test/engine.test.ts` 覆盖缺失目录、目标是文件、祖先是文件与空字符串目标回 Vault 根。验证拒绝时保留原文件字节，也验证回根的移动映射。
- `tests/e2e/workflows/acceptance.spec.ts:618` 同时等待新笔记出现和旧目录清理，显式验证旧路径的能力请求遭拒，再等旧树行消失。后续拖放按 `目标/`、`目标/甲/` 的精确路径定位。

## 验证

原始日志和 trace 位于 `/tmp/huhu-session-08/`。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 回归红灯 | 旧引擎三个非法目标用例均失败，根目录用例通过。缺失目录请求返回成功，文件目标返回笼统错误。 | `unit-red.log` |
| 受影响单测 | `pnpm test apps/engine/test/engine.test.ts plugins/notes/test/archives.test.ts plugins/notes/test/explorer-deps.test.ts --maxWorkers=2`，72/72 通过。包含档案移动、改名与文件树改名分派。 | `unit-final.log` |
| 构建、类型和 lint | `pnpm --filter @huhu/desktop build`、`pnpm typecheck`、`pnpm lint` 最终均退出 0。首次类型检查发现旧测试助手的结果类型未声明 `data.path`，改用夹具预期路径并单独断言返回路径后复跑通过。 | `build.log`、`typecheck.log`、`typecheck-final.log`、`lint-final.log` |
| 拖放单跑与压力复跑 | 首次单跑读到新文件时旧空目录尚未清理，调整为同时等待两个磁盘条件后 1/1。指定 `:618 --repeat-each=20 --workers=6 --retries=0` 最终 20/20。 | `smoke.log`、`smoke-final.log`、`stress.log` |
| 工作流验收 | `xvfb-run -a pnpm exec playwright test tests/e2e/workflows/acceptance.spec.ts --retries=0`，43/43 通过。第 487 行的用例实际打开 MoveDialog 并移动回 Vault 根。 | `acceptance.log`、`acceptance-results/.last-run.json` |
| 文件树同目录改名 | `xvfb-run -a pnpm exec playwright test tests/e2e/knowledge/editor-parity-closeout.spec.ts:605 --retries=0`，1/1。覆盖拒绝带分隔符的名字、有效改名保留扩展名及正文。 | `rename.log` |

## 阻碍与接续

无。

## Lead 验收


Lead（2026-11-19）：接受。核对 4f5d524 的 `service.move` 入口校验、引擎单测与 e2e 改写；校验只在接收目标目录的入口，档案层 `moveEntry` 不受影响；MoveDialog 只提供现存目录。已 `--no-ff` 合入 `closeout/issue2-integration`。
