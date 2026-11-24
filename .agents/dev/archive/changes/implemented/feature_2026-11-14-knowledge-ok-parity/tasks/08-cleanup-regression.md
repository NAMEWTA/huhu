# 08 清理、文档与全回归（S8）

[验收报告](../evidences/08-cleanup-regression.md)

规格：G01–G07、H01–H07、全部 A–F、spec §1 的完整用户路径；设计：[design.md](../design.md) §14；[verification.md](../verification.md)。
交付：旧链路按清单删除并有零引用证据；来源台账、第三方声明、说明文档、demo Vault、能力说明与受影响测试全部更新；全部门禁与真实 Electron 对照执行并记录；用户可以连续完成 spec §1 的路径。
依赖：S2b–S7 全部。
边界：整合者 = 主会话（或指定的单一负责人）；本切片只做清理 / 文档 / 回归与发现问题的回修（回修回到对应切片的规则：契约改动回计划修订）。

## 实施要点

8.1 **删除清单核对**（design §14 的 8 类）：每条给出 `git grep` / `knip` 的零引用证据与删除提交；`@huhu/editor` 旧导出、`marked` / DOMPurify 等无消费者依赖。
8.2 **文档**：`docs/upstream/ledger.md` 补全文件级清单；`pnpm notices` 重新生成；更新 `.agents/dev/notes/context/{design-system,workbench}.md`（Tailwind 作用域与 `ok-*` 层、编辑器架构、会话 / 标签模型、资源目录）、`product.md` 非目标、`notes/index.md`；新增 `notes/decisions/…-knowledge-editor-ok.md`（OP-D01 取代 D-08）；更新 demo Vault 与能力说明（`vault.list` / `vault.readRange`、`notes.files` 删除）。
8.3 **贯穿路径 e2e**：`tests/e2e/knowledge/journey.spec.ts`——打开全部真实文件 → 隐藏目录仍能 `@` → 富文本编辑 + `/` + 属性 + 评论 → 保存重开 → JSON / TXT 编辑、PDF / HTML 查看 → 档案标签与侧栏切换 → 回到文件继续编辑。
8.4 **全门禁**：`pnpm format:check / lint / typecheck / test / test:vendor / build / e2e / e2e:packaged / knip / notices`；`pnpm bench` 与专项性能（F09）；`pnpm visual:compare rc4`（非知识库屏幕 0 差异）；CI 三平台。
8.5 **证据与未验证清单**：在 `progress.md` 汇总每项验收的证据入口与“未验证”项（真机 IME、Windows / macOS 实机等），不写“已通过”于没有证据的项。
8.6 **Q2 / Q3 / Q7 结论**落地到文档与代码（关闭的功能入口、默认值、配置项）。

## 验收

- [ ] G01–G07、H01–H07 全部有证据入口；G05 的零引用证据完整。
- [ ] A–F 全部 47 项（含 §5.1 修订）有证据；未通过 / 未验证项在 `progress.md` 逐条列出原因。
- [ ] 贯穿路径 e2e 通过；`e2e:packaged` 通过（或如实登记失败项与原因）。
- [ ] `pnpm` 门禁全绿；性能对 rc.4 基线无回退（或回退项有说明和用户确认）。
- [ ] `check-css-*`、`check-ok-class-collisions`、`knip`、`pnpm notices` 无新增例外（有例外则逐条登记原因）。
- [ ] 用户确认 Q2 / Q3 / Q7 后，完成报告才可写“复刻完成”。

## 完成证据

`evidence/s8/` 汇总、`progress.md` 终态、CI 运行链接；`dev-archive` 的收尾记录（另行执行）。
