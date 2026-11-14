# S3 样式归位与分层

规格：[spec.md](../spec.md) §3.1、§5“先归位、后改名”；DSC-06 的一半；Q4、Q5。
交付：`shared.css` 里属于 workbench / 某个插件 / 编辑器的规则迁到所属包，`shared.css` 只剩共享组件与全局基础；`check-css-ownership` 通过。
依赖：S2b（样式已整体在 `components` 层，层已生效，跨文件移动规则不再依赖加载顺序）。
边界：`shared.css`（只删除规则）、`packages/workbench/src/**/*.css`（新增 / 追加）、`plugins/*/src/ui/*.css`、`packages/editor/src/editor.css`、`scripts/check-css-ownership.mjs`。**不改类名、不改规则内容与规则相对顺序。**

## 背景

按 2026-11-14 的统计，`shared.css` 约 721 个类名里：只被 workbench 使用 156 个、notes 47、共享组件（ui）42、ssh 27、tasks 21、inbox 18、agent-cli 17、versioning 12、automations 7、safe 6，多个包共用约 67 个，没有字面量 TSX 使用约 300 个。上一轮不能搬的原因是规则顺序耦合；S2a 之后，层序决定了跨层覆盖，**同一层内的顺序仍然重要**，所以仍要遵守“同层内保持相对顺序”。

## 实施要点

1. 先产出归属表（`ownership.md`，放在本 change 目录）：每个类名 → 归属 / 使用文件 / 判定依据 / 备注。来源是 `check-css-ownership` 的静态分析 + `grep` 子代理对疑义项的核实。三类疑义项单独列出：
   - 没有字面量 TSX 使用（Q4）：判定为动态拼接 / 第三方 / 后代选择器中的状态类 / 疑似死代码；死代码留到 S5c 用 PurgeCSS 处理。
   - 多包使用（Q5）：判定为“共享组件类”（归 ui）还是“碰巧同名”（拆开，留到 S4 改名）。
   - 在后代选择器中跨归属出现：例如 `.knowledge-root .btn`——规则归属于**主体**类的所有者还是被修饰类的所有者，写明规则：以选择器最左的“作用域类”为准，其内部使用共享组件类时不改归属。
2. 目标层：workbench 的 CSS 进 `shell` 层；插件的进 `modules`；`ui` 的留在 `components`。**本切片才第一次启用 `shell` / `modules` 层**：规则一迁出就进入目标层，随之产生的跨归属翻转（例如共享组件里高特异性的规则原本压过插件里低特异性的规则）由 `css-layer-report` 找出并逐条处理（移层 / 降特异性 / 提高被覆盖方特异性），每个归属迁完用 `visual:compare origin` 验证。规则在新文件里按**原有相对顺序**排列，并**放在目标文件的开头**——原来 `shared.css` 整体先于各插件 CSS 加载，放在开头才能保留“共享规则先于插件规则”的次序。覆盖第三方的规则已在 S2a 进白名单。S4 之前，`.row` 这类通用类名仍可能出现在多个插件文件，文件顺序仍有影响，不要假设“顺序无关”。
3. 迁移用脚本完成（postcss 读写，保留注释与媒体查询上下文），不手工剪贴；迁移前后都运行 `css-layer-report`，确认没有新增冲突。
4. 每迁一个归属（例如先 notes，再 tasks……）就跑一次 `visual:compare origin`，差异为 0 才继续；出现差异时在该归属内回滚并定位，不累计。
5. `check-css-ownership` 接入 `pnpm lint`；规则：一个 CSS 文件定义的类若被其他包的 TSX 使用且不是共享组件类，失败；共享组件类必须在 `components` 层。
6. 迁移后更新各插件的 CSS 入口导入（各文件自己声明层，入口导入不变）。

## 验收

- [ ] DSC-02 / DSC-03：每个归属迁移后以及最终，`visual:compare origin` 差异 0。
- [ ] DSC-04：`css-layer-report` 对迁移后的状态没有新增未处理条目。
- [ ] `check-css-ownership` 通过；故意在 `plugins/tasks/src/ui/tasks.css` 复制一条只被 notes 使用的类的规则，检查失败。
- [ ] `shared.css` 不再包含任何只被单一非 ui 归属使用的类的规则（归属表为证）；其行数与 S2b 末相比的变化记入 progress.md。
- [ ] 归属表中 Q4、Q5 的疑义项全部有判定，未判定项为 0（“疑似死代码”可以留给 S5，但必须标注）。
- [ ] 全量 e2e 通过。

## 完成证据

progress.md 追加：归属表摘要（各归属规则数迁移前后）、每次 `visual:compare` 输出、`check-css-ownership` 输出与故意失败的输出、`audit` 结果与快照 SHA。
