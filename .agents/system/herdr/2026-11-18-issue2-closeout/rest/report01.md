# 最后一批剩余项执行报告

- 共享根：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout`
- 清单标识 / 实际 pane_id：`rest` / `w5:pH`
- task：`task01.md`
- 任务文件：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/rest/task01.md`
- 报告文件：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/rest/report01.md`
- 执行结果：done
- 工作树及交付：`/home/wta/projects/huhu-wt-rest`，分支 `closeout5/rest`，提交 `57a9f8bc960b9a60e9fc943f8280091f716a0856`。工作树干净，提交在本地。

## 条款与产物

| 条款 | 原复审分类 | 结果与证据 |
| --- | --- | --- |
| B01 118 镜像 | 应修真实宿主读取 | 所属编辑根从当前 Vault 读取未打开的 Markdown 源，监听文件失效，取消过时请求。断言在 `packages/editor/test/host-fetch-scope.test.tsx:137`。实际文件、外改和切库用例在 `tests/e2e/knowledge/local-reference-blocks.spec.ts:54`，待 Lead 执行。 |
| B01 119 Excalidraw | 夹具证据、实际文件不可达 | 从当前 Vault 读取既有画板，支持工作台地址，文件变更后重新导出。上游组件和宿主切换单测通过。实际画面及 Blob URL 回收断言在 `tests/e2e/knowledge/local-reference-blocks.spec.ts:54`，待 Lead 执行。 |
| B01 114 PDF | 插入和布局有证据，实际加载缺证 | 内嵌 PDF 经 Vault 范围读取，文件失效重载，卸载销毁加载任务。`packages/editor/test/host-fetch-scope.test.tsx:216` 验证字节传递和释放。`tests/e2e/knowledge/local-reference-blocks.spec.ts:115` 断言逐页绘制、外改、重开和切库，待 Lead 执行。 |
| B01 矩阵 | 缺断言、来源及准确计数 | 208 回填剪贴板 HTML 和未挂载回退，353 回填源码与富文本落地装饰。98/169/346/348/354 引用已定范围和固定上游调用，65/128/266/288/297/300 修复断言定位。第 1–13 节机械核对 283 行，247 行已有行为证据、33 行不适用、3 行已有局部证据且新增 Electron 待跑。本地行链接均有效。动作总计 159 直接复制、91 宿主适配、33 不适用。 |
| H04 | 旧扫描按路径归组，配置遗漏 | 逐调用记录 chunk、偏移、方法、签名和各适用作用域 handler。`/api/comments` 的 GET／POST 均已定位，`GET /api/config` 与 `GET /api/reference-text` 均有绑定。配置回归断言见 `packages/editor/test/host-fetch-scope.test.tsx:126`。 |
| B03 | 缺同序列对拍 | `tests/parity-ok/compare.spec.ts:156` 补两端同序列前缀、首尾循环、浮层随滚动、命中与焦点、右缘和切文档清理。对拍证据页已注明本轮待跑。 |
| D02 | 旧证据与用户决定不符 | `evidence/parity-ok/comments.md` 记录 Huhu 渲染 Markdown 和引用块，固定 OK 在同夹具显示字面正文。既有实测记录了 OK 缺回复及手动解决入口、直接删除；过滤和重开的前置状态由固定源码和 DOM 记录解释。现行渲染和磁盘原文验收见 `tests/e2e/knowledge/comments-s4.spec.ts:353`。 |
| H05 | 已有任务修改入口缺联合验证 | `tests/e2e/knowledge/compact-inbox.spec.ts:230` 从实际任务详情打开 TaskEditor，覆盖输入、撤销、重新组合、保存、磁盘断言及重开。 |
| Q6 | 历史远端证据边界 | `evidence/s0-facts.md` 区分本地冻结引用差和 S0 当时的远端状态。 |
| Q8 | 外部消费者仅有仓内证据 | 发布草稿记录 GitHub Code Search 两条查询、24／17 条命中均为本库历史记录、公开 fork 为 0，结论为现有证据下直接迁移。私有代码、未索引代码、本地脚本不在核实范围。 |

本地文本引用使用现有 Vault 范围读取守卫，单次读取上限 4 MiB。PDF 复用既有附件读取、版本校验和 25 MiB 容量上限。宿主测试用模拟路由和 PDF.js 加载任务验证生命周期，另有实际 Vault 资源守卫的仓内测试。前端使用 `AbortSignal.any()` 合并生命周期与请求，使用 `AbortSignal.timeout()` 给文本引用读取设置截止时间。桌面 Electron 44.9.1 对应 Chromium 152，Web 在 Baseline Widely available 范围。

## 验证

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| 配置回归判红 | 1 | 同一断言原返回 404，应为 200。[日志](/tmp/huhu-rest/red.log) |
| `pnpm exec vitest run` 定向宿主、反馈和 PDF 恢复 | 0 | 3 文件 41 项通过。[日志](/tmp/huhu-rest/unit.log) |
| `pnpm --filter @huhu/editor run test:vendor` 定向 | 0 | 11 文件 126 项通过，含 Excalidraw、镜像、PDF 布局、配置、剪贴板及双态落地。[日志](/tmp/huhu-rest/vendor-unit.log) |
| `pnpm typecheck` | 0 | 提交后复跑通过。[日志](/tmp/huhu-rest/final-typecheck.log) |
| `tsc --noEmit` 定向 E2E 与对拍 | 0 | 以项目严格编译选项核对新增及变更用例，含 Electron 声明。为此修正现有辅助函数的浏览器定时器类型。[日志](/tmp/huhu-rest/e2e-types.log) |
| `pnpm format:check`、`pnpm lint`、`pnpm knip`、`pnpm notices` | 0 | 提交后复跑通过，第三方声明生成无差异。[日志](/tmp/huhu-rest/final-static.log) |
| `pnpm build`、`node packages/editor/build/check-host-endpoints.mjs --assert` | 0 | 提交后构建，CSS 碰撞为零。44 条端点与桥接记录，32 个已匹配宿主调用，0 待处理，重新生成的证据无差异。[日志](/tmp/huhu-rest/final-build.log) |
| `node scripts/ok-patches.mjs --check`、`--refresh-replay`、`--refresh-catalog`、`--check-catalog`、`--replay` | 0 | 560 项补丁登记，未登记及多余均为 0。1,556 个文件重放，集合和字节零差异。[日志](/tmp/huhu-rest/patches.log) |
| 额外全量 `pnpm test` | 已终止 | CSS 碰撞检查 23 项通过。Vitest 在黄金往返套件长时间未退出，独立复查 60 秒超时（124）。[全量日志](/tmp/huhu-rest/unit-full.log) · [复查日志](/tmp/huhu-rest/golden.log) |
| `pnpm exec vitest run --exclude '**/golden-roundtrip.test.ts' --maxWorkers=4` | 0 | 除该套件外，101 文件，1,085 项通过。[日志](/tmp/huhu-rest/unit-without-golden.log) |

## 阻碍与接续

按用户指示，Electron E2E、固定 OK 两端对拍和性能由 Lead 统一运行。黄金往返全量结果待集成侧补验。待用户决定事项无。

## Lead 验收

- 2026-11-20 Lead：接受，进入最终链。
