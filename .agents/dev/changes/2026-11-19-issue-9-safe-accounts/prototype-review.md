# 保险箱原型走查与用户确认

## 入口与版本

双击 [prototype/index.html](prototype/index.html)，用样例主密码 `Huhu-demo-2026` 解锁。完整版本由 `index.html`、`prototype.css`、`theme.css` 和 `prototype.js` 组成，目录 SHA-256 为 `d3b206857caed6e0e1d2c0d6ee505a0387c8f44fdedc249efd578de4f4d13f83`。

沿用 Huhu 的 Claude 默认主题和工作台窗口栏、模块栏、标签条、面包屑，复用现有 Safe 的解锁卡片、条目列表与详情并列、描边卡片和密码遮罩。窄窗切为列表与详情逐层显示。 [AppShell](../../../../packages/workbench/src/shell/AppShell.tsx) · [Safe 界面](../../../../plugins/safe/src/ui/SafeModule.tsx) · [Safe 样式](../../../../plugins/safe/src/ui/safe.css) · [主题](../../../../packages/ui/src/styles/themes.generated.css)

Huhu 检出为 `feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。核对 Motty 默认分支 `2daa9db582e16edf60a60b7ada26f47f808f973c` 的模块保护边界。历史来源和当前规格见下方文档。使用本轮已定的清洁安装与模块独立认证规则。 [来源](source.md) · [规格](spec.md) · [设计](design.md) · [实施计划](plan.md) · [批次来源清单](../2026-11-19-huhu-issues-3-10/sources.md)

## 走查场景

| 范围 | 入口与可见结果 | 取消、异常或恢复 | 源码定位 |
| --- | --- | --- | --- |
| A01/A02 条目与多账号 | 解锁后选 Google 的三个账号。可新增条目、保存多个账号、只编辑公共网址或只编辑指定账号。搜「个人照片」会定位至账号。保留手机号的前导零。 | 演示写入失败可再次保存；版本冲突保留修改并允许重读当前版本。关闭表单可继续编辑或放弃。 | `safePage`、`renderDetail`、`openEdit`、`saveEdit` |
| A03/A04 标签和搜索 | 多选标签取交集，搜索再叠加，选择「无标签」切到互斥筛选。可在条目中建标签，或在标签管理改名、换色、删除，同名可复用。 | 删除标签确认后只解除关联。未保存的条目与其中新增的标签可一起放弃。密码样例在搜索中无匹配。 | `filteredEntries`、`matching`、`openTags`、`openTag` |
| A05/A06/B01 显隐、锁定、删除 | 默认遮罩，使用键盘显隐，复制仅针对当前账号。进入其他账号后重新遮罩。表单内可锁定，设置支持自动或离开锁定。 | 复制可模拟拒绝并保留手动复制路径。删除最后一个账号转到整条删除的独立确认；锁定清除正文、检索、明文和未保存表单。 | `renderDetail`、`clearSession`、`actions.copy`、`actions['delete-account']` |
| B02/B03 新库、重启、恢复 | 演示控制可清洁安装后设置新主密码，也可模拟重启并用原密码读回已保存条目。创建演示备份后可更改主密码；恢复时用创建备份时的密码，再解锁恢复 Vault。 | 错误解锁、连续输错冷却及暂时的损坏样例有提示。恢复可取消或因密码错误重试。模块凭据在备份恢复后显示需重新配置。 | `fixture`、`enterSafe`、`actions.snapshot`、`actions.restore` |
| C/D 模块认证 | 设置展示 SSH、Git 同步、Agent CLI、自动化及邮件各自的配置和使用入口。Safe 锁定或停用时，可用 Git 的已配置样例；更换 Git 目标后需要独立配置。 | 本机保护不可用时保留旧配置。可清除演示认证并从所属配置重新填写。 | `owners`、`settingsPage`、`openOwner`、`actions['owner-test']` |

## 实际走查

- 2026-11-19，Windows Edge 157.0.4341.60，Playwright Core 1.65.1，从 `file://` 打开。1440×900 验证错密码后解锁、键盘显隐、切账号重新遮罩、复制拒绝后成功、搜索排除密码、标签交集。修改 Google 的一个账号备注，验证保存失败保留表单、重试成功、原密码保留、版本冲突可重读、Esc 返回保留编辑、锁定清除编辑与已显示密码。
- 验证 Safe 锁定和停用期间 Git 的独立使用、本机保护失败后重试、切 Git 目标后要求认证，模拟重启后保存内容仍可读，新建双账号条目、同名标签复用及表单内新增标签、清洁安装和重置。建立备份后改主密码，旧备份仍用生成时的密码恢复，模块认证需重新配置。最后一个账号的删除确认可取消。桌面对照 Claude 浅色及深色。
- 390×844 打开含长中文名、长网址及 12 个账号的研究平台条目，选中第 12 个账号后返回，焦点恢复至原条目。两个视口均验证资源加载、浏览器错误、HTTP 请求数和横向宽度。
- 同机复跑工具和截图在系统临时目录 `%TEMP%/huhu-t14-prototype-qa/`。命令为 `node smoke.cjs safe` 与 `node extra.cjs`，截图为 `safe-desktop.png`、`safe-narrow.png`。

## 用户确认和实施边界

用户确认采用指纹 `d3b206857caed6e0e1d2c0d6ee505a0387c8f44fdedc249efd578de4f4d13f83` 对应版本中的多账号选择、锁定清理、模块独立认证配置和备份恢复反馈。多账号详情使用账号选择器。主密码与备份动作位于解锁后的工具条。

原型的 Vault 切换、锁定延时和备份使用内存数据。浏览器剪贴板动作由明确点击触发，走查使用样例值。

实际的持久重启、加密和备份字节、主密码包装、系统钥匙串、Git/SSH/Agent/自动化/Mail 的进程交接、统一能力权限和锁定竞态需在产品入口验证。尚未遍历全部标签编辑/删除组合、冷却计时、四套主题或各模块认证方式。
