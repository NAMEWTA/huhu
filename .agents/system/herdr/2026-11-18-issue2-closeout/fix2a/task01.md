# 复审修复 A · Vault/笔记数据层
工作树 `/home/wta/projects/huhu-wt-fix2a`，分支 `closeout4/fix2a`（= closeout4/final 4f6b703）。角色：具体实现（gpt-6.2-sol medium）。通用要求 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`。测试纪律：全部改完再统一跑一次定向 e2e（单 worker、零重试），只重跑失败项；不跑全量、不测性能；启动 Electron 前确认无其他 Electron/Playwright（另一个修复会话也会跑，有就等）。依据：复审 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/review/report02.md`（探针与日志 `/tmp/huhu-4f6b703-review.5V5z1p/`，先用探针判红），用户决定 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/user-decisions.md`。每项先判红再修，探针场景固化为仓库测试。
另一会话 fix2b 改编辑器/vendor/矩阵证据，本包只改 `packages/vault`、`plugins/notes/src/engine`、`plugins/notes/src/ui/viewers/{EncodingConversion,TextFileView}.tsx`、`packages/kernel/src/capabilities/vault.ts` 及对应测试。

## 阻断
1. A07/A08 并发改名覆盖：最终一步用原子独占移动（如 renameat2 RENAME_NOREPLACE 不可得时用 link+unlink 或可恢复等价提交），保留撞名双方；补「检查之后、提交之前」写入的竞争回归，普通改名与大小写改名第二跳都覆盖。
2. F02 编码转换覆盖外部更新：转换写入带提交前置条件（版本 CAS 在提交点生效）或保留可恢复原件，冲突时停下；补受控时序回归，两份字节可恢复。
## 应修
3. 单个旧编码档案阻断整个列表：读取按项降级，带路径编码提示与转换入口；写入与批量属性改写仍拒绝；验证正常项可见。
4. 跨深度移动后相对符号链接失效：规划时比较链接指向，迁移相对目标或移动前拒绝并说明；断言指向不变或整目录留原位。
5. UTF-16 无 BOM：文本类型提供明确解码预览与确认；二进制默认不可编辑；覆盖有 BOM、无 BOM、错误编码。
6. 编码探测绕过资源边界：复用 `vault.readBinary` 的资源守卫与读前容量检查，按实际大小限额，转换执行同样前置检查。
7. 硬链接/inode 依赖：为不支持硬链接或无稳定 inode 的卷提供安全的独占创建回退（如 O_EXCL 打开写入临时内容后 rename 的可恢复方案）或明确卷级限制提示；单测模拟 link 失败（EPERM/EXDEV/ENOTSUP）。
门禁同通用要求。回报 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/fix2a/report01.md`，manifest 中 fix2a 行改为 task01.md done。
