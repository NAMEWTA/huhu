# Issue #2 关闭收尾（知识库编辑器移植 OK）

## 目标与验收

- 目标：把 https://github.com/NAMEWTA/huhu/issues/2 推进到有可复查证据支持关闭的程度；只补 Issue #2 范围内的实际缺口。
- 验收：Issue §14 A01–F10、spec §5.2 G01–G07 / H01–H07 在交付候选版本上逐项有证据；没有未解决阻断。台账：/home/wta/projects/huhu/.agents/dev/changes/2026-11-18-issue2-closeout/acceptance.md（Lead 维护）。
- 约束：规格权威 = 归档 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md（§3 > issue 评论 > issue 正文），Q1–Q10 按 decisions.md OP-D19 已定；Windows/macOS 实机与真实输入法按 Q7 不作为关闭条件但如实登记；不推送、不合并（Lead 负责）。

## 共享位置与负责人

- Lead pane：w4:p1（Claude Code 主会话，cwd /home/wta/projects/huhu，分支 main）
- Herdr 服务端连接：本地继承连接（herdr 0.9.5，无 --machine）
- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane 目录规则：原样 pane_id（Linux 下冒号合法）
- 共享可达性：所有 worker 在同机，绝对路径可读写。

## 必要结论与交接

- worktree：w4:pA → /home/wta/projects/huhu-wt-parity（分支 closeout/issue2-parity）；w4:pB → /home/wta/projects/huhu-wt-layout（分支 closeout/issue2-layout）。均从 main 9f870c0 创建，已 pnpm install。；w4:pC → /home/wta/projects/huhu-wt-session（分支 closeout/issue2-session）
- 上游来源（gitignored，只在主工作树）：/home/wta/projects/huhu/temp/sources/open-knowledge、/home/wta/projects/huhu/temp/sources/orca。
- 集成分支：closeout/issue2-integration（worktree /home/wta/projects/huhu-wt-int）。03dc93b = main + layout + session + parity。独立审查（w4:pE/report01.md）结论是暂缓关闭；修复分配给 pA/task05（待 task04 完成后发布）、pB/task03、pC/task03，三者都先合入集成分支再开工。
- 疑难分析 w4:pD/report01.md：C06 与 H05 同源（自适应桥推迟结算），已由 pC/task02 修复。
- 集成 03dc93b 的完整 e2e（Lead，2026-11-18 20:20 起，开始时负载 0.53，后来 worker 开始工作，负载上升）：197 通过 / 5 失败 / 4 跳过。失败：parity 两项、explorer-keyboard A06（审查已知，已分派）；perf 5000 行 p95 32.2 ms（全套件内运行，不作严格结论）；comments-persistence D01/D06 第 56 行重开后 openComments 超时（合并 layout 的详情栏改动后新出现）→ 待派给 pC 的 task04。日志：/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int/e2e-full-1.log
- 2026-11-19 Lead 授权 w4:pB/task05 把 packages/editor/src/host/offline-emoji.ts 纳入写入范围（表情选择器 99 个英文分类和名称接入离线中文词库，H03）。
- 2026-11-19 Lead 授权 w4:pB/task05 修改 tests/e2e/knowledge/editor-parity-shell-mounts.spec.ts，改为按中文名称定位（保留英文搜索词）。
- 2026-11-19 Lead 不授权 w4:pB 修改归档 tests-manifest.json；要求沿用 w4:pA 的做法，在 PATCHES.md 登记，必要时改脚本或仓库内清单。
- 2026-11-19 新增实现会话 w4:pF impl-pm（gpt-6.2-sol medium），worktree /home/wta/projects/huhu-wt-pm，分支 closeout/issue2-pm：ProseMirror 聚焦回调选区回写（B06）。
- 2026-11-19 Lead 决定：焦点在富文本编辑器内时 Mod+K 打开链接编辑（与 OK 一致），编辑器外仍是命令面板（参照 Mod+T 的先例）；这是可撤回的产品决定，会在最终汇报中单独说明。
- 2026-11-19 Lead 授权 w4:pB/task07 在 plugins/notes/src/ui/NotesModule.tsx 增加“打开批注”的订阅（边缘按钮需要打开详情栏并切到对应线程）；限于这一用途，不改会话逻辑。
- 2026-11-19 Lead 授权 w4:pB/task07 在根 knip.json 登记 tests/parity-ok 的两个入口（不改变默认 E2E 的发现范围）。
