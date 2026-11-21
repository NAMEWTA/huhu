# task08 · 本地模板：目录继承范围与外部能力范围

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-layout`，分支 `closeout/issue2-layout`。
开始前 `git merge --ff-only closeout/issue2-integration`（应快进到 ca28e78），在其上提交。

来源：独立审查 `w4:pE/report03.md`「应修」1、2（请先读原文及其链接）。

## 1 · 树菜单把同级目录模板误列为继承
现象：建同级 `甲/`、`乙/`，在甲导入笔记模板，从乙的树菜单新建，`/api/folder-config`（`packages/editor/src/host/routes/files.ts:158` 附近）把甲的模板标为 `inherited`。
要求：按固定 OK `temp/sources/open-knowledge/packages/server/src/content/templates-resolver.ts` 的口径——当前目录（local）、祖先目录与根（inherited）逐级收集，同名最近优先；同级与其他分支的模板不出现。新建对话框的全库选择器可保留现状（请在报告写明实际行为）。补单测（路由/解析层）和 e2e 断言（乙不显示甲的模板，甲子目录显示为 inherited）。

## 2 · `notes.create` 的 `templatePath` 拓宽外部能力
现象：`notes.create` 可向外部（CLI / MCP 网关）开放，新增的 `templatePath` 让只持创建授权的外部调用方读取 Vault 内模板正文。
要求：`templatePath` 只接受桌面渲染进程（宿主内部）调用方；外部调用方传入时拒绝（PERMISSION_DENIED 或现有更合适的码），外部原有内置模板 ID 行为不变。参照 `apps/engine/test/engine.test.ts:1104–1112` 的 gateway/cliToken 写法补断言：只有 create 授权的 CLI 调用方传 `templatePath` 被拒且未创建文件；渲染进程照常成功。

## 验证与范围
- 受影响单测、`pnpm typecheck`、`pnpm lint`、`pnpm knip`；`xvfb-run -a pnpm exec playwright test tests/e2e/knowledge/editor-parity-assets-template.spec.ts --retries=0` 及新增用例。不要跑全量 e2e，Lead 需要低负载窗口做 G07 测量；跑 e2e 前后各记一次 `uptime`。
- 写入范围：`packages/editor/src/host/routes/files.ts`（及同目录模板解析辅助）、`plugins/notes/src/engine/index.ts` / `service.ts` 中 notes.create 与模板相关处、对应单测、`tests/e2e/knowledge/editor-parity-assets-template.spec.ts`。其他文件需要改动时先在报告说明。
- 前端改动按 AGENTS.md 先走 zh-modern-web-guidance（如只改路由与引擎可注明不涉及）。

## 回报
`report08.md`：提交 SHA、改动、命令与结果（如实记录失败/重跑），并把 manifest 中 w4:pB 改为 done。
