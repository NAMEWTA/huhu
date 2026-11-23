# #3 / #6 / #10 桌面保存、关窗与 Web 联验

- 任务 `t4x/task11.md`，本机 Core `wta-ubuntu`，终端 `t4x`，Lead `t3p`。
- 工作树 `agent-linux`，分支 `impl/huhu-issues-3-10-desktop-web-verify`，基线 `f310e541a86825cc5a7ac100b4c230e5bbf1fdca`。
- 扩展既有用例「Web 分享：两份邀请和三个浏览器会话，单份撤销与看板保存重开」。唯一代码变更为该 spec，未暂存。 [web-share.spec.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/workflows/web-share.spec.ts)

## 验收内容

1. 在临时 Vault 准备两份 Markdown。桌面通过知识库选中其中一份，关闭自动保存后输入，确认磁盘仍是编辑前的内容。通过实际应用菜单的「保存当前文档」保存，核对目标文件内容、编辑器保存状态及另一份文件的原始字节。
2. 在同一 Vault 保留 Web 同一邀请重复使用、两份邀请三个独立浏览器会话，以及精确撤销 A 的两个会话和拒绝再次使用 A 的断言。B 保存布局隐藏专注卡片，其他会话收到布局更新，B 在 A 撤销后可重载并看到已保存布局。
3. 停止分享并关闭浏览器后，桌面隐藏最近笔记卡片，触发窗口关闭。「继续编辑」应保留窗口和草稿，磁盘布局仍等于 Web 保存后的字节。再次关窗并点击「保存并离开」，核对关闭完成及两张卡片均已写入隐藏状态。依次重启桌面和打开同一 Vault，通过首页和知识库回读布局、文档，并核对两份 Markdown 与布局文件的字节。

复用现有窗口与临时 Vault fixture、引擎就绪等待、知识库树定位和真实菜单触发方式。浏览器先关闭，第二个 Electron 实例等第一个退出后才启动。用例超时设为 90 秒，为两次启动留出时间。 [启动 fixture](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/helpers/launch.ts) · [桌面保存与关窗用例](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/knowledge/session-flush.spec.ts:48) · [首页布局用例](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/workflows/acceptance.spec.ts:823)

## 预期验收轮

Lead 在 Linux 收尾联验轮使用已准备的桌面构建和 Playwright Chromium，持 `/tmp/huhu-heavy.lock` 串行执行。预期该文件中的一条组合用例通过，并看到桌面保存、关窗及重开三个步骤均完成。环境缺少浏览器时，原有条件会跳过用例。

```sh
flock /tmp/huhu-heavy.lock xvfb-run -a pnpm exec playwright test tests/e2e/workflows/web-share.spec.ts --workers=1
```

本次只做静态对照和 `git diff --check`。没有启动 Playwright、Electron 或浏览器，也没有运行单测、全量测试、lint、类型检查或构建。实际界面时序、退出及重开行为待 Lead 验证。

## 文件 SHA-256

```text
9068ab2ae640248eb6a40aef1b9bdc6440e68237afd8ac3674daa4632e478ba6  tests/e2e/workflows/web-share.spec.ts
```

## Core 回告

`hc get t4x` 因 Core 锁只读失败。已通过本机终端环境、任务清单、分支和基线核对接单身份。

发布后执行 `hc send t3p`，同样因 Core 锁只读失败，退出码 5。回告未送达，共享报告已写入。
