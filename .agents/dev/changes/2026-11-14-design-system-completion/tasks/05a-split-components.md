# S5a 按组件拆分

规格：[spec.md](../spec.md) §3.1；DSC-06。
交付：`packages/ui/src/styles/components/<name>.css`，一个共享组件一个文件；`shared.css` 不再存在；只移动规则，不改内容。
依赖：S4（类名已统一，才能按组件切分）。
边界：`packages/ui/src/styles/`（`shared.css` 删除、`components/` 新增、`index.css` 导入）；`check-css-ownership` 的对照表。**不合并规则、不去重、不删规则、不改类名**（分别是 S5b、S5c、S4）。

## 实施要点

1. 按 `packages/ui/src/components/` 的组件拆：每个文件内规则保持原相对顺序；全局基础规则回到 `base.css`；若存在无法归入单一组件的小工具类，放 `components/utilities.css` 并在归属表登记。
2. 迁移用脚本（postcss）完成，不手工剪贴；同层内文件的导入顺序由 `index.css` 固定，且必须与拆分前 `shared.css` 内的相对顺序一致（脚本按原顺序输出导入）。
3. 生成并提交“组件文件 ↔ 组件”的对照表，供 `check-css-ownership` 使用。

## 验收

- [ ] DSC-06：`git ls-files packages/ui/src/styles` 只有 `index.css`、`base.css`、`tokens.css`、`vendor-overrides.css`、`*.generated.css` 与 `components/*.css`；`check-css-ownership` 通过。
- [ ] DSC-02 / DSC-03：`visual:compare origin` 差异 0。
- [ ] 拆分前后规则总数与规则相对顺序一致（脚本比对，输出“0 条增减、0 处顺序变化”）。
- [ ] 全量 e2e 通过。

## 完成证据

progress.md 追加：脚本输出的规则数 / 顺序校验、对照表、比对输出、`audit` 结果与快照 SHA。
