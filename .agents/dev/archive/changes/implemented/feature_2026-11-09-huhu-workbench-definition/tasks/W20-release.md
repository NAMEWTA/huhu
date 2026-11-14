# W20 首版发布

## W20.1 许可与第三方声明

- 目标：`LICENSE`、`THIRD_PARTY_NOTICES.md`、`docs/upstream/ledger.md` 完整，并随安装包分发。
- 依据：[reuse](../reuse.md) §1；D-27。
- 前置：W19.1。
- 位置：`THIRD_PARTY_NOTICES.md`、`scripts/gen-notices.mjs`。
- 复用：依赖 `license-checker-rseidelsohn`（生成依赖许可清单）。
- 实现要点：从生产依赖树生成；补入复制的上游来源（ledger 中每个仓库与提交）与 Herdr Core 二进制；关于页读取。
- 异常：生产依赖缺少许可字段时在声明中列为“未声明”。
- 测试：脚本在 CI 运行并比对无未提交差异。
- 完成：文件生成且随安装包出现在资源目录。

## W20.2 发布流水线

- 目标：推送 `v1.0.0` 标签后自动产出三平台安装包、校验和与 Release 草稿。
- 依据：[release](../release.md) §1–5。
- 前置：W01.4、W12.1、W20.1。
- 位置：`.github/workflows/release.yml`、`scripts/sync-version.mjs`、`scripts/checksums.mjs`。
- 复用：R-01。
- 实现要点：版本同步与 `build-info.json`；`fetch:herdr`；`dist`；打包后冒烟与 `tests/e2e/packaged` 子集；合并 `SHA256SUMS.txt`；Release 草稿说明模板（安装提示、未签名说明、手动验证结果表）。
- 异常：任一平台失败则不创建 Release。
- 测试：在预发布标签 `v1.0.0-rc.1` 上完整运行一次。
- 完成：rc 流水线三平台成功，产物可下载安装。

## W20.3 发布前实机验证与发布

- 目标：三台实机完成 release §5 的手动验证项，发布 1.0.0。
- 依据：release §5；quality §2 手动项。
- 前置：W20.2、W19.3、W19.4。
- 位置：Release 草稿说明。
- 复用：无。
- 实现要点：在 Windows x64、Apple Silicon Mac、Linux x64 各安装 rc 版本，执行：中文输入法（实时预览、终端）、真实 Claude Code 或 Codex 启动与历史、真实 SSH 主机、真实 Git 远端同步、8 小时 soak（任一平台）；结果写入说明；发现的问题修复后重新出 rc。
- 异常：无。
- 测试：如上。
- 完成：全部项通过后推送 `v1.0.0` 并发布 Release。
