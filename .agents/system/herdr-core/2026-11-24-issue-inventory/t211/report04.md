# 派发回执

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory`
- terminal_address — `t211`，本机默认 Core
- task — `task04.md`
- 任务文件 — `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/task04.md`
- 回执文件 — `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/report04.md`
- 业务验收报告 — Inventory 的 `041-s3.md`、`099-s6.md` 及 #7 对应 H 票，由 Lead 写入。
- 执行结果 — `done`，三项均提交，Playwright 用例交 Lead 复跑。
- 工作目录 — `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w3`。先从 `5f1519e5` 快进到 `950aebfb`，交付 `bc68417d`，工作树干净。
- 运行原件 — `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t211/task04/`

## 成果与运行指针

| 项目与提交 | 根因及修改 |
| --- | --- |
| H5.2 · `ef4e8c05` | `runs/h7-r3/e1.log` 的断言在第一次移动工具栏前已收到 `[1, 1, 1]`。第 3 轮 `36e00e21` 加入桌面 `attachWhenHidden`，让隐藏标签页的渲染端 WebSocket 第一次也可取得原 Shell 的交接票据。计数统计 `/ws/terminal/:shellId` 的视图附着，每个 Shell 各一次。`tests/e2e/ssh/remaining.spec.ts` 明确等待这三次初始附着，并在移动、切换标签、改变偏好后要求每个 Shell 仍仅附着一次。原有 SSH 拨号次数、布局版本和 Pane/Shell ID 的断言继续核对。 |
| H10.2 · `0fe7ab52` | 日志的超时发生在发起连接之前。`SshModule` 的普通列表只有用主机名标识的行，`打开主机详情 …` 由 `HostDirectory` 提供。`tests/e2e/ssh/settings.spec.ts` 回到远程连接后先打开「主机目录」，从有标签的目录区域点击既有详情按钮，并确认主机标题可见，再执行连接、强制断线和取消第 2 次重试的用例。 |
| 附属文件样式 · `bc68417d` | `WorkspaceRunView.tsx` 的附属文件包装类缺少 CSS 定义。`plugins/ssh/src/ui/ssh.css` 在 `modules` 层定义 `ssh-workspace-attached-files` 的 `min-inline-size: 0`，让面板适应侧列宽度，并让宽表格使用已有的横向滚动区域。 |

## 定向验证

各命令串行取得 `/home/wta/projects/huhu/temp/dev/verify.lock`，执行 `volta run --node 24.22.1 pnpm`，持锁核对内存、cgroup 余量和磁盘。

| pnpm 参数 | 结果与原件 |
| --- | --- |
| `exec vitest run plugins/ssh/test/terminal-runtime.test.ts` | 8 通过，`terminal-runtime.log` |
| `exec vitest run plugins/ssh/test/manager.test.ts` | 35 通过，包括真实回环重试和取消，`manager.log` |
| `exec vitest run plugins/ssh/test/workspace-device-layout.test.ts` | 11 通过，`workspace-device-layout.log` |
| `--filter @huhu/plugin-ssh run typecheck` | 0 错误，`type-plugin-ssh.log` |
| `lint` | 按追加项授权运行全仓 lint，退出 0，CSS 类、分层、所有权及重复检查通过，`lint.log` |

两个改动的 Playwright spec 通过 TypeScript 语法检查，`git diff --check 950aebfb HEAD` 通过。

### Lead 复跑

- `tests/e2e/ssh/remaining.spec.ts` — `H5.2 终端工具栏移动与设备偏好不重连，纵向按同目标分组`
- `tests/e2e/ssh/settings.spec.ts` — `H10.2 非预期断线显示下一次重连并允许取消`
- `tests/e2e/ssh/settings.spec.ts` — `H10.2 文件表列宽可拖动、键盘调整、重载并恢复，SSH 设置应用到运行视图`，覆盖附属文件侧列。

### 未运行的验证

- Playwright、构建、打包、安装包检查、全仓类型检查、knip 和视觉截图。本轮浏览器操作和实际侧列渲染仍待 Lead 验收。

## 阻碍与接续

实施无待决阻碍。Lead 可按上述用例复验。

## Lead 验收
