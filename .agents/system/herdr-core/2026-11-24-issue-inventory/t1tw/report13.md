# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1tw
- task — task13.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/task13.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/report13.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/042-s4.md
- 执行结果 — done

## 成果与运行指针

- S4 / H7.1–2 第 3 次实施。工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，从 `7e60a3e4` 快进至 `9e1160c3` 后实施。提交 `676fdf26cc740d449dc83b0771763224d9ee6bb6`，工作树干净。
- `plugins/ssh/src/ui/{FileBatch,FileTable,FileWorkspace}.tsx` 与 `files.css` 沿用 H5.2 的主指针捕获、4 CSS px 门槛和释放坐标命中做法。独立把手保留按下时的有效选中项，带边框反馈的目标必须是当前 provider 内另一侧的可接收栏。释放命中才调用已有批次提交。无效落点、指针取消、丢失捕获和 Escape 清除手势，勾选与键盘可操作的上传下载按钮继续复用提交。操作系统文件拖入继续显示选择本机目录的提示。
- `tests/e2e/workflows/ssh-workspaces.spec.ts` 从首次上传前记录批次 request、response 和 requestfailed，网络记录仅含时间、方向、名称、HTTP 状态和批次 ID。拖动前后各读取一次队列，记录源把手和目标栏矩形、滚动位置和 DOM 事件。实际动作使用 Playwright 主鼠标，从把手跨过门槛后到本机栏可见范围内释放。断言真实响应与队列唯一新增批次一致，来源为原远端会话、目标为绑定本机目录。按该批次核对普通子文件内容和「未遍历链接」记录，用 `lstat` 检查本机没有链接目录项，再完成原有跨会话复制。JSON 附件名为 `h7-file-batch-drag`，在关闭夹具前于 finally 附加。
- `plugins/ssh/test/file-batch-pointer.test.tsx` 使用实际 React 双栏和文件表，在 jsdom 模拟几何与指针捕获，核对门槛、选中项及只提交一次、跨会话拒绝、捕获丢失取消、系统文件拖入提示和勾选提交。首次运行的 fixture 因 jsdom URL 实例与 Node `createRequire` 不兼容未收集测试，改用项目已有的 Node URL 导入后通过。
- 以下命令均在 `/home/wta/projects/huhu/temp/dev/verify.lock` 下串行执行。开始前核对可用内存、父 cgroup 限额、磁盘和 inode，运行日志存于 [task13](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1tw/task13)。
  - `volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/file-batch-pointer.test.tsx`，3/3 通过。
  - `volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/transfer-publication.test.ts`，7/7 通过，含回环 SFTP 目录下载时普通文件发布及跳过链接。
  - `volta run --node 24.22.1 pnpm --filter @huhu/plugin-ssh run typecheck`，退出 0。
  - `volta run --node 24.22.1 pnpm exec playwright test --list tests/e2e/workflows/ssh-workspaces.spec.ts -g 'H7.1–2 批量目录逐项确认'`，识别 1 条用例。暂存与提交差异检查通过。

## 阻碍与接续

- Lead 待在 Linux Electron 的 X11/Xvfb 环境运行 `tests/e2e/workflows/ssh-workspaces.spec.ts` 的「H7.1–2 批量目录逐项确认，拖放保留内容并阻止链接逃逸」，核对附件、队列与落盘。旧原生拖放在哪一步中断，现有 trace 无法确认。新实现的真实桌面输入与附件输出待该次复验。
- 未运行 Electron 或独立 Web E2E、真实外部主机验证、构建、打包、全仓检查或视觉取证。范围限 H7.1–2 栏间拖放。

## Lead 验收
- Lead 2026-11-25：合入 main ce9ecf2a，SSH 41/41 通过，S4 验收通过。
