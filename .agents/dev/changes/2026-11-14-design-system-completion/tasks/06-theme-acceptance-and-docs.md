# S6 主题验收与收尾

规格：[spec.md](../spec.md) DSC-13～DSC-16；上游 DS-02、DS-06、DS-07、DS-12～DS-15。
交付：四套主题 × 明暗 × 8 个界面共 64 组截图已逐张核对；上游验收项有本 change 之后的运行证据；文档与上游 change 的状态更新完毕。
依赖：S5c。
边界：`evidence/`（新增，截图与核对表）、`.agents/dev/notes/context/design-system.md`、`.agents/dev/notes/context/workbench.md`（D-18 标注）、上游 `2026-11-13-brand-and-windows-installer/{progress.md,plan.md}` 的状态说明。**不改代码**；发现问题回到对应切片修。

## 实施要点

1. `origin` 基线在 S0 已覆盖四套主题，因此 S6 的比对是“重构后 vs 重构前”的真实对照，Apple 与 Notion 不再缺参照；对四套主题 × 明暗运行 `visual:compare origin` 并记录。
2. DSC-13：8 个界面（首页、笔记编辑器、任务看板、Agent CLI 终端、设置页、启动页、一个对话框、一个下拉菜单）× 4 主题 × 明暗；逐张对照上游 design-system.md §6 的“标志特征”（Claude 衬线标题与珊瑚按钮；Apple 胶囊主按钮与毛玻璃顶栏；Notion 紫色主按钮与彩色标签；Vercel 墨黑主按钮与等宽小标签）。核对表放 `evidence/theme-checklist.md`，每格 ✓ / ✗ + 备注，截图缩略图放 `evidence/`。
3. DSC-14：依次运行并记录——切换系统深浅色看实时切换（DS-06）；Vercel 深色下重启无白闪、清 localStorage 后首帧为 Claude 深色（DS-07，可用启动阶段截图序列）；终端换主题且浅色下 `printf '\e[37mwhite\e[0m'` 可读（DS-12）；compact 密度（DS-13）；减少动效（DS-14）。无法在本机自动化的步骤，列出手工步骤与结果。
4. 对 DS-13（compact）与 DS-14（减少动效）额外运行 `visual:compare origin` 的对应组合。
5. DSC-15：`audit` 跑 `pnpm lint`、`pnpm typecheck`、单元测试、全量 e2e（含 `a11y`、`perf`）；对比 S0 记录的 CSS 总字节数与 perf 指标。
6. DSC-16：把 `.agents/dev/notes/context/design-system.md` 的“未完成”一节替换为最终规范（层序、前缀表、归属规则、验证命令、不分层白名单（`vendor-overrides.css`、`editor.css` 的 `.cm-*` 部分）、`!important` 两类例外）；`workbench.md` 的 D-18 标记被取代；上游 `progress.md`“未做”一节改为“已转入 2026-11-14-design-system-completion 并完成”，上游 `plan.md` 的完成边界句同步；本 change 的 `README.md` 状态更新。
7. 顾问复核（CLAUDE.md）：传入 audit 结论原文、改动文件清单与快照 SHA。
8. 交付报告：写明“本地完成，未提交”，列出仍未验证的内容（非 Linux 渲染、真实用户长期使用）。

## 验收

- [ ] DSC-13：64 组截图的核对表无 ✗；若有 ✗，回到对应切片修复后重新取证。
- [ ] DSC-14：DS-06、07、12、13、14 各有一条运行证据（输出或截图序列），手工步骤有记录人与时间。
- [ ] DSC-15：`audit` 报告 lint、typecheck、单元测试、全量 e2e 全部通过；CSS 总字节数不大于 S0 的 +5%（预期显著减小）；perf 指标不劣于 S0 记录。
- [ ] DSC-16：`git grep -nE 'pearl|suliworld|data-compact|--v9-|iA Writer' -- ':!.agents/' ':!packages/ui/test/'` 为 0；`design-system.md` 不再含“未完成”一节；上游 change 与本 change 的状态说明一致。
- [ ] 顾问复核结论已记录；所有“已批准差异”与例外清单在 progress.md 有明细。

## 完成证据

`evidence/` 目录（截图、核对表）、progress.md 的最终汇总（每个 DSC 编号对应命令 / 输出 / 位置）、audit 与顾问的结论原文。实际结果由执行者记录，不预填。
