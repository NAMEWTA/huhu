# Linux 最终组合门禁（进行中）

固定组合 `349fd3745013abc69b13001d84cd8fa652e053bd`，2026-11-22，Node 24.21.0、pnpm 12.10.1、Herdr Core 0.1.19。Lead HC `t101` 串行运行；根配置 maxWorkers=3，未提高并发。

原始日志：`temp/issue-evidence/huhu-2026-11-22/final-349fd3745013abc69b13001d84cd8fa652e053bd/`。

- lint、knip、format、vendor 类型构建、全仓串行类型检查通过。
- 全量 Vitest：178 文件通过、4 文件失败、1 文件跳过；2056 测试通过、4 失败、11 跳过，共 2071 项，403.62 秒。此前脚本检查也通过。不能称为全量绿灯。
- 构建与 CSS 产物检查尚未运行：runner 在测试失败处停止。
- 本轮之后只运行受影响检查，不重复全量测试。

## 失败分类与后续

1. Engine 健康检查测试把未设置 HUHU_HERDR_BIN 等同于找不到 Core；本机 PATH 已有 Core，实际返回 ok。改为在独立临时目录显式指定不存在的二进制，恢复环境后核对错误及重启操作。HC `t103` 定向 1/1 通过，49 项按筛选未运行。
2. CLI 同一 Engine 扩展卸载与复装出现 `fetch failed / read ECONNRESET`。HC `t102` 原用例单独 1/1 通过，`t103` 完整 CLI 文件 18/18 通过，业务代码未改。全量负载下重置的根因尚未证明，不把复跑绿灯描述为已修复。
3. SSH 身份证书夹具生成阶段 `Malformed OpenSSH private key`，发生于测试 setup 的 parseKey。
4. SSH 跳板修订失效测试预期 VERSION_CONFLICT，实际 NOT_FOUND。

第 3、4 项属于用户暂停的 #7，保留失败，不恢复开发、不更改断言或跳过规则。SSH 保存分支仍为 `45b9fae3e13cab49ad3dd0d62c51a52133bfcc56`，change 保留。未启用 OpenSSH 夹具的可选用例属跳过，不能作为通过。

定向日志：`cli-lifecycle-reproduce.log`、`final-targeted-recheck.log`，位于同一 `temp/issue-evidence/huhu-2026-11-22/`。最终包、main 落地、全量 E2E 与逐 Issue 验收仍待完成。

## 后续构建与组合复核

`dc88d854e7fc07e2c084c829927926573359010d`：HC `t104` 完成 Engine 定向类型检查、全仓串行 build、产物 CSS 冲突检查，均通过；构建后工作树干净。日志目录 `temp/issue-evidence/huhu-2026-11-22/build-dc88d854e7fc07e2c084c829927926573359010d/`。这是源码构建，不是安装包或 GUI 验收。

HC `t105` 同时覆盖 Engine 与 CLI 两个相关文件，68/68 通过（29.25 秒），日志 `engine-cli-combined-recheck.log`。CLI 原失败用例现有单独、完整文件及两文件组合三次复跑通过，未修改业务逻辑或放宽断言；原全量 ECONNRESET 仍保留，原因未定。
