# 固定 OK 与 Huhu 实跑对照

以 OK 上游 `44a2e0a6acce5952da0764746e3693fded5025b4` 和 Huhu 集成后生产构建 `c2e7f2c21cee182a36f9301d1dabbc912d7253be` 为 task06 对照对象。task07 的评论边缘按钮和链接快捷键使用同一 OK 基线与 Huhu 生产构建 `fbea0f6df5cfd6265a34d88d3377962f1f959087` 复跑。OK 使用上游预构建的 Vite 浏览器应用与自带本地协作服务。Huhu 使用生产 Electron，工作台地址为 `huhu-app://workbench`。本机为 Linux x86_64 7.0.0-43-generic，8 个逻辑核、30 GiB 可见内存。OK 使用固定的 Node 24.21.0、pnpm 12.8.1 和 Vite 8.0.8。Huhu 使用 Node 26.11.1、pnpm 12.10.1 构建，Electron 44.9.1。Playwright 1.65.0，视口 1440 × 900。

## 复跑

按 OK 的 README 与 CONTRIBUTING，固定 SHA 工作树可用以下代码启动浏览器编辑器。为隔离运行数据，每次给协作服务指定独立内容目录。上游工作树与 Huhu 工作树各自使用原锁文件。以下命令使用上游 `vite.prebuilt-dev.ts`，本次发布的 OK 证据来自这个入口。其余启动方案与重启过程见[启动记录](startup.md)。

```bash
git -C /home/wta/projects/huhu/temp/sources/open-knowledge worktree add --detach /tmp/ok-parity-source 44a2e0a
cd /tmp/ok-parity-source
HUSKY=0 pnpm install --frozen-lockfile
cd packages/app
pnpm run predev
ok_content=$(mktemp -d /tmp/ok-parity-content.XXXXXX)
ok_build=$(mktemp -d /tmp/ok-parity-build.XXXXXX)
NODE_ENV=development OK_TEST_PREBUILT_OUT_DIR="$ok_build" \
  pnpm exec vite build --mode development --config vite.prebuilt-dev.ts
NODE_ENV=development OK_TEST_CONTENT_DIR="$ok_content" \
  OK_TEST_PREBUILT_OUT_DIR="$ok_build" VITE_PORT=17385 \
  pnpm exec vite preview --config vite.prebuilt-dev.ts --host 127.0.0.1
```

在 Huhu 工作树用相同的样本文本和 Playwright 行为脚本运行。传给 `PARITY_OK_CONTENT` 的绝对路径必须与服务启动时的内容目录相同。用 `PARITY_OK_SIDE=ok` 或 `PARITY_OK_SIDE=huhu` 可单独复跑一侧，用 `--grep` 可限制功能。

```bash
pnpm install --frozen-lockfile
pnpm build
PARITY_OK_URL=http://127.0.0.1:17385 \
PARITY_OK_CONTENT=/tmp/ok-parity-content.XXXXXX \
PARITY_OK_OUTPUT=/tmp/huhu-parity-ok-evidence \
xvfb-run -a -s '-screen 0 1600x1000x24' \
  pnpm exec playwright test --config tests/parity-ok/playwright.config.ts
```

每个功能目录的 `ok.json` 和 `huhu.json` 保存逐步 DOM 状态，两份 `.md` 为运行结束从磁盘读取的 Markdown。同一步截图采用相同文件名后缀。`observed` 表示已采集该步的结果，结果值为 `available: false` 表示比较所需的入口在当前界面上缺少。`failed` 记录该步执行或断言失败。Playwright 的用例完成计数表示采集任务执行完毕，功能判定见逐项文档。

## 对照结果

| 功能 | 等价 | 已登记差异 | 未对齐 |
| --- | --- | --- | --- |
| [B01 标签页菜单](tabs.md) | 右击和键盘打开、Escape 恢复焦点、关闭其他 | DocTab、文件操作入口和窗格范围 | — |
| [B03 斜杠菜单](slash.md) | 分类与条目语义顺序、别名、预览、方向键、Enter、Tab、鼠标、Escape、无结果、视口避让 | 组名及条目的本地化、中文查询结果 | — |
| [D02 选区评论](comments.md) | 创建、高亮、边缘按钮、打开线程、Markdown 按字面显示、最终删除、磁盘原文 | 回复、手动解决、过滤、重开与删除确认的入口差异 | — |
| [块类型](block-type.md) | 九项顺序、转二级标题、保存 | — | — |
| [脚注](footnote.md) | 引用和定义配对、保存 | — | — |
| [表格行拖拽](table.md) | 行句柄、显示顺序、保存 | — | — |
| [链接编辑](link.md) | 富文本选区按 Mod+K 打开气泡 URL 输入、更新已有链接并保存 | 富文本外和源码模式保留命令面板 | — |

[原差异复验与已登记差异](unaligned.md)
