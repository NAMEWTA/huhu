# 测试、性能与完成标准

## 1. 测试分层

| 层 | 工具 | 覆盖 | 位置 |
| --- | --- | --- | --- |
| 单元 | Vitest | 纯函数：任务分类与输入哈希、cron 预览、路径守卫、frontmatter 局部改写、锚点重定位、主机密钥决策、权限映射、provider argv 与输出解析、指南状态判定 | 各包 `test/*.test.ts` |
| 组件 | Vitest + @testing-library/react + happy-dom | ui 组件状态（loading/disabled/invalid）、ResourcePicker 键盘、CompletionCircle 乐观回滚 | `packages/ui/test`、插件 `test/ui` |
| 集成（Engine） | Vitest + testkit `startTestEngine({ fixture })`（在临时目录复制夹具 Vault，以真实 HTTP 调用能力） | 能力契约、Dispatcher 管线、文件读写与操作日志恢复、文件监听、自动化扫描（fake provider）、SSH（fake ssh2 Server）、Git 同步（本地 bare 仓库）、Herdr（真实 `hc`，CI 下载） | `plugins/*/test/integration`、`packages/kernel/test` |
| 端到端 | Playwright `_electron` | 模块验收中的用户旅程 | `tests/e2e` |
| 打包冒烟 | Playwright + 安装包 | release §5 | `tests/e2e/packaged` |

测试替身（`packages/testkit`）：

- `fake-provider`：Node 脚本，接受与 Claude/Codex 相同的打印模式参数，按环境变量输出预置 stream-json（成功、`ask` 回执、失败、长时间运行）。通过 Space 内的 `PATH` 前置让 provider 检测发现它。
- `fake-ssh-server`：ssh2 `Server`，可配置主机密钥、密码/公钥认证、shell 回显、exec、SFTP。
- `fixtures/`：`demo-vault`（R-12，覆盖全部 kind）、`edge-vault`（CRLF、BOM、中文与 emoji 路径、长路径、重复 id、坏 YAML、未来 schema、符号链接）、`malicious-package.zip`、`malicious-markdown.md`、`scale-vault` 生成脚本（10,000 篇笔记、1,000 任务、1,000 档案，总约 100 MiB）。

## 2. 必须自动化的回归场景

每个模块文档“验收”表中的 ACC 均要求自动化，例外只有下表（需手动验证，release §5 记录结果）：

| ACC | 原因 |
| --- | --- |
| ACC-KN-02 中真实输入法部分 | 自动化只能模拟 composition 事件；E2E 用 CDP `Input.imeSetComposition` 覆盖逻辑，真实 IME 发布前手测 |
| ACC-AG-06 中真实 Claude 会话 | E2E 用 fake provider 写入原生格式会话文件；真实 CLI 发布前手测 |
| ACC-VS-05、ACC-VS-08 中真实托管远端 | 自动化使用本地 bare 仓库；真实远端手测 |

## 3. 性能目标与测量

目标在 `scale-vault` 上、CI 的 Linux runner（以及发布前开发机）测量，脚本 `tests/perf/*.bench.ts`（Vitest bench）与 E2E 计时。未测量前不得在文档或界面宣称达到。

| 指标 | 目标 | 测量方法 |
| --- | --- | --- |
| 冷启动到工作台可交互（示例 Vault） | ≤ 3 s | E2E：`app.launch` 到首页指标条渲染 |
| 打开 scale-vault 到文件树可用 | ≤ 6 s；索引构建在后台继续 | Engine 启动日志计时 + E2E |
| 全量索引构建（scale-vault） | ≤ 15 s，期间界面可操作 | bench |
| 全文检索响应 | p95 ≤ 150 ms | bench：100 个随机词 |
| 打开 1 MiB Markdown 到可编辑 | ≤ 500 ms | E2E |
| 编辑输入延迟 | p95 ≤ 16 ms（实时预览，5,000 行文档） | E2E：Performance API 标记按键到下一帧 |
| 任务列表 1,000 行滚动 | 无掉帧 > 50 ms 的长任务 | E2E 长任务观察器 |
| 终端吞吐 | 10 MiB 输出期间界面输入响应 ≤ 100 ms | E2E：`yes \| head -c 10M` |
| Engine 常驻内存（scale-vault 打开、无会话） | ≤ 600 MiB | `process.memoryUsage().rss` |
| 插件停用/启用 | ≤ 300 ms | 集成测试计时 |
| 长时运行 | 8 小时（每 5 分钟扫描、1 个终端持续输出）RSS 增长 ≤ 20% | 发布前手动 soak，记录结果 |

## 4. 质量门槛

一个任务（tasks/ 中的 Wxx.n）完成必须同时满足：

1. 该任务“完成条件”中的每一项有对应的自动化测试或明确的手动记录。
2. `pnpm lint`、`pnpm typecheck`、`pnpm test` 在三平台 CI 全部通过；涉及 UI 的任务 `pnpm e2e` 通过。
3. 新增能力已出现在 `capabilities.list`，并有契约测试覆盖成功与至少一个错误码。
4. 新增界面使用 design-system 组件与 token；在 1440×900 与 1024×768 截图自查（截图保存在 PR，不进入 Change）；axe 无 serious/critical。
5. 复制的上游文件已登记 `docs/upstream/ledger.md`。
6. 没有新增 TODO/FIXME（oxlint 规则）。

首版发布门槛：全部任务完成；全部 ACC 通过（自动化或手动记录）；§3 性能目标测量完成且达标（未达标项必须修复，不能以说明代替）；release §5 全部通过。
