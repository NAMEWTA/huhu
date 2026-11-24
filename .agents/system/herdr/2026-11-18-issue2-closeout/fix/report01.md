# Issue #2 独立审查问题修复

| 任务身份 | 值 |
| --- | --- |
| 共享根 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout` |
| 清单标识 / 实际 pane | `fix` / `w5:pC` |
| 任务 | `task01.md` |
| 工作树与分支 | `/home/wta/projects/huhu-wt-fix` · `closeout4/fix` |
| 基线 → 提交 | `2fbe53f` → `6f598fe1787b423052d09d033e37784f0981299f` |
| 结果 | done |

## 逐项验收

| 条款 | 原分类 | 结果与断言 |
| --- | --- | --- |
| 1 · B09/C03/F02 | 阻断 | CodeMirror 与 Y.Text 共用 LF 坐标。文件信封保留 BOM，混合行尾按 Y.Text 事务恢复原分隔符，重复行以实际编辑偏移区分。Electron 编辑首个 CRLF 后的字符，核对 CRLF 与 BOM 混合行尾的磁盘字节、富文本和重开结果。`packages/editor/test/markdown-file-envelope.test.ts:4`、`tests/e2e/knowledge/editor-s3-properties.spec.ts:274` |
| 2 · F02 | 阻断 | 笔记读取和保存、链接改写、档案更新及语义 Markdown 补丁检查 UTF-8。原字节在转换前保留。Markdown、TXT、JSON 用同一转换入口，显式选择旧编码并校验原文件版本。`plugins/notes/test/service.test.ts:474`、`packages/vault/test/repository.test.ts:59`、`tests/e2e/knowledge/editor-s3-properties.spec.ts:308` |
| 3 · A07/A08/E04 | 阻断 | 按磁盘子树规划，在 OperationLog 内整体移动，从实际目标生成文件映射。夹具断言 watcher 尚未交付的新增文件、提交前新增文件、二进制字节、空目录、隐藏规则和稳定 ID。受保护后代会拒绝整次移动。`plugins/notes/test/service.test.ts:111` |
| 4 · A07 | 阻断 | 复制沿用同进程队列，OperationLog 的 `expectedVersion: null` 使用原子独占发布。目标在选名后被占用时保留双方字节并报告冲突。回滚按文件身份区分竞争者。`plugins/notes/test/service.test.ts:228`、`packages/vault/test/operations.test.ts:51` |
| 5 · D04 | 阻断 | 优先采用与锚点版本匹配的旧文档和编辑映射。删除重复长模板中的原段时，磁盘线程保留为孤立，幸存段无边缘按钮和高亮，可重选。`plugins/notes/test/comments.test.ts:67`、`tests/e2e/knowledge/comments-s4.spec.ts:215` |
| 6 · G04/OP-D09 | 阻断 | PDF 查找先订阅再派发，重开接收同步缓存，清空或换词后丢弃晚到计数。Electron 检查活动高亮所在文本、切换查询、关闭后移除高亮及重开导航。固定 ORCA 适用文件 8/11（72.73%），部分覆盖留在分母。Huhu 外壳等价适配已登记。`plugins/notes/test/orca-pdf-find.test.tsx:28`、`tests/e2e/workflows/viewers.spec.ts:830`、`plugins/notes/src/vendor/orca/pdf/UPSTREAM.md` |
| 7 · A08 | 应修 | 从 flush 前到路径重定位提交期间暂停文档区输入。Electron 在磁盘改名后扣住回执，验证旧视图仍在但不能继续输入，放行后新输入保存到新路径，旧路径无残留草稿。`plugins/notes/test/explorer-deps.test.ts:124`、`tests/e2e/knowledge/session-flush.spec.ts:234` |
| 8 · A08 | 应修 | 两次物理 rename 共享一条可恢复日志，第二跳和尾部失败有回滚证据。模拟大小写不敏感卷出现竞争文件时保留暂存原件及竞争者，日志标为 `needs_attention`。`packages/vault/test/operations.test.ts:117`、`plugins/notes/test/service.test.ts:145` |
| 9 · H04 | 应修 | 每个 Vault 用同一请求代次结算列表、加载状态和错误，合并同轮请求。定向用例覆盖失败与成功乱序、切标签、作用域隔离，以及重试后恢复磁盘已有线程。`packages/editor/test/host-feedback.test.tsx:430`、`tests/e2e/knowledge/comments-s4.spec.ts:595` |
| 10 · H04/OP-D04 | 应修 | OK 根按组件和编辑器实例传递请求，严格按方法和路径分派。覆盖并挂根、卸载顺序、异步切换及未登记方法。桌面产物检查 43 个宿主签名、0 个待处理。`packages/editor/test/host-fetch-scope.test.tsx:35`、`packages/editor/build/check-host-endpoints.mjs:42` |
| 11 · F03 | 应修 | 启动前写入 PDF，再从磁盘外改，断言旧页退出且恢复后显示新内容。断言等待覆盖原生监听和应用的轮询间隔，首轮本机通过，用例无条件跳过。`tests/e2e/workflows/viewers.spec.ts:332` |
| 12 · Q8 | 应修 | 发布草稿明确 `notes.move` 非空目标目录须已存在，`notes.create.templatePath` 仅桌面端。`.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/verification/s8/release-notes-draft.md` |
| 13 · 差异空白 | 建议 | 清理审查指出的日志行尾。工作包 `git diff --check` 与集成差异检查通过，集成检查排除该 ProseMirror 补丁原有的空上下文行。 |

## 运行证据

- 原始 `cm.cjs` 与 `pnpx tsx …/probes.mts` 在独立审查工作树复现错位、UTF-8 替换、整目录遗漏、复制覆盖和同文吸附。这些最小探针与新测试的失败输出提供了修复前证据。[原始审查](../review/report01.md)
- Electron 定向 `--workers=1 --retries=0`。首轮退出 1，24 通过、2 失败。两项失败都是用例把 Markdown 关闭按钮写成带扩展名，已到达首个磁盘字节断言。仅重新运行这两项，退出 0，2 通过，结果合计 26/26。启动前核对其他 Electron/Playwright 进程。首轮包括所有 PDF 用例，随后补强的未标记计数防护由真实 PDF.js 控制器测试覆盖。[首轮 JSON](/tmp/huhu-fix-e2e.json) · [复跑 JSON](/tmp/huhu-fix-e2e-retry.json)
- 项目测试首轮 99 个文件通过，1 个 PDF 计数用例判红，含黄金往返 254/254。修复后复用该黄金套件结果，重新执行其余项目测试。该轮在共享机器上有 13 项超时及一项提醒时序断言失败。两轮定向复核均在一分钟负载低于 4 时启动，第一轮的 20 项有 15 项通过。另一工作树此时启动 Electron，余下 5 项超过 5 秒。最后仅复核这 5 项，单 worker、临时上限 20 秒，退出 0，全部通过，实际每项耗时均低于 1 秒。项目测试合计 1,318 项验证通过。最后补充的大小写别名失败与通过证据见独立事务套件。[首轮](/tmp/huhu-fix-test-final.log) · [复跑](/tmp/huhu-fix-test-final-delivery.log) · [事务判红](/tmp/huhu-fix-case-alias-red.log) · [事务检查](/tmp/huhu-fix-case-alias-green.log) · [失败项复跑](/tmp/huhu-fix-unit-retry.log) · [剩余五项复跑](/tmp/huhu-fix-unit-residual.log)
- `pnpm test:vendor` 退出 0，530 文件、9,182 通过、4 跳过。固定 ORCA 5 个 Vitest 文件、16 用例通过。保持 10 个已记录的 OK 不适用文件的原判定，OK 适用口径 516/639（80.75%）。[Vendor JSON](/tmp/huhu-fix-ok-vendor.json) · [ORCA JSON](/tmp/huhu-fix-orca.json) · [通过率汇总](/tmp/huhu-fix-vendor-catalog.log)
- `format:check`、`lint`、`typecheck`、`build`（含 `check:ok-css`）、`knip`、`notices` 均退出 0。类型检查修复了已判定非孤立后又比较同一状态的冗余分支，并对最终 Vault 和 PDF 代码单独复核。OK 和 ORCA 固定 Git 源重放分别 1,556 与 13 文件，字节零差异。补丁登记 555 项，缺失和多余均为 0。[静态门禁](/tmp/huhu-fix-lint-commit.log) · [类型检查](/tmp/huhu-fix-typecheck-followup.log) · [生产构建](/tmp/huhu-fix-build-commit.log) · [重放](/tmp/huhu-fix-vendor-replay-check.log)
- Chromium 158.0.8127.18 在无 preload 的浏览器验证页通过源码 / 富文本同步、文件树浏览及复制。Linux Electron 走实际应用入口。转换界面使用显式表单提交，编辑暂停使用 Baseline 广泛支持的 `inert`。[浏览器记录](/tmp/huhu-fix-browser-smoke.log) · [HTMLElement.inert](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/inert) · [TextDecoder.fatal](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/fatal)

## 边界与交接

- 无待用户决定。本工作包已提交本地分支。跨包改动涉及 Vault 文件事务、编辑器及其固定上游适配、笔记引擎和查看器、Electron 夹具与验收台账。
- 文件独占发布依赖硬链接，日志识别依赖稳定的文件身份，整目录移动限于同一文件系统。Windows/macOS 实机仍按 Q7 登记为未验证，大小写不敏感冲突用合成别名夹具验收。
- ORCA 仍有瓦片设备像素、尺寸读取次数及 reload 资源清理三个适用文件未计通过。F03 本机走原生监听，测试超时包含轮询回退的触发窗口。
- 显式历史版本恢复维持现有行为，覆盖前建检查点。旧历史 blob 经过现有 Git 文本读取通道，未验证其非 UTF-8 字节恢复。

- 2026-11-20 Lead：接受，待复审。6 项阻断与 7 项应修均有判红与断言；e2e 首轮 2 失败后仅复跑失败项；高负载单测超时在较低负载复跑。
