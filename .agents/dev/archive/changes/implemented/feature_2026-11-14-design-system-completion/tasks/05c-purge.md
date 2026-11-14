# S5c 无用样式核查（PurgeCSS 与覆盖率）

规格：[spec.md](../spec.md) DSC-11、DSC-12；上游 DS-11。
交付：PurgeCSS 的 rejected 报告逐条核查完毕：没用的删除，动态类名与状态类写进登记表并注明出处。
依赖：S5b（先去重，报告才不会被重复规则淹没）。
边界：`packages/ui/src/styles/**`、各插件 / workbench / editor 的 CSS（仅删除规则）；`scripts/css-dynamic-classes.json`；`pnpm css:purge` 脚本；根 `package.json` 新增 `purgecss`（MIT，未安装；版本取发布满两周以上的稳定版并锁定）。

## 实施要点

1. 对构建产物运行 PurgeCSS，content = 全部 `.ts` / `.tsx` / `.html`（含编辑器 Decoration 的 `class:`、JS 拼出的 HTML 字符串）与 `css-dynamic-classes.json`；safelist 起步为空，仅第三方类（`cm-`、`xterm`、`katex`、`mermaid`、`[data-sonner-*]`）放行。
2. rejected 逐条判定：
   - 确实没用 → 删除；
   - 动态拼接 → 补登记，写出处（文件与行）；
   - 只在某状态下使用（悬停 / 焦点等）→ **保留，并进入 safelist 或登记表，注明原因**（所以“复跑后 rejected 为空”的前提是这些项已登记）。
3. 覆盖率：对 `screens.ts` 全部屏幕收集 Chromium CSS 覆盖率；PurgeCSS 判有用而覆盖率为 0 的规则抽查，结论写进 progress.md（线索，不是删除依据）。
4. 每删一批规则即比对，差异 0 才继续；删除前后的规则数与字节数记录。

## 验收

- [ ] DSC-11：rejected 报告逐条有判定；复跑后 rejected 为空（登记项除外），safelist 与登记表的每一项有出处。
- [ ] DSC-12：覆盖率交叉结论已记录，抽查项有判定。
- [ ] DSC-02 / DSC-03：`visual:compare origin` 差异 0。
- [ ] 构建产物 CSS 总字节数相对 S0 记录下降，数字记录在案；全量 e2e 通过。

## 完成证据

progress.md 追加：rejected 清单与逐条结论、登记表、覆盖率抽查记录、删除前后规则数 / 字节数、比对输出、`audit` 结果与快照 SHA。
