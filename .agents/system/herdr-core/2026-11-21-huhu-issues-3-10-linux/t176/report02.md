# t176/task02 修复报告

Lead 为 `t3p`。工作树为 integration，基线 `4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73`。改动在工作树内交付。报告接续 [task01 诊断](t176-report01.md)。

## 改动

- **Tasks 终态回执。** `plugins/tasks/src/engine/index.ts:466–473` 在终态回执持久回读成功、释放任务写锁后，异步唤醒现有投递检查。ACK 随原能力调用返回。`plugins/tasks/src/engine/dispatch.ts:751–800` 在已经检查时合并一次后续检查。一次检查结束后先清掉合并标志，之后仅在收到新唤醒或定时器到期时继续检查。继续复用原评论 ID、回执重放、按任务串行写、关闭信号和定时恢复路径。新增回归在 `plugins/tasks/test/persistence-http.test.ts:594,613`，将扫描间隔固定为 60 秒，用真实 Engine 和持久收件入口验证独立于定时器的交付，并用另一任务的 executor 预检暂停当前扫描来证明重复收件仍先返回 ACK，释放后最终产出唯一匹配评论。
- **运行结果区。** `plugins/tasks/src/ui/TaskDispatchPanel.tsx:242–253,282–286` 在 delivered 摘要先到、匹配评论仍在读取时显示状态。`plugins/tasks/src/ui/compact.tsx:18–30` 复用既有紧凑 Markdown 阅读器，同步呈现普通段落，复杂 Markdown 继续走原富文本阅读器且在加载期间有可见状态。shell E2E 保留原有 5 秒正文、原任务唯一回执、原会话定位和单次 provider 请求检查。
- **W05/W06 权限夹具。** `tests/e2e/workflows/acceptance.spec.ts:29–51` 在重载前安装 renderer fetch 包装，仅处理当前 Engine 能力目录的有效认证 GET，真实浏览器请求成功后过滤 JSON。用例读取原目录和已交付给消费者的目录，证明目标条目确实被删除且 `tasks.list` 可用。任务卡用例在 154–172 行验证写按钮从可用到禁用、尝试点击无写请求、西侧任务仍能打开、状态和版本保持。Agent 卡片的同一夹具调用在 314–320 行验证原目录、过滤与单卡退化。
- **Agent 设置夹具。** `acceptance.spec.ts:1542–1583` 在临时 Vault 启动前停用 Automations 的后台启动探测，保留假 Claude、Codex 与 Pi 的原有隔离。假程序记录版本探针，进入设置时证明零次，首次刷新仅 2.1.0，第二次刷新追加 2.1.1。原菜单入口、默认模型命令预览、落盘与重启确认断言保留。

## 验证

- Lead `t179` 运行定向红灯。两条新用例都已得到 ACK，查询预期为 `delivered`，实际仍为 `pending`。2 失败，38 过滤。见 [红灯日志](task-receipt-wakeup-red.log)。
- Lead `t17b` 在生产修复后运行 `plugins/tasks/test/persistence-http.test.ts` 整文件，40 通过。见 [绿灯日志](task-receipt-wakeup-check.log)。随后仅将并发回归的门闩换成等价的 Promise 构造写法以适配项目 ES2023 类型库。最终版本的定向 TypeScript 检查已通过，门闩调整后没有再次运行 Vitest。`t17c` 正在独立只读审查后端，审查结果待报告。
- 最终版 `tsc --noEmit` 按项目严格选项定向核对改动的 Tasks 引擎、UI、回归文件及 acceptance E2E，两个定向命令均通过。六个改动文件的 oxfmt 和 oxlint 检查通过，`git diff --check` 通过。

实际执行的定向检查命令如下，在 integration 工作树根目录运行。

```sh
PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH pnpm exec tsc \
  --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride \
  --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable \
  --types node --jsx react-jsx --esModuleInterop --resolveJsonModule \
  tests/e2e/workflows/acceptance.spec.ts apps/desktop/src/renderer/env.d.ts

PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH pnpm exec tsc \
  --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride \
  --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable \
  --types node --jsx react-jsx --esModuleInterop --resolveJsonModule \
  plugins/tasks/src/engine/dispatch.ts plugins/tasks/src/engine/index.ts \
  plugins/tasks/src/ui/TaskDispatchPanel.tsx plugins/tasks/src/ui/compact.tsx \
  plugins/tasks/test/persistence-http.test.ts

PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH pnpm exec oxlint -c oxlint.json \
  plugins/tasks/src/engine/dispatch.ts plugins/tasks/src/engine/index.ts \
  plugins/tasks/test/persistence-http.test.ts plugins/tasks/src/ui/TaskDispatchPanel.tsx \
  plugins/tasks/src/ui/compact.tsx tests/e2e/workflows/acceptance.spec.ts
```

## 未运行的验证

未启动 Electron 或 Playwright，未跑打包、构建、全仓类型检查或全量门禁。Lead 在候选构建上的串行复验入口为：

- `tests/e2e/shell.spec.ts` 中「自动化运行：Agent 规则经 Tasks 派遣，运行页显示已完成和结果并可定位原会话」。
- `tests/e2e/workflows/acceptance.spec.ts` 中「W05-W06 旧看板任务卡保留独立筛选、时区与布局，冲突后重读任务」与「W05-W06 Agent 入口随插件启停，最近活动在看板内筛选」。
- 同文件「Agent CLI 智能体设置页：列出检测状态，设置默认模型并持久化到 agents.json，命令行预览实时刷新；刷新检测；重启 Core 需确认；菜单里的“智能体设置…”可达」。

## Modern Web Guidance

我沿用 Lead 已检索并完整读取的 `js` 指南。此处保留原生认证 fetch 及其 AbortSignal，在现有 E2E 包装层取得 JSON 过滤结果。运行正文复用已有 Markdown 读取器与 Suspense，未引入新的平台 API。
