# task01.md #6 用户动作开放清单：逐项分类 140 个 exposable:false 能力（只读分析）

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t19`
- 身份核对 — 本机 Linux 默认 Core，worker 内 `HC_TERMINAL_ID` 应为 `t19`。
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t19/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t19/report01.md`
- Lead 回告方式 — Lead 在 Core 外部，主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-snapshots/5021f54c`（集成 `5021f54c` 的 `git archive` 只读快照，不是 git 仓库；无 node_modules）
- 接续依据 — 盘点 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t7/report01.md` 的 #6 部分（G5a.x、G5b.3、G3.4、G8.1、原文 A01/A04/D08/F01 未满足）；审查 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t11/report01.md` 中 Mail AI 外部开放（P2）与 HTTP MCP 会话身份（P1）。

## 目标与输入

#6 规格要求：用户在一处选择哪些操作向外部开放；干净安装全部关闭（defaultExposed=false），但**用户动作不应被永久关闭**。快照里有 140 处 `exposable: false`（`grep -rn "exposable: false" --include=*.ts packages plugins apps | grep -v test`）。逐项分类，给实现者一份可直接执行的清单。

分类依据：`.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/spec.md`（「目录、身份与调用」「各业务归属与端到端样例」两表）、`design.md`、`source.md` §12（A01–F03），以及各成员规格中「须入目录的用户操作」。合法保持关闭的只有：宿主专属（窗口管理、系统文件对话框、原生选择器、剪贴板等只能由实际宿主呈现的动作）、只由所有者产生的内部信号（心跳、可信运行回执、ACK）、桌面专属的秘密编辑（规格明确仅桌面的项，如 Mail AI Key 编辑、Safe 主密码）、以及纯内部实现细节（不是用户动作）。其余用户动作都应可选开放。

对每一项给出：
1. 能力 ID、文件:行、所属插件、scope/risk（按真实副作用核对，不照抄现值）。
2. 分类：「改为可开放（默认关）」「保持关闭：宿主专属/内部信号/桌面秘密编辑/非用户动作」，附规格依据（文件+段落）。
3. 若改为可开放：handler 里是否有 `isWorkbenchCaller`、`caller === "desktop"` 等硬限定需要改成按授权判定；是否需要 durable 意图（#6 C05、G3.3：创建/派遣/启动/管理类重复意图不得重复执行）；外部调用时需要的额外检查（对象归属、Vault、版本）。
4. 建议的测试：经 CLI 与 HTTP MCP（独立令牌）各一次，默认关闭被拒、开放后成功、撤销后旧缓存调用被拒；只读项无副作用。
5. 按插件/写入范围分组（每组可交给一个实现者，不与其他组写同一文件），并标出触及 Lead 独占文件的项（`apps/engine/src/boot.ts` 的静态目录 `declareDescriptors`、插件注册、Vault 包收集器）。

另外单列两个跨切面问题的现状与建议接口（不实现）：
- HTTP MCP 无独立会话身份（`packages/kernel/src/server/http-app.ts:110,139,154`）：同令牌两个客户端被视为同一主体。给出服务端可验证、可重连的会话身份方案，以及 SSH 作业/信任待答如何绑定。
- G3.4 扩展命令：`plugins.commands.run` 为 admin 且 `exposable:false`、回调未传 caller（`packages/kernel/src/capabilities/external-plugins.ts`）。给出逐命令映射与 caller 传递方案。

## 读写范围与产物

- 可读范围 — 快照、`/home/wta/projects/huhu` 仓库（只读 git）。
- 可写业务范围 — 无。只写报告和同目录临时稿。
- 禁止改动 — 一切业务文件；不联网；不启动子 agent。
- 预期产物 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t19/report01.md`；清单用表格，按「实现分组」排列，便于直接切成任务。

## 验收与验证

Lead 会抽查文件:行与规格依据。区分事实与推断，不确定的标「待定」并说明需要谁决定。

## worker 执行约定

1. 读 topic 和 manifest，核对共享根、地址 `t19` 与任务文件名；manifest 当前行须为 `t19	task01.md	active`。
2. 先查报告路径；已有身份匹配的终稿则仅打印路径。
3. 只写自己的报告和同目录临时稿；`report01.md.tmp` → `ln` 发布 → 删除临时稿。
4. 发布后在终端打印报告绝对路径并停下。
