# task02 执行回报

任务身份为 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout`、`w5:p5`、`task02.md`。工作树 `/home/wta/projects/huhu-wt-w5`，分支 `closeout4/wp5`。接续 `e14b462`。本轮提交为 `eb7c594`，工作树干净，未推送。各项交付与缺口如下，整包标为 `blocked`。

| 编号 | 原分类 | 本轮状态与证据 |
| --- | --- | --- |
| H01 BOM＋CRLF | 已知规格不符 | `packages/editor/src/host/markdown-file-envelope.ts:12` 与 `packages/editor/src/rich/RichMarkdownEditor.tsx` 将 BOM 和统一行尾留在宿主，向 OK 提供 Markdown 文本。带 BOM 样本由上一轮的生产等价失败改为字节一致，全量 122 个黄金样本按原等价规则验收。Electron 验收在 `tests/e2e/knowledge/editor-s3-properties.spec.ts:121` 通过，真实编辑后文件逐字节保留 BOM、CRLF 及无末尾换行。 |
| OP-D08 HTML 外链 | 未实现 | `apps/desktop/src/main/external-link.ts` 和 `apps/desktop/src/main/index.ts` 提供主框架受信任的 `window.huhuHost.openExternal`，限制 HTTP(S)、拒绝 URL 凭据、显示实际目标、默认取消。预览通过原生链接上下文菜单进入同一确认，只有确认且授权仍有效时调用系统浏览器。`tests/e2e/workflows/viewers.spec.ts:597` 用真实右键命中链接，替换 OS 调用和原生确认的测试边界，验证取消和确认两条分支。普通左键仍由 iframe 导航守卫拒绝。 |
| OP-D09 PDF | 未实现 | 从固定 ORCA 适配 `plugins/notes/src/vendor/orca/pdf/use-pdf-viewer-find-shortcut.ts`，用 Huhu 同一个编辑器 Find 键位调度当前分栏，保留按钮。 `tests/e2e/workflows/viewers.spec.ts:551` 通过查找、焦点、切换 Markdown、不被旧 PDF 抢键、重开与查找新文件内容。来源、补丁与 ORCA 13 文件零差异重放见归档。 |
| H04 资源与桌面调用 | 两个缺口 | 图标和封面各改为按段编码的 Vault 媒体路径，复用已有桌面媒体协议。`tests/e2e/knowledge/editor-s3-properties.spec.ts:142` 验证两个实际图片均解码成功。打包扫描 `--assert` 通过，43 个签名，缺口 0。桌面外链桥见 OP-D08。 |
| H04 handler 成功、失败、UI | 缺验证 | `packages/editor/test/{host-files,core-routes,comment-routes,upload-routes}.test.ts` 增补或复用真实接线的状态码、响应值和错误文案测试。标签弹层有渲染级反馈断言，外链、图标和封面有 Electron 断言。文件写入等多个消费端仍只验证错误格式或消息，尚缺各入口用户可见反馈。 |
| G04 固定测试分类与 70% | 缺验证 | 已逐文件写入分类，按固定 Git blob 的同名或导入模块注明适配依据。29 个可原样运行的 OK 测试文件独立接入，ORCA 缩放换算测试接到已移植模块。保守分母为 OK 1,315 文件，358 通过，27.22%，达到 70% 尚差 563 文件。ORCA 11 文件，4 通过，36.36%，尚差 4。部分替代证据保留在分母，待适配条目仍需审查独立断言。见归档 `evidence/vendor-test-catalog.json` 与 `vendor-test-files.jsonl.gz`。 |
| B01 旧矩阵链接 | 缺验证 | `evidence/parity/parity-82.md` 为可确指的旧记录补源码行链接，共核对 128 条链接路径和行号，旧矩阵将列表合并／Slash 的构造样本引用更新为具体动作断言。其他旧勾选仍有未能逐能力确认的记录，如列表项拖拽与编辑辅助只链接到构造样本。 |
| B03 菜单右缘 | 缺验证 | `tests/e2e/knowledge/editor-s3-menus.spec.ts:157` 以光标实际坐标和浮层右边界验证，真实 Electron 复跑通过。 |
| B04 撤销与粘贴之后的 IME | 缺验证 | `tests/e2e/knowledge/editor-s3-menus.spec.ts` 通过一次撤销 H2 后启动 CDP 组合，测未提交文本、焦点与汉字落盘，再做系统剪贴板粘贴并重复组合验证。 |
| B07 键盘进入代码块及退格合并 | 缺验证 | `tests/e2e/knowledge/editor-s3-parity.spec.ts:391` 通过 Home＋Backspace 合并两个有内容的列表项，验证列表结构与落盘。实际 ArrowUp 进入代码块，再用键盘离开并在正文写入。 |
| F05 scheme | Lead 明确保留 | `standard`、`secure`、`corsEnabled` 三位保留，待 Lead 提交用户决定。 |

## 已知限制与 Lead 待办

- OP-D08 的普通左键外链转交仍欠。Electron 的 `will-frame-navigate` 对链接点击和脚本跳转报告同一种事件，公开事件没有用户激活标志。本轮选用浏览器命中链接后显示原生菜单，由用户再确认。脚本导航和新窗口继续拒绝。[Electron WebContents 导航和上下文菜单](https://www.electronjs.org/docs/latest/api/web-contents/)
- OP-D08 的 (b) 候选对跑和 F05 三个 scheme 标志按裁定留给 Lead。PDF 的工具栏与查找栏沿用 Huhu 外壳，本轮只引入其 Find 键盘所有权路由。
- H04 所有已打包签名有归属。真实 UI 错误反馈仍需逐 handler 补证。G04 仍未达到阈值。B01 主矩阵仍有待补的具体断言链接。

## 验证

- 有其他 Electron／Playwright 进程时等待退出，启动前重新执行 `pgrep -af 'electron|playwright'`。首次运行 `xvfb-run -a node_modules/.bin/playwright test tests/e2e/knowledge/{editor-s3-properties,editor-s3-menus,editor-s3-parity}.spec.ts tests/e2e/workflows/viewers.spec.ts --grep 'H01 BOM|H04 页面|OP-D08 原生|OP-D09 PDF|B03 斜杠|B04 Electron|B07 键盘' --workers=1 --retries=0`。5 通过、2 失败，退出 126（命令包装器）。H01 首轮已读出正确属性值，旧选择器命中 7 个元素。B03 首轮未实际把光标放在右边缘。修正测试夹具并只跑两条失败项。两条复跑均通过，退出 0。日志 `/tmp/huhu-w5-task02-e2e.log`、`/tmp/huhu-w5-task02-e2e-retry.log`。未运行全量 Electron 或性能测试。
- `pnpm --config.verify-deps-before-run=false test:vendor --maxWorkers=2` 退出 0，361 文件、6,959 通过、4 跳过。首次尝试从固定上游直接接入 37 文件，其中 8 文件失败，原因含环境／解析别名和宿主语义差异，保留为待适配。最终保留 29 个原样测试文件，加 1 个图标和封面测试文件。日志 `/tmp/huhu-w5-task02-{copied,vendor}.log`。ORCA 独立运行四个摘取测试并输出 Vitest JSON，退出 0。
- `node_modules/.bin/vitest run --maxWorkers=2` 定向跑 H01、各 handler、外部链接、预览会话及 ORCA PDF，共 13 文件，205 通过（`/tmp/huhu-w5-task02-unit.log`）。H01 单样本红绿日志为 `/tmp/huhu-w5-task02-bom.log` 和 `/tmp/huhu-w5-task02-bom2.log`。首轮已还原 YAML 结构，仍多一个尾换行，保留文件末尾状态后通过。
- `pnpm --config.verify-deps-before-run=false --workspace-concurrency=2 -r typecheck` 退出 0。初次类型检查发现公共子路径需独立类型声明，修正后全工作区通过。 `format:check`、`lint`、`knip`、`notices` 各退出 0。
- `pnpm --config.verify-deps-before-run=false build` 退出 0，随构建的 `check:ok-css` A/B/C=0。最终桌面产物的 `node packages/editor/build/check-host-endpoints.mjs --assert` 退出 0，43 个签名、0 待处理（`/tmp/huhu-w5-task02-endpoints2.log`）。
- 指定两个固定 Git 源后，`node scripts/ok-patches.mjs` 的 `--refresh-replay`、`--refresh-replay --orca`、`--refresh-catalog`、`--check`、`--replay`、`--replay --orca`、`--check-catalog` 全部通过，重放 OK 1,384 文件、ORCA 13 文件，集合及字节零差异。根清单和 PATCHES 均有登记，未登记与多余登记为 0。日志 `/tmp/huhu-w5-task02-replay{2,3}.log`。
- 根 `pnpm --config.verify-deps-before-run=false test --maxWorkers=1` 的碰撞检查单元测试 23 项通过。Vitest 初跑 92 文件通过、1 文件失败、1 跳过，1,048 测试通过、1 失败、1 跳过，包装器退出 126。失败为既有 SSH 测试 `plugins/ssh/test/manager.test.ts:170`，随机生成的宿主 ID 恰含断言检查的口令子串，断言对完整 JSON 搜索命中该 ID。原文件用 `node_modules/.bin/vitest run --maxWorkers=1 plugins/ssh/test/manager.test.ts` 复跑，16 项通过、退出 0。日志 `/tmp/huhu-w5-task02-root.log`、`/tmp/huhu-w5-task02-root-retry.log`。

### Modern Web Guidance

- `ime-safe-enter-submit` 里的 “`event.isComposing || event.keyCode === 229`” 用于 PDF Find 键位和 Enter，避免组合键确认时提交查找。
- `validate-origins` 的 URL 解析规则用于桌面外链入口，解析后的协议和凭据参与校验。

- 2026-11-20 Lead：接受 H01/OP-D08/OP-D09/H04 签名/B03/B04/B07。F05、OP-D08(b) 已由用户决定（保留三位；以 (a) 为准）。OP-D08 左键限制登记：Electron 公开导航事件无用户激活标志，改用命中链接后原生菜单确认。G04 未达 70%、H04 UI 反馈、B01 剩余链接转 task03（新会话，本会话上下文 74%）。
