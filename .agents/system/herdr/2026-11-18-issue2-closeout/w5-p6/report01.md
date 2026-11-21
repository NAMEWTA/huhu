# D02 评论 Markdown 与引用

- 共享根：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout`
- pane_id：`w5:p6`
- task：`task01.md`
- 任务文件：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p6/task01.md`
- 报告文件：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p6/report01.md`
- 执行结果：done

## 逐项验收

| 复核编号 | 原分类 | 现状态 | 断言和证据 |
| --- | --- | --- | --- |
| D02 §8.1 正文和回复渲染 | 未实现 | 单元与 Electron 通过 | `packages/editor/src/vendor/open-knowledge/app/src/comments/ThreadCard.tsx:407` 和 `:421` 共用渲染。单测 `CommentMarkdown.dom.test.tsx:10` 核语义节点、引用式链接和鼠标中键。Electron `tests/e2e/knowledge/comments-s4.spec.ts:346` 通过实际 UI 发表后核 `strong`、`blockquote`、列表、代码和链接。 |
| D02 内容安全和外链 | 未实现，用户决定要求补验收 | 单元、Electron 与独立 Chromium 通过 | `CommentMarkdown.dom.test.tsx:37` 核原始 HTML、事件属性、危险 URL 与图片。Electron 用例核脚本标记未出现、无外部请求及无对应 DOM 节点，同时验证允许链接抵达主进程的系统打开入口，preload 直接传入的危险协议也被主进程拒绝。独立 Chromium 核无 preload 时的安全外链回退。 |
| D02 原文与只读重开 | 缺验证 | Electron 通过 | `comments-s4.spec.ts:409` 起核输入原文、回复 Shift+Enter、磁盘消息原文 UTF-8 字节。重开笔记与切到真实只读 Vault 后再次检查渲染，最后逐字节比对评论文件。 |
| D02 vendor 登记与重放 | 交付门禁 | 通过 | `packages/editor/src/vendor/open-knowledge/PATCHES.md` 登记 3 个文件。固定上游重放 1352 个文件，文件集合与字节一致。 |

## 改动

- 工作树 `/home/wta/projects/huhu-wt-w3`，分支 `closeout4/d02`，起点 `2f7d59c`，本地提交 `41d2c71`、`535e332`，工作树干净。
- 查看时复用 OK 已有的 remark 解析与 Markdown 树转换依赖。从解析树生成限定的 React 节点，忽略原始 HTML。Markdown 图片仅显示替代文本。文本输入继续保留 Markdown 源码。回复框改用多行文本框，Enter 提交，Shift+Enter 换行。沿用现有评论持久化。
- 为复用 OK 外链调用，补齐 desktop preload 和 Main、workbench host 类型、editor 评论入口与 Notes 评论面板的接线。主进程独立校验 IPC 来源并只接受 HTTP、HTTPS、mailto 和 tel。浏览器沿用 OK 的 `noopener,noreferrer` 回退。外链回调通过评论内的 React context 传递。文件树继续使用 Huhu 回收站。更新 vendor replay JSON 与压缩补丁。
- Modern Web Guidance 应用了 `security` 的 “create elements programmatically” 和 `sanitize-untrusted-html` 的 “further restrict what is allowed”。渲染器限制节点及属性，无 HTML 字符串注入入口。

## 验证

Linux Electron 44.9.1 / Chromium 152.0.7977.167。原始日志和 trace 位于 `/tmp/huhu-w5p6-checks`。

| 命令 | 结果 |
| --- | --- |
| `pnpm test:vendor CommentMarkdown.dom.test.tsx --maxWorkers=1` | 以原字面显示基线判红，2 项均按预期失败。实现后退出 0，2/2 通过。限定宿主回调范围后加测隔离，最终 3/3 通过。 |
| `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm knip`、`pnpm notices` | 最终退出 0。lint 首轮发现测试代码围栏字符串的多余转义，移除后通过。Typecheck 首轮发现 HAST 返回类型未收窄，明确根节点类型后通过。Knip 有 3 条配置提示。 |
| `RAYON_NUM_THREADS=2 pnpm build` | 退出 0。最终按 `535e332` 构建，两份桌面 CSS 的 A/B/C 均为 0。 |
| `node scripts/ok-patches.mjs --check`，设置 `OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge` 后运行 `--refresh-replay`、`--replay` | 最终均退出 0，1352 个文件重放一致。 |
| `node /tmp/huhu-w5p6-checks/browser-smoke.mjs` | 退出 0。Chromium 158.0.8127.18 验证无 preload 时正常渲染、无外联、键盘激活进入浏览器外链回退。首轮临时驱动的 blockquote 文本断言计入了 HAST 的空白边界，改为核对引文段落后通过。 |
| `VITEST_MAX_FORKS=2 VITEST_MAX_THREADS=2 pnpm test` | 退出 0。CSS 守护 21/21 通过，Vitest 87 个文件、1046 项全部通过。修复回调范围后复跑相关组件单测。 |
| `VITEST_MAX_FORKS=2 VITEST_MAX_THREADS=2 pnpm test:vendor --maxWorkers=2` | 初次命令退出 126，Vitest 6429 通过、4 跳过、1 失败，另有一次 worker 回执超时。失败项是 R13 依赖扫描超过 120 秒。以 `pnpm test:vendor y-prosemirror-patch.test.ts -t "dep-tree invariant" --maxWorkers=1` 单独复验，退出 0，1/1 通过。 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/comments-{s4,persistence,edge-rail}.spec.ts --workers=1 --retries=0` | 首轮命令退出 126，Playwright 10 通过、1 失败。新增 D02 场景通过。`comments-persistence.spec.ts:80` 等待进入回收站失败，起跑负载 3.83 时单独复跑仍失败。诊断记录确认点击后没有发出 `notes.trash`，查到全局 OK 桌面桥使文件树选错分支。修复后仅复跑该失败用例。修复后退出 0，1/1 通过。定向套件的 11 个不同用例各有通过记录。 |
| `xvfb-run -a node /tmp/huhu-w5p6-checks/electron-scoped-link.mjs` | 退出 0。真实 Electron 构建中，用键盘激活评论链接，确认请求经 preload 和主进程交给系统 shell，同时验证打开评论前后全局 OK 桌面桥均未被创建，主进程仍拒绝危险协议。 |

## 待用户决定

无。

## 未完成项

无。

## Lead 验收

- 2026-11-20 Lead：接受，待集成后复验。按用户 D02 决定渲染 Markdown 与引用，内容安全负例与磁盘原文字节均有断言；回收站回归已修复并仅复跑失败用例。
