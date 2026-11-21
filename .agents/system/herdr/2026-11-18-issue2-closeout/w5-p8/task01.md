# 集成合并 + G04/H04 剩余项

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-w5`，分支 `closeout4/wp5`（HEAD c238bf2）。通用要求 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`。测试纪律：全部改完再统一跑一次定向 e2e，只重跑失败项；不跑全量、不测性能。

## 1. 先合并集成分支（优先，完成后立刻在 manifest 外另写标记）
在本工作树执行 `git merge --no-ff closeout4/final`（d4cbf3a，含 WP1 会话/释放、WP2 属性、WP3 评论、WP4 文件树、D02、收件）。冲突集中在：
- `packages/editor/src/rich/RichMarkdownEditor.tsx`：同时保留 WP2 的 ReadonlyPropertyPanel/只读属性展示与离线表情注册、WP1 的 `retainSession`/`park` 租约与 `isComposing`、本分支的 `markdownFileBody` BOM/行尾信封、`documentHistory` 单一撤销历史（canUndo/canRedo 用 documentHistory，同时保留 isComposing）。注意 `showProperties`：WP2 要求阅读模式显示只读属性，不能用本分支「只读/阅读时隐藏」的写法覆盖。
- `packages/editor/test/golden-roundtrip.test.ts`：两边测试都保留（H06 销毁、H01 字节、OP-D03 门禁、本分支 BOM 与等价谓词），provider 构造类型合并 `document?` 参数。
- `plugins/notes/src/ui/documents/NoteEditorSurface.tsx`：保留只读同步与评论选区来源注册，以及外链预览配置。
- `vitest.config.ts`、e2e spec、PATCHES.md：两边并存。vendor-replay.* 不手改，用 `OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge node scripts/ok-patches.mjs --refresh-replay` 生成。
合并后 `pnpm install --frozen-lockfile --prefer-offline`、typecheck、lint、build、test、test:vendor 全部退出 0，提交 merge，然后写文件 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p8/merged.txt`（内容为合并提交 SHA）。

## 2. G04（用户已决定，见 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/user-decisions.md`）
- 适用分母 = 被测生产模块在 Huhu 交付闭包内。逐个核对 112 个归属待定文件，核完后 OK 适用通过率仍须 ≥70%；不足则继续适配接入。
- ORCA 单独 ≥70%：当前 4/11，再适配至少 4 个或逐个说明不适用的具体理由。
- 更新 `evidence/vendor-test-results.md`，两种口径数字都保留。
## 3. H04
- 批注列表 GET 失败：当前被消费端吸收，用户无法区分空列表与加载失败。补可见错误状态（含重试），单测 + Electron 断言。
- 桌面平台成员差异、Clipboard API 回退的错误反馈补独立测试。端点矩阵更新覆盖边界。

前一会话报告：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p7/report01.md`。回报 report01.md，manifest 中 w5:p8 改为 task01.md done。
