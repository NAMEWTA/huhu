# task01.md 顾问分析（t1ys）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory；topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md；manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1ys（只读顾问，gpt-6.2-astra high）
- 回执 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ys/report01.md（先写 .tmp 再 `node -e "fs.linkSync(a,b)"` 发布）
- Lead 回告 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu（main `793366cf`），**只读**：不改代码、不提交、不运行 E2E/构建；可读 trace（解压到 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1ys/）。

## 问题（按团队规则：同一缺陷两次修复后仍失败，第三次实施前请顾问）

`tests/e2e/workflows/ssh-workspaces.spec.ts`「H7.1–2 批量目录逐项确认，拖放保留内容并阻止链接逃逸」（票据 .agents/dev/changes/2026-11-24-issue-inventory/tasks/042-s4.md，#7 SSH 文件传输）。Linux X11 Electron 44.9.1，xvfb，Playwright 1 worker。

1. 首次（main 合入 S4 `d55af36d` 后）：第 1175 行读本机 `pull/sub/pulled.txt` ENOENT。日志 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-ssh-ws-s4.log。
2. 第 1 次修复 `a395aab1`（假设：`first().partial` 先匹配缓存的上传批次；改为等含「pulled.txt · 已完成」的下载批次）：该批次元素不存在（期望 data-state=partial）。日志 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-ssh-s5.log，trace /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/s5/workflows-ssh-workspaces-H7-1–2-批量目录逐项确认.zip。
3. 第 2 次修复 `874ac855`（假设：整行拖放覆盖复选框/按钮导致拖放未触发；改为独立拖动把手、目标栏声明 copy，用例用实际指针路径拖把手到另一栏标题并 `page.waitForResponse` 等远端→本机提交回应）：第 1175 行 `page.waitForResponse` 10 秒超时，没有提交请求。日志 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-ssh-all-s7.log，trace /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/s7/workflows-ssh-workspaces-H7-1–.zip。

同一轮其余 SSH 用例 39 条通过（含 H7.2 续传、H7.3 ZIP）。参考：H5.2 曾因原生 HTML 拖放在 Playwright/Electron 下鼠标移动挂起，改为指针捕获后通过（提交 df56e473）。

## 交回

最可能的根因（产品或用例）、支撑证据（trace 中的具体动作/时间/请求）、被排除的假设，以及下一步最小验证与修复建议。中文回执。
