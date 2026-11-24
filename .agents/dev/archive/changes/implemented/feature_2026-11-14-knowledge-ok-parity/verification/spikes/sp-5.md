# SP-5 YAML 对拍（S2a，2026-11-15）——**通过**

`packages/editor/test/sp5-yaml.test.ts`（设置 `SP5_OUT=<路径>` 才运行）对 12 个样本（`false`、`0`、空字符串、`null`、前导零 `007`、非完整日期、数组、嵌套、注释、未知键、CRLF、BOM）分别用 OK `applyPatchToDocument`（`yaml` 包 `parseDocument`）与 Huhu `patchFrontmatter` 打补丁，数据 `sp-5-data.json`。

- **11 / 12 逐字节相同**。唯一差异 CRLF 来自对拍脚本自己的包装（把围栏重写成 `\n`），不是两个实现的差异；OK 实际流程由 bridge 的 `line-endings` 处理。
- 两者都基于 `yaml` 的 `parseDocument`，值类型与注释 / 未知键保留一致。结论：**不需要合并编解码**；属性区经 OK 的 `use-frontmatter-field` 读写 `Y.Text('source')`，会话保存仍由 Huhu 的会话层负责，二者对同一文本给出一致结果。S3 属性区实施时再对拍 `ManagedArtifact` / `Template` 等非常规 schema。
