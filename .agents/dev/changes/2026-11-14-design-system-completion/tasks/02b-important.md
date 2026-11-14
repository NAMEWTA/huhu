# S2b 去除 `!important`

规格：[spec.md](../spec.md) §3.2（`!important` 两类例外）、DC-D5；DSC-05。
交付：项目 CSS 中不带说明的 `!important` 为 0；保留的只属于“减少动效”“覆盖第三方内联样式”两类，并有描述性 disable 注释；渲染不变。
依赖：S2a（样式已在层里，才能判断每个 `!important` 在新层序下是否还有必要）。
边界：含 `!important` 的 CSS 文件（shared 62 处、base 4 处、`agent-cli.css` 2、`versioning.css` 2、`notes.css` / `ssh.css` / `tasks.css` 各 1，观察于 2026-11-14，以 S1 清单为准）；`.stylelintrc.json`。**不改类名，不移动规则文件。**

## 实施要点

1. 按 S1 的 `!important` 清单逐条处理：优先“移到应在的层 → 降特异性 → 提高被覆盖方特异性”；仍不行的归入两类例外。覆盖运行时注入样式的需求已由白名单解决，不再用 `!important`。
2. 保留项写成 `/* stylelint-disable-next-line declaration-no-important -- <原因> */`；打开 `declaration-no-important` 与 `reportDescriptionlessDisables`。
3. 每处改动后即比对；一批（按文件）通过再继续，避免一次改 73 处无法归因。

## 验收

- [ ] DSC-05：项目 CSS 无不带说明的 `!important`；`pnpm lint` 在故意新增 `!important` 时失败。
- [ ] 保留项逐条列入 progress.md（文件:行、类别、原因），类别只有两类。
- [ ] DSC-02 / DSC-03：`visual:compare origin` 差异 0（含减少动效组合）。
- [ ] 全量 e2e 通过。

## 完成证据

progress.md 追加：处理表（去掉 / 降特异性 / 改层 / 保留）、每批比对输出、`audit` 结果与快照 SHA。
