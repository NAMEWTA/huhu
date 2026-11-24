# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pE
- task：task04.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/task04.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report04.md
- 执行结果：done
- 审查目标：`cf882bd7805f99b73b0e4c4f9753eb160759de4d`，对照 `ca28e78`，并核对 `471dfdf..cf882bd` 的合入历史

## 结论

**report03 的两项模板应修已关闭。** 树菜单继承范围与固定 OK 一致，非桌面调用传入 `templatePath` 时在读取模板前被拒绝。未发现这两个修复新增的用户路径回归或越权。A07 的目录拒绝仍有效，测试夹具修复保留原来的双链断言。Lead 保留的严格移动行为有外部兼容性影响。外部调用者只能使用已有目标目录，`folders.create` 只供桌面准备目标。**Issue #2 仍待 G07 的冷启动对照和 G06 的最终候选门禁证据。**

`4f5d524` 已在 report03 发布前随 `ca28e78` 做了独立复验，结果见该报告的 A07 追加复审。 [report03](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report03.md:36)

## 规格核对

### 树菜单模板目录继承 · 已修复

`templatesForFolder` 按当前目录、逐级祖先、Vault 根的顺序取准确目录键。模板按去扩展名后的文件名去重，最近目录优先，当前目录标为 `local`。这与固定 OK `44a2e0a` 的 `resolveTemplatesAvailable` 顺序和 `seen` 规则等价。Huhu 沿用完整 Vault 相对路径作为选择值和回传参数，继续支持 Markdown/MDX 本地模板。全库清单仍由主「新建笔记」对话框使用。 [Huhu 路由](/home/wta/projects/huhu-wt-review/packages/editor/src/host/routes/files.ts:57) · [OK 目录解析](/home/wta/projects/huhu/temp/sources/open-knowledge/packages/server/src/content/templates-resolver.ts:31) · [桌面新建适配](/home/wta/projects/huhu-wt-review/plugins/notes/src/ui/explorer/filesDeps.ts:121)

独立调用 renderer 的宿主路由，验证根、乙、甲/子三组。甲/子的本地同名覆盖甲和根，兄弟、同前缀目录和后代均被排除。输入 `./甲//子/` 正规化为 `甲/子`。pB 的 Electron 专项零重试复跑 3/3，实际验证乙无甲的模板、甲的子目录有继承徽标并按模板字节创建、主对话框仍列出甲的模板。 [路由测试](/home/wta/projects/huhu-wt-review/packages/editor/test/host-files.test.ts:31) · [真实 UI 用例](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/editor-parity-assets-template.spec.ts:114) · [pB 运行日志](/tmp/huhu-task08.ouAM92/e2e-retry.log) · [独立路由探针](/tmp/huhu-review04.H4joGg/folder-templates.log)

### `templatePath` 仅桌面可用 · 已修复

`notes.create` 在进入服务前检查经认证的 `caller`。该身份由令牌与 Dispatcher 赋值。非桌面身份传入此参数时得到 `PERMISSION_DENIED`，文件和引擎索引没有新写入。原有内置模板与目标目录检查继续生效，列举与导入保持 `exposable: false`。在 `cf882bd` 的真实引擎 HTTP 用例中，CLI 关掉读能力、单独开放创建时，本地模板被拒且目标文件缺席，`meeting` 创建成功，桌面使用同一源模板成功并保留字节。CLI 已实测，MCP、HTTP 和插件的结论来自同一 handler 的身份检查。 [能力入口](/home/wta/projects/huhu-wt-review/plugins/notes/src/engine/index.ts:70) · [令牌到调用方](/home/wta/projects/huhu-wt-review/packages/kernel/src/server/http-app.ts:80) · [Dispatcher](/home/wta/projects/huhu-wt-review/packages/kernel/src/dispatcher.ts:129) · [引擎回归](/home/wta/projects/huhu-wt-review/apps/engine/test/engine.test.ts:1135) · [本轮定向结果](/tmp/huhu-review04.H4joGg/engine-focused.log)

## 规范与对外能力契约

- **`notes.move` 的前置条件收紧。** 旧行为会随移动创建缺失目标目录。现有非空 `targetDir` 必须是 Vault 内已有目录，缺失或为普通文件返回 `NOT_FOUND`，空字符串仍移动到 Vault 根。这个改变阻止了 A07 的过期树行误移动。公开能力目录只承诺移动并改写双链，未承诺隐式建目录。已有依赖副作用的调用者仍会遇到兼容性变化。 `cea7b3c` 只在旧测试中显式建目的地，继续断言原目录链接保持、文件链接改写。 [服务入口](/home/wta/projects/huhu-wt-review/plugins/notes/src/engine/service.ts:323) · [夹具断言](/home/wta/projects/huhu-wt-review/plugins/notes/test/service.test.ts:277) · [对外能力目录](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/interfaces.md:75) · [pC 夹具证据](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report09.md)
- **外部调用方无法先调用 `folders.create`。** 它不可暴露，网关也拒绝将它开放。用临时 Vault 的 CLI 令牌复验，开放 `notes.move` 后移动到缺失目录得到 `NOT_FOUND`，源字节不变。CLI 的 `folders.create` 返回 `CAPABILITY_NOT_EXPOSED`。桌面准备目标后，同一幂等键仍返回原失败，新键移动成功且字节相同。该结果符合现有非重试错误的 24 小时幂等记录。建议发布说明注明已存在目标、缺失时由桌面侧创建、创建后发起新请求。保留严格行为，当前没有依据扩大外部目录写权限。 [目录能力](/home/wta/projects/huhu-wt-review/plugins/notes/src/engine/index.ts:347) · [网关限制](/home/wta/projects/huhu-wt-review/packages/kernel/src/capabilities/system.ts:150) · [幂等处理](/home/wta/projects/huhu-wt-review/packages/kernel/src/dispatcher.ts:81) · [契约探针](/tmp/huhu-review04.H4joGg/external-move.log)
- **可选 · 机器可读参数说明。** CLI 的能力发现仍列出 `notes.create.templatePath`，容易让外部客户端误以为可用。该项只影响能力发现说明，实际调用的限制已验证。可在对外参数描述注明桌面专用，或在按调用者生成的 schema 中省略。 [能力发现](/home/wta/projects/huhu-wt-review/packages/kernel/src/server/http-app.ts:129) · [探针结果](/tmp/huhu-review04.H4joGg/external-move.log)

## 关闭条件

| 分级 | 截至本轮的证据 |
| --- | --- |
| 阻断 · G07 | 仍未见 `cf882bd` 最终构建的同机低负载配对、同格式安装包增量和首篇笔记 p50/p95 的完整结果。旧样本的工作台及收件箱 p95 有回退，不能代替最后候选的无回退结论。Lead 正在保留测量窗口。 [G07 规格](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md:79) · [往轮证据](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/layout/g07-budget.md:91) |
| 待验收 · G06 | report03 后已补到 `ca28e78` 的 Linux 解包验证，51,020 个 ASAR 条目检查通过，打包冒烟 4/4。最终 `cf882bd` 又包含两项运行时代码变化，现有发布包和完整门禁记录需在最终交付 SHA 上收齐。分支定向结果已核对，不能作为最终全量记录。 [G06 规格](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md:78) · [打包日志](/home/wta/projects/huhu/.agents/dev/changes/2026-11-18-issue2-closeout/packaged-ca28e78.log:339) |
| 应登记 · F09 | 延续 report03 判定。全量 `471dfdf` 的 17.9 ms p95 仍超严格 16 ms，历史配对中 main 也超阈值，按 Lead 的「测量并记录」口径留原始结果。这轮范围未变更输入延迟路径。 [历史全量](/home/wta/projects/huhu/.agents/dev/changes/2026-11-18-issue2-closeout/e2e-full-471dfdf.log:237) |

## 验证与产物

- `git checkout --detach cf882bd`，审查六个变更文件和合入图，`git diff --check ca28e78..cf882bd` 通过，工作树业务文件干净。两项业务修复来自 `e6c1e25`，`cea7b3c` 仅增加一行测试夹具。
- `pnpm exec vitest run apps/engine/test/engine.test.ts -t 'Vault 模板路径|notes.move 拒绝非现存目录|notes.move 仍可' --maxWorkers=1 --minWorkers=1 --no-cache`，单文件 **5/5**。pnpm 开始时从本地缓存同步了该审查 worktree 的锁定依赖。另用 `/tmp/huhu-review04.H4joGg/` 中的两份轻量探针核对实际路由、外部权限与失败后重试。
- 本轮未运行 E2E 或全量单测，引用 pB 的 3/3 Electron 专项、pC 的 1/1 夹具及分支全量 1004/1005（1 跳过）。pC 分支全量早于最终合并，证据对应原分支。 [pB 专项报告](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report08.md) · [pC 单测日志](/tmp/huhu-session-09/test.log)

## Lead 验收

Lead（2026-11-19）：接受。保留 `notes.move` 严格前置条件：网关本就不向外部开放 `folders.create`，旧的隐式建目录绕过了该策略；在台账与关闭说明中登记为对外能力变化（外部调用方只能移动到已存在目录，缺失时由桌面侧创建）。能力发现中 `templatePath` 的说明项登记为可选，不阻断。G07 与最终 SHA 的 G06 由 Lead 执行；cf882bd 全量另现 `a11y.spec.ts:64` 间歇失败，已派 pD 疑难分析。
