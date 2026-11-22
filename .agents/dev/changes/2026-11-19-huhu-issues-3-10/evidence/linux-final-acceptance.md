# Linux 组合候选验收（进行中）

## 当前状态（2026-11-23）

源码候选固定为 `80db95d0`。此前已保存至远端的 feature 为 `9252eeea`，main仍为 `4ae7e7e4`；后续推送与固定组合门禁待实际输出核对。旧rc.4制品不代表当前源码。

Notes 83项会话测试、11项完整Engine能力测试及定向类型、格式、lint通过，独审t152/task04关闭最后两条草稿缺口。Mail 29项后端回归及类型/lint通过，实际恢复重试E2E已写但未运行。进入当前组合门禁与构建阶段，尚未签真实UI和安装包通过。

第一次全量E2E已结束：351 passed、48 failed、18 skipped，另有6项测试外错误。非SSH失败映射为当前34项，其中33项源码复验，W8.2/W8.3一项安排同包workspace验收。新增Notes/Mail等受影响场景另加，不重复全量套件。

以下按时间保留旧候选与逐轮验证记录；后续条目替代对应早期“尚未运行”状态，未标同包的定向证据不代表安装包验收。

## 首轮冻结候选与落地

候选 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030` 已经 `feature/issue-fix` 推送并落地 `origin/main`；HC t106/t107 的远端结果均指向该 SHA。本地根目录与本地 main 分支不是验收依据。t108 打包成功，未发布、未安装 deb。

| 制品 | SHA-256 |
| --- | --- |
| HUHU-0.0.1-rc.4-linux-x64.AppImage | f497456baf7a6ea4146b3ec82694374ad3965cb51f3a747adcac5c4003d68d8a |
| HUHU-0.0.1-rc.4-linux-x64.deb | c800e9e971c075546daa935551502c917493080ff704c3a9397ea8a6972f7447 |

制品目录 `temp/issue-worktrees/integration/apps/desktop/release/`。日志根 `temp/issue-evidence/huhu-2026-11-22/`，打包命令保存在 `run-final-package.sh`，输出 `final-package-4ae7e7e4.log`。门禁结果见 [linux-final-gates.md](linux-final-gates.md)。打包成功不等于通过使用验收。

## 首次全量 E2E

HC t109 执行 `run-final-e2e.sh`，固定上述提交，417 项、1 worker，隔离 HOME/XDG/Vault、Secret Service 和 Xvfb。运行过程中不修改 integration；修复候选在 agent-linux 准备。结果目录 `e2e-4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030/`；200 轮资源回收用例已通过（3.7 分钟）；最终结果为351通过、48失败、18跳过及6项测试外错误，不能签总体通过。完成后只复跑失败或改动直接影响的场景，不重新发起全量套件。

已看到候选 AppImage 的 Linux 普通 Agent 与受保护 Agent 两项通过（16.2s、15.4s），覆盖真实 PTY、键盘、resize、Safe 状态和后代回收；该处 agent 程序是合成夹具，真实 provider 另见此前离线定向记录。

已观察失败及准备措施：

| 失败 | 已核对的原因或状态 | 后续 |
| --- | --- | --- |
| compact-inbox G07 | 文档 wikiLink 使用相对片段 assign，在 base URL 下改变 pathname | t10g 补 hash setter 与页面身份回归，t10j 独审，未运行 |
| compact-submit 三项 | 原夹具把 Yjs 撤销后的 source 错当滞后文本；失败发生在提交之前 | t10g 改真实追加/删除建立滞后 source，保留独立撤销空稿与零提交断言，未运行 |
| compact-commands OP-D18 | 原 trace 只证明最终空选区，未证明起始点击位置 | t10g 用文字 Range 实际点击并采集 DOM/PM 焦点，未改生产键盘分支，未运行 |
| editor-s3-properties F02 旧编码 | 用例直接找转换按钮；当前 UI 先预览解码再显示确认转换 | Lead 补先预览且前后字节不变断言，未运行 |
| local-reference-blocks B01 | 镜像正文成功，画板快照渲染报错；根因未定 | t10m 已收回只读报告：SVG 序列化和 CSP 是待验线索；Lead 补 console/pageerror 附件及真实图片解码释放检查，未运行 |
| editor-s3-toolbar 1440px | engine-state 在启动时未出现，另有 teardown timeout | 根因未明，保留原 trace，后续定向复现；不提高超时掩盖 |

## 覆盖缺口与工作归属

独审依据 HC t10b/report01.md；其 done 仅代表审查完成。

- #6 CLI-only、HTTP MCP-only 各自创建/编辑/派遣/回答/读结果：t10f 已补用例，t10h 静态独审；尚未运行。原混合链证据保留。
- #3/#6/#10 同包 Web：Lead 新增显式候选包启动模式、包身份附件、业务深链接刷新与桌面/浏览器双向编辑；保留两份邀请三会话及布局关窗重开。尚未运行，不当作第二物理 LAN 设备证据。
- #8 Graph：t10d 已交候选；t10n 独审发现 opaque token、括号分页、全局覆盖 Exchange 三项 P1，以及预算/切代/权限事件 P2。t10q 已交返工，t10w 复核确认原 P1 修正；新增分页窗口、同 ID 矛盾记录、取消写回和刷新降权四项 P2 及收件 403 提示 P3，交 t10x 收口，尚未运行验证或签收；不增加 Graph 专属 consent UX。
- 四项普通包冒烟及凭据联验：包装脚本增加 package 模式运行已有五项用例，尚未运行。
- #9 包内 Git、#6 同一外部任务在桌面与 Web 刷新、Web 终端刷新、卡片权限退化仍待补证。
- GNOME 原生 Wayland/Xorg、Windows/macOS 真机与真实第三方邮箱仍需实际环境；HC 当前未配置远程机器。Xvfb、交叉编译及旧提交结果均不能代签。

#7 SSH 继续暂停，保存分支、change 和已有证据保留；本轮未开发其功能。所有新修复仍未合入本候选，不可把未来修改与上述制品混记为同一版本。

## 准备阶段复审

- t10h 发现候选包装器嵌套临时目录令 holder socket 达109字节，超过Linux上限107。Lead将隔离根缩短为`/tmp/hc-a.XXXXXX`，对应holder路径91字节；保留mktemp私有权限和清理。未运行包验收。
- t10h 的Web双向内容保真漏验已补：后一次写入、刷新与重开均核对菜单正文及两端新增文本。
- t10j/report02.md 关闭H05零请求掩盖提交错误、OP-D18诊断覆盖主错误两项静态问题。Lead另将零请求观察窗口放在点击后，监听在点击前注册并finally移除。
- t10h发现provider输出日志不证明消费者处理完成；t10k 已交夹具协议屏障及真实 inspect 对账补丁，Lead 已读报告，尚未运行。
- vendor补丁路径登记检查已通过：改动140、测试改动33、删除4、新增384，未登记0、多余登记0。完整重放补丁仍待按新vendor字节刷新和校验。

- t10p 已交共享候选启动 helper 和包内受保护规则用例；Lead 接入 `rule` 模式，t10n/task02 正在只读审查。尚未运行，不计作 Safe 锁定组合验收通过。
- 新观察到 shell 50MiB、ACC-AG-08/04、Safe 本机分享默认值、窄窗 firstWindow 失败；t10r 只读归因中。perf 冷启动用例插件启用397ms、1MiB打开756ms、输入p95 17.8ms分别超原门槛；滚动指标满足但close超时，不能算通过。终端perf的Core懒启动前置已准备调整，未运行。
- 本次补齐 R-87 的 THIRD_PARTY_NOTICES 与 Mail UPSTREAM 记录；来源登记不替代协议或真实账号验收。

- t10r 已确认两个 Agent 前置及 Safe 本机选择修订符合现行规格；50MiB 与窄窗均在业务操作前失败，Engine 已写端点，首窗/renderer 根因未明。窄窗取窗现纳入清理边界，保留主体错误；定向 lint/format 通过，真实场景未复跑。
- t10n/task02 已收：下一干净组合重打包后执行新脚手架，保留同一 SHA 校验；清理错误保真、实际 Engine/Core/CLI 归属与凭据轮换证据交 t10s 补齐，未运行。

- D09 新增 `workflows/external-task-web.spec.ts` 与 `tools-web` 包模式：CLI 创建、MCP 更新同一任务，在两个已打开的工作台检查相同任务 ID 与正文，Web 刷新后读回，并检查撤权后不再修改。只完成定向 lint/format 和包装脚本语法检查，未启动应用；不能计为已验证。
- 全量第262项旧 Agent 规则夹具“无法派遣”由t10t核对并迁移，保留真实完成/会话/结果目标；第265项网关仍把已开放safe.audit.list当不可开放，已按现行能力声明改用gateway.tokens.create。后续实际运行待定。

- t10s/report02 已交同包 helper：实际 Engine/Core 归属与退出证据、清理首错保留、规则两轮凭据哈希；未运行。
- Lead 修正 `acceptance.spec.ts` 的历史搜索旧标签，以及初次仅位置扫描后需显式刷新才显示版本的断言；`shell.spec.ts` 旧自动化夹具改真实 Codex/Tasks 回执与会话定位。t10y 对这两文件格式、lint 和 diff 空白检查通过，E2E 未运行。

## 2026-11-23 定向运行（agent-linux 未提交差异）

以下记录基于4ae7e7e4加工作树差异，不是最终同包签收。日志位于temp/issue-evidence/huhu-2026-11-22。

- t112→t113：真实Core的已结束目标回归先红后绿；目标已结束返回session_ended，仍无法核实的绑定保留binding_unverified。dispatch.live.test.ts 1/1通过，私有Core/provider清理livePids为空。ended-target-red.log、ended-target-check.log。
- t116：Tasks执行器2/2通过，Agent CLI与Tasks包类型检查通过。ended-target-types.log。
- t114：native-receipts.live.test.ts 5/5通过（111.94秒），含CLI-only及HTTP MCP-only创建、编辑、派遣、答复并读取原Core会话结果，以及回执恢复。实际Core与合成provider协议夹具，不代替真实第三方AI运行。native-independent-journeys-check.log。
- t119→t11b：Mail测试事件payload联合类型精确收窄，Mail包类型检查通过。graph-types-recheck.log。
- t118重复声明、t11c仅收信草稿前置错误均已修正；t11d oauth-engine.test.ts 3/3通过（11.75秒），使用隔离发行方及回环邮件服务。graph-production-draft-recheck.log。未使用真实Microsoft租户。
- t117独审仍有Graph delta与Inbox对账状态覆盖、提前缓存新信漏通知，交t11f实施；因此S4.2仍待签收。
- t115同包用例独审的环境类型、真实provider探测与清理期限问题交t11g；新增用例尚未实际运行。

## 画板首屏根因与最小修复

- t11t 在旧4ae构建、全新私有Vault/profile/HOME/XDG/DBus中复现。启动前已通过真实Agent设置停用claude/codex/pi探测，仅加载合成矩形画板。渲染器明确报告 `img-src 'self' data:` 拒绝 `blob:huhu-app://workbench/...`，随后组件报告快照解码失败。日志 `excalidraw-probe.log`。
- Lead只在 `apps/desktop/src/renderer/index.html` 的img-src添加blob:。旧integration构建及原制品不动；复制其out到证据目录excalidraw-probe-app，仅改HTML同一指令作因果对照。t11x成功解码同一矩形（naturalWidth80），日志excalidraw-csp-check.log。此为补丁探针，不是新候选包或完整B01通过；关闭、切库、更新URL回收仍需最终定向E2E。
- 结束后按HUHU_PROBE_ROOT私有标记扫描/proc，活进程0；没有访问用户Vault或原生Agent历史。
- Modern Web Guidance：检索serialize SVG image、decode blob SVG image、allow blob image CSP，完整读取js与security指南。此次应用security的“Console Auditing”建议，用实际阻止日志核对资源来源再作img-src局部修复；没有放宽script/frame/connect策略。

## Graph与手动保存新证据

- t11f状态合并修复后，t11y oauth-engine.test.ts 3/3通过，t11z Mail类型检查通过；新到信时间基线边界仍交t120独审，暂不签S4.2/S5.2。
- t11s document-session.test.ts红灯：35通过，新增1失败，第一次手动flush实际写入A+B而非A。这是受控回执窗口的生产竞态证据，不再仅由旧trace推断。t11n/task02正在修复，尚无绿灯。

## 手动保存与同包脚本复验

- t122 修复后 document-session.test.ts **37/37通过**（manual-save-check.log）。显式手动保存结束于本轮写入回执；之后的输入保留dirty。退出、批注、模式切换和路径变更显式untilClean，手动退出保留后续文本草稿。t123 Notes包类型和20个变更/新增E2E入口类型检查通过（notes-candidate-types.log）。真实受控E2E尚未运行，t124独审中。
- t121 候选夹具19入口类型通过；Lead修正空fixture绑定并完成4文件定向format/lint。t11g修复关闭期限与独占创建停用真实provider的设置。新Web终端旅程在原UI证据外增加同源已授权浏览器的直接观察者socket负向帧：先收到真实回放，再送输入/resize，关闭握手后由原控制者核对尺寸及未执行标记。此新增检查类型通过，实际运行仍待新候选包，不能计为服务端行为已通过。
- Notes相关11文件定向format/lint通过。原快捷键用例现等待“已保存”后再输入，竞态由独立受控用例覆盖，不放宽性能或落盘要求。

### 2026-11-23 HTML 源码入口修复（未提交候选）

- t128 实际 Electron 探针：选中源码后提示“只能探测受支持的文本文件”，没有编辑器。原因是 `notes.textEncoding` 的共享文本类型表遗漏 HTML，前端已有独立 HTML 分派。
- 共享 `HTML_LIMIT=8 MiB`，源码探测、读取和查看器共用原 HTML 容量约束，保留版本冲突保护。
- t129 三个扩展名回归实际因上述拒绝失败；t12b `plugins/notes/test/service.test.ts` 44/44 通过，覆盖 html/htm/HTML、读取保存、过期版本、超限拒绝。日志 `temp/issue-evidence/huhu-2026-11-22/html-source-{red,check}.log`（项目根）。
- 新构建的桌面源码切换和预览刷新尚未复验，不能记作候选包通过。

### 2026-11-23 定向补位与画板回收（未提交候选）

- t12f 先核实 delta，再按有效条目计满 Graph Inbox 200 封，旧列表中的已删除/移出/草稿不占名额；t12p OAuth 文件 4/4 通过，包含真实客户端分页、补位页失败重试。S5.2 通知口径仍等待用户决定，不能把补位通过当作通知签收。
- t12k 在只修 CSP 的隔离 4ae 构建复现关闭笔记后旧图片仍可 decode。t12m DOM 回归 24 通过/1 失败；修复快照池后 t12n 两文件 29/29 通过，t12r 新增 DOM 移动/共享消费检查 5/5 通过。React Activity 隐藏会清理 Effects 但保留 DOM，因此回收依据实际图片离场而非普通 Effect cleanup：https://react.dev/reference/react/Activity 。
- 现代 Web 指南 search（release object URL when DOM image is removed MutationObserver）命中 js；复用本轮已 retrieve 并完整读取的 js 指南。真实新构建 B01 生命周期仍待验收，独审 t12q 待报告。

### 2026-11-23 保存快照与前置排空

- t12c 修复明确保存排队时取样过晚的问题：每次保存冻结本轮已交付正文，等待前一回执推进版本；自动保存仍按执行时文本落盘，档案字段变更对排队快照重基。档案路径操作、批注前置保存使用 untilClean；显式保存按钮/菜单/快捷键保持单轮语义。
- t12t `plugins/notes/test/document-session.test.ts` 38/38 通过，包含两次手动保存重叠、版本序列、后续输入保留和退出草稿；t12w Notes 模块类型检查通过。日志 `save-snapshot-check.log`、`save-notes-types.log`。
- t12v 独审和真实 Electron 回执、档案操作、菜单/Mod+S 复验仍未完成，不记为同包验收。

### 2026-11-23 审查返工及类型验证

- t12q 独审发现快照 ready→unreachable/empty→相同内容 ready 可能复用撤销 URL，以及原池第31个待挂载快照被淘汰的问题；t12z 正在返工，不把前轮 DOM 绿灯当作生命周期全部完成。
- HTML 保存按 UTF-8 字节检查 8 MiB；t130 失败证明原实现实际写入超限内容，t131 Notes 服务 45/45 通过，原文件与版本保持。
- t12x Mail 新回归的联合类型收窄失败；改用 seen 正向分支后 t12y Mail 类型检查通过。
- t12g Web fixture 使用独立120秒 teardown预算、阶段限时；观察连接保持打开并无桌面新控制帧期间采样同一PTY，关闭握手要求正常1000。采样有限间隔不证明任意瞬间无变化，记录实际窗口。t132 暴露浏览器回调的静态类型缺口，按真实 exposeFunction 注入边界修正后 t134 当前20个变更/新增E2E入口类型通过。t135 当前10个 Notes/Web变更文件lint通过。真实同包G7.2/W05-W06仍待运行。

### 2026-11-23 保存基线红灯与快照返工验证

- t12v 独审发现旧排队保存借冲突解决后的新版本覆盖外部正文、档案字段前置保存取到后来输入，以及撤销回已落盘正文仍显示 dirty。t137 两基线回归均失败，t138 撤销到 A 失败/撤销到 X 通过，t139 字段快照失败并观测到多余 A+B+C 写入。日志 save-baseline-red.log、save-undo-state-red.log、fields-snapshot-red.log。先前38项通过不足以签收，t13b 按 t136 分析修复中。
- t12z 修复快照同内容恢复与容量边界后，t13c 两个 vendor DOM 文件35/35通过（snapshot-lifecycle-check.log）。独立审查 t13d 进行中；新 Electron 构建的实际解码、关闭及 Activity 切换仍未验收。

- HTML 四文件已保存为本地提交 `f0fb1810`，未推送；服务45项、查看器5项证据对应当前字节，新包桌面实测仍待完成。快照 vendor 类型检查 t13f 通过；B01 E2E 新增 Activity 隐藏返回同URL及清空后同内容恢复实际解码，t13g 类型、t13h 单文件format/lint通过，未运行E2E。

- t13k 真实 TipTap+Activity 回归证实隐藏提前撤销URL（1失败6跳过），t13j/task02修复中。t13b 保存基线修复后 t13m DocumentSession 50/50通过，含旧成功ACK、keepMine与字段跨基线；t13n类型及t13p独审进行中。尚无最终新包桌面验证。

- t13n Notes模块与变更E2E类型检查通过，t13r保存修复三文件format/lint通过；独审仍进行。已验证的已结束Agent目标/Tasks判定四文件保存为 `8c1a9675`；t13q相关六文件format/lint通过，源码行为证据沿用t113/t116，未推送、未声称新包通过。

- 独立 CLI-only / HTTP MCP-only 原会话任务旅程两文件已保存为 `4beb7eae`；t114 五项实际Core联验与t13q diff lint证据沿用，未冒充安装包旅程。
- t13s 列举发现旧失败标题两处已变，按实际代码映射后t13t收集34个当前用例，完整覆盖旧33个非SSH失败（撤销/删除拆分一项）；仅 --list，未运行。选择与映射位于 temp/final-audit/failed-nonssh-selection.json，当前列表 failed-nonssh-current-list.json。后续仍需加入本轮新增且未在旧失败集中的同包/保存/画板场景。

### 编辑器生命周期提交与保存独审回归（2026-11-23）

- 本地提交 `9e854b1c` 保存 B01 Blob 图片 CSP、快照停放/换绑/销毁生命周期及 G07 同文档 hash 导航。t13v 三个 DOM 文件 45 项通过，t13w vendor 类型检查通过；t13y 重建上游补丁，t13z 从固定上游重放 1556 个文件集合和字节零差异。日志位于当前工作树 `temp/final-audit/editor-replay-{refresh,check}.log`。尚未推送；新候选真实 Electron 行为未运行，不能据此签收 B01/G07。
- t140 定向运行 `pnpm exec vitest run plugins/notes/test/document-session.test.ts plugins/notes/test/archives.test.ts`，3 项失败、69 项通过。新增失败分别是迟到实际写入未对账、旧版本档案字段请求重建已移走文件、保存回执未到时撤销错误显示已保存。日志 `temp/final-audit/save-late-red.log`。t13b 先修后两项，t13x 只读分析第一项；没有重跑全量测试。
- t141 同两文件修后回归：71 通过、1 失败。档案缺失条件更新及回执在途撤销两项已绿；迟到实际写入对账仍红。日志 `temp/final-audit/save-archive-check.log`，尚不计保存生命周期整体验收通过。
- `7b6ef95a` 单独保存档案条件更新修复与真实 Vault 回归；t141 中 archives.test.ts 通过，随后对 service.ts / archives.test.ts 定向 oxlint、oxfmt --check 与 git diff --check 均通过。正文迟到写入仍由 t13b/task04 实施，不把这个提交视为整个保存链路完成。
- t142 独立审查当前 Mail 未提交候选，限定有效窗口分页、发送和账号代边界。Graph 通知口径不在本轮自行改定。

- t143 已将五个新增提交推送至 `feature/issue-fix`，并用 `git ls-remote` 确认实际 SHA 为 `7b6ef95a5b9cb365a9a14b8adbd468cfb04acacd`；main 仍为 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。日志 `temp/final-audit/reviewed-commits-push.log`。当前未提交保存/Mail 候选未推送，最终组合验收未完成。
- 本地提交 `a1d3fd9a` 保存同包验收包装器、候选身份/清理 helper、D09 外部任务同步、Git 模块凭据与 Web 终端/卡片场景。当前六个 TS 文件定向 oxlint/oxfmt 检查及包装器 `bash -n` 通过；此前 t134 的 E2E 差异类型检查覆盖这些文件。没有运行新候选包 E2E，不能记为三组联验通过。此提交尚未推送。
- t142 独立审查新增三项 P2（超过删除证据限额后少补位、逐封核实阶段缺续跑进度、MIME 构建后发送授权未再核对）及一项 P3（工作台自身降权事件取消刷新）。静态发现已交 t144/task01 先写回归，尚未复现或修复。报告 `temp/final-audit/t142-report01.md`；S4.2 与发送候选继续待签收，S5.2 仍待用户语义决定。
- t13b/task04 实施跨代实际写入对账后，t145 `document-session.test.ts` 62/62 通过；t146 Notes 包类型检查通过；三个本轮文件定向 oxlint/oxfmt 检查通过。日志 `temp/final-audit/save-reconcile-{check,types}.log`。t147 定向独审进行中；档案页冲突动作及退出真实界面未运行，未记为包验收通过。

### 2026-11-23 保存调用方与 E2E 静态复核

- t148：`flock /tmp/huhu-heavy.lock pnpm exec tsc --noEmit -p temp/final-audit/tsconfig-e2e-diff.json` exit 0，状态保存于 `temp/final-audit/save-callers-types-status.json`。
- Lead 复核当前 13 份 E2E diff；保留性能阈值与业务断言，调整当前 UI 标签、Core 延迟启动前置条件，增加同包身份与跨入口结果检查。发现并修正 compact commands 的空 fixture 绑定和 finally 覆盖异常问题；compact inbox 仅格式化。新用例尚未运行，不记作行为通过。

- t147 保存独审完成：两项 P2 时序缺口（keepDraft 切代跳过留稿、同代未知实写与旧 load 取样）及一项 P3 笔记冲突动作；t13b/task05 先补失败回归。62/62 仅代表既有测试通过，模块仍未验收。
- 已保存 E2E 候选提交 `a1d3fd9a` 与 `fa5d5c3a`，尚未推送，不表示已跑真实 E2E。

- t149 push exit 0，远端实读 `feature/issue-fix=fa5d5c3acfbfdbeb49b2e55e41048160ecac7537`，`main=4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。日志 `temp/final-audit/acceptance-save-push.log`。只保存已提交候选，不包含尚在返工的 Notes/Mail 差异，也不代替实际 E2E 验收。

- t14b：修正 compact commands 清理后，定向 E2E TypeScript 检查 exit 0；两份改动文件 oxlint、oxfmt 检查通过。状态和日志保存为 `temp/final-audit/e2e-cleanup-types-{status.json,log}`。

### 保存独审竞态的实际红灯

- t14c：`flock /tmp/huhu-heavy.lock pnpm exec vitest run plugins/notes/test/document-session.test.ts -t "切 Vault 的留稿跨对账|同基线保存落盘后回执失败"`，2 failed / 62 skipped。前者留稿没有实际写入却成功结束；后者尚未接纳的旧读取样本造成假干净，退出未留下 `X@baseVersion=2` 草稿。日志 `temp/final-audit/save-review-races-red.log`。
- t13b/task06 仅修复这两项及笔记页未知冲突操作；现阶段不记作修复通过或真实 UI 验收通过。Mail t144/task01 仍在写独审失败回归。

- t14d Mail 新增三条定向回归：3 failed / 4 skipped。删除证据裁剪后缓存199封、冲突核实重启重复18项并再次超预算已实际复现；发送一项停在 `graphSend:false` 的前置断言（实现省略该可选字段），暂不记为发送竞态已复现。已交 t144 修正夹具后复跑第三项。日志 `temp/final-audit/mail-boundaries-red.log`。

- t14f：修正只读 OAuth 前置断言后，发送竞态实际复现：MIME 构建期间降权，但仍向回环 Graph 发出1次 POST，状态未按未投递结束。1 failed / 6 skipped，日志 `mail-send-boundary-red.log`。t144/task02 接续修复三项 P2 与工作台刷新 P3，S5.2不擅改。
- t14g：保存独审修复后完整单文件65/65通过，日志 `save-review-races-check.log`。t14h：Notes包与E2E差异类型检查均exit0，日志 `save-reviewed-types.log`；当前9份 Notes/E2E 文件 oxlint、oxfmt通过。t14j 正在只读核对三项发现关闭及直接副作用，真实 Electron 仍未运行。

- t14k：`pnpm exec playwright test tests/e2e/knowledge/session-flush.spec.ts --list --reporter=json` exit0，29项、errors为空；包含新增3项保存快照/未知冲突场景。JSON `temp/final-audit/save-e2e-current-list.json`。仅用例加载，不计运行通过。

- t14j 独审确认前轮三项关闭，但发现两项新 P2：对账期间的自动文件通知可覆盖当前撤销正文，切 Vault 的 dirty 筛选可遗漏在途写入。报告 `temp/final-audit/t14j-report01.md`；t13b/task07 补定向回归，t14m/task01 分析统一所有权约束，尚未签收。
- t14n：Mail OAuth 单文件7/7通过，包含删除证据裁剪补位、重启续核实及 MIME 构建后降权三项红灯回归；日志 `temp/final-audit/mail-boundaries-check.log`。t14p 包类型检查失败于 graph-mail.ts:328 显式 recovery:undefined；后续 E2E 类型检查未执行。已交原实施者修正，不记类型门禁通过。

- t14q：Mail包及差异E2E类型检查exit0，日志 `mail-boundary-types-recheck.log`。t14t：23份Mail TS差异格式化、oxlint通过；mail.spec.ts加载12项无错误（仅列举未运行），日志 `mail-diff-final-check.log`。t14s独审进行中。
- t14r：保存自动通知/切Vault两项回归实际失败，2 failed /65 skipped；日志 `save-active-write-red.log`。t14m只读分析定位统一在途写入所有权，t13b/task08实施，包含共享客户端响应解码未知结果的窄范围标记。

- t14v：将34项当前失败映射拆成33项源码构建复验与1项同包 workspace 验收，避免把 W8.2/W8.3 当普通源码测试跳过。`failed-source-current-list.json` 实读33项、errors=[]；`failed-source-selection.json` 保留完整旧标题映射与独立包用例。仅加载检查，不计实际通过。

- t14w：Graph接入后的共享发件箱完整单文件 `plugins/mail/test/outbox-engine.test.ts` 20/20通过，覆盖SMTP投递去重、拒收选择重试、未知结果不重投、删除/关闭竞态与新格式恢复。日志 `mail-shared-outbox-check.log`。未运行全量套件。

- t14s 独审完成：原三项P2关闭，原工作台P3源码关闭、真实E2E待跑。新增两项P3（切回Exchange仍合流旧Graph任务、只收信时发件箱仍提供立即重试）交t144/task03先补回归；尚无新红灯。报告 `t14s-report01.md`，S5.2产品语义仍待决定。

- t14x：统一活动写记录后 Notes单文件71/71、EngineClient单文件14/14通过；随后Notes包类型及差异E2E类型exit0。日志 `save-active-write-check.log`。当前Notes和客户端差异格式化、oxlint通过；t14y独立复核进行中，真实GUI尚未验收。

- t14z：Mail两项恢复体验回归2 failed /7 skipped，旧Graph未取消/新刷新合流旧任务及缺少发送权限原因均实际复现。日志 `mail-recovery-red.log`；交 t144/task04 实施，保留零POST与原收件人恢复资格断言。

- t14y 独审确认活动写保护关闭前两项P2；新增同文未知草稿重开被清理P2、字段读数待定期间外部通知丢弃P3（静态时序）。交t13b/task09补回归，尚未复现。报告 `t14y-report01.md`。85项绿灯不覆盖这两条新顺序。

- t150：未知同文草稿两次重开及字段延后通知三新实例失败，普通同文清理正例通过（3 failed/1 passed/70 skipped）；日志 `save-reopen-notify-red.log`，交t13b/task10最小持久化标记与延后核对。
- t151：Mail恢复修复后OAuth9+Outbox20共29/29通过；随后类型在message-cache事件可选id处失败，差异E2E类型未执行。已补事件边界收窄，t153复查；t152定向独审中。日志 `mail-recovery-check.log`。

- t153 Mail包及差异E2E类型复查exit0；t154 23文件格式/lint通过，Mail E2E加载13项（未运行）。日志 `mail-recovery-types.log` / `mail-recovery-lint.log`。


## t155：未知草稿与延后通知

在 agent-linux 未提交组合上串行执行 document-session 全文件74项，以及 domain-exposure.engine 中 desktop draft capabilities preserve an unknown outcome across Engine restart 1项（其余8项未选择），均通过；随后 Notes 包类型检查通过，HC退出0。日志 `temp/final-audit/save-persist-check.log`。真实 Engine 重启往返保存 outcome 标记并保留原文件；普通同文草稿自动清理正例仍通过。独立审查 t152/task02 尚待报告，实际 UI 未运行。

## t158：Mail 提示与重试候选保存

Mail 历史权限提示改为投递发生时的状态，源草稿丢弃时给出无法重试说明；工作台用例等待草稿查询后再核对只接收门禁，并实际选择原收件人发起一次重试。t158 两文件格式和 lint、Mail 包类型检查及差异 E2E 类型检查通过，日志 `temp/final-audit/mail-retry-ui-types.log`。此前 t151 的29项后端检查仍适用；这次未改后端。Mail 源码、夹具、E2E 与来源记录保存为 `25f5866b`，实际 E2E 和 S5.2 通知口径仍待验/待定，不能签整个 Issue 通过。

Notes t152/task02 关闭 task10 的原两项缺陷，但发现保存新正文误删未处理未知草稿、明确放弃不删除持久稿、档案页面缺少草稿操作入口；t13b/task11 正在补回归并修复，t155 绿灯只覆盖其既有范围。

远端保存核对 t159：`feature/issue-fix=25f5866b00d2fabdcd04c3802f083e66e24d3d83`，`main=4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。未将 Mail 候选推至 main，未发布安装包。

## t15b：草稿操作定向验证

t13b/task11 的修前筛选4失败、1通过，最终筛选10通过，日志 `save-draft-actions-red.log` 与 `save-draft-actions-green.log`。Lead t15b 在同一当前差异上执行完整 document-session：81/81通过，随后 Notes包类型、差异E2E类型、14文件格式和lint均通过，退出0，日志 `temp/final-audit/notes-draft-actions-check.log`。普通保存保留未处理未知草稿，明确放弃只删除当前缓冲关联草稿，档案恢复/丢弃入口已写；真实页面两条新增E2E未运行。t152/task03正在核对这三项修复关闭。

## t15c 与 t152/task03

Notes候选 `ce3a3b7b82410ea1e25cb2955df4140fa2b934bc` 已推送 `feature/issue-fix` 并用 ls-remote 核对；main仍为 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。独审关闭原保存误清、单会话明确放弃和档案入口场景，但指出跨工作台替换草稿可能被当前确认删除，以及Engine吞掉草稿读取异常会假成功。两条仅有源码证据，交 t13b/task12 先复现再修复。尚未开始新组合构建/包验收，不签最终通过。

后续定向源码运行脚本准备于 `temp/final-audit/run-targeted-source.sh`（failed/notes/mail三组），要求固定完整SHA和干净工作区，沿用隔离HOME/XDG/DBus/Secret Service/Xvfb与重型锁；目前仅bash语法检查，未执行E2E。组合门禁脚本 `run-combined-gates.sh` 同样尚未执行。

## 80db95d0：草稿身份关闭与收尾候选

t13b/task12 实际修前会话2失败、Engine2失败，修后会话83/83、Engine定向4/4。Lead t15f Notes及差异E2E类型通过，格式失败两处；格式修正后t15g四文件格式/lint通过，完整domain-exposure.engine 11/11通过，包含CLI/MCP默认关、授权、撤销、重启与旧外部版本行为。日志 `save-draft-identity-session-{red,green}.log`、`save-draft-identity-engine-{red,green}.log`、`notes-draft-identity-types.log`、`notes-draft-identity-recheck.log`。

独审 `t152-report04.md` 确认两项关闭和直接兼容通过。代码保存为 `80db95d0`；没有追加新功能。后续使用包含本记录的固定HEAD运行串行门禁、构建和定向真实入口验证。未重跑全量Vitest或全量E2E。

## 2026-11-23 03:51 后续缺陷复核（尚未提交）

固定05a748b6候选包经修订的测试身份检查进入Web业务流程后，浏览器保存正文已落盘，但桌面已有编辑会话仍显示旧正文。Engine的notes.save仅发布实体通知，本进程写入又被watcher过滤，NotesModule订阅的vault.fileChanged因此缺失。integration/impl/huhu-acceptance-followup补发规范化路径通知；新增真实Engine两会话回归先2失败、后2通过。规范化路径及现有会话回归合跑85/85通过（t165，temp/final-audit/document-events-normalized.log）。未重新构建或运行修复后的Web界面，不能记为端到端通过。

候选身份检查原读取/proc/PID/environ的两项路径在实际Utility进程不成立；Main实际profile/runtime正确且其metrics登记同一EnginePID。改为联合核对Main、metrics创建时间、Vault端点和既有包哈希，独审t15w/task02无阻断发现。诊断沿用05a包和未提交测试helper，不能计为新源码最终包验收。

增量索引t163/task01返工在同一工作树完成，19项单文件测试通过；24文件夹具记录0次目录枚举、24次目标lstat，尚待复审及实际性能/退出路径复测。终端吞吐测试修复searchbox定位与按键开始时刻纳样，等待窗口内慢样本完成；原至少10样本和100ms阈值保留，独审t15y/task02进行中。

模板派遣空数组现象正在t164用原05a包抓取脱敏的检测、受理summary和发生原因；尚无结果。SSH保持暂停。本批未提交，远端候选仍为05a748b6，main最后核对4ae7e7e4。

03:55模板诊断收尾：t164明确runNow summary processed=0/skipped=1，detector installed=false，发生issue=cli-missing。测试夹具配置常规Codex command为同一哈希锁定ELF、刷新检测并断言路径后，t166在原05a包上T7.2完整1项通过（1.8分钟）。保留原意图重交、唯一派遣、原生问题与回执及新模板唯一结果断言。日志template-pinned-check-05a.log；报告temp/candidate-acceptance/tasks.0fILPQ/result.json；附件template-pinned-artifacts-05a。属于测试夹具修正后的旧包诊断通过，最终组合还需对应新提交。

独审t15y/task02发现Notes回执后自身通知会把后续输入误判冲突，已分配t169/task01修复并补时序回归。终端测试另加覆盖断言：次数或时间上限先于洪流结束时直接失败，不允许只用前半段样本通过。

04:02 D09 tools-web复核：t16b/t16c越过身份校验后暴露夹具无差别传通用intent-key，tasks.read与按版本更新的tasks.update不支持该字段。只向tasks.create传该键后，t16d全部业务断言通过，但清理失败。helper在Electron关闭后再次调用app.process()，Playwright客户端已销毁实现映射；改为启动时保留Main PID，仍核对真实进程退出和描述删除。t16h整例通过，包含CLI创建、MCP修改、桌面与Web同任务同版本刷新、重开、撤权及退出清理。日志tools-web-cleanup-check-05a.log，附件tools-web-cleanup-artifacts-05a。t16f Agent定向类型通过，t16j七个受影响E2E及preload声明类型通过。所有结果仍为05a包+未提交测试修订的诊断。

增量索引独审t168/task01发现大小写不敏感卷的仅改大小写旧路径清理回归，交t15t/task02修复；t168/task02转审Agent控制权接线及候选测试修订。t169/task01正在修复Notes迟到自身通知，Lead执行真实Engine红灯t16g失败符合预期。当前未进入重构建、推送或main落地。

### 2026-11-23 04:14 旧组合包诊断与审查返工

仍以 05a748b6 / AppImage 44eb01b894a4b81a17c27132b8aab29c98894f52340c5129036c1d5ae90c49d1 配合未提交的修订验收用例运行，不能替代下一组合版本的最终验收。

- t16m：native 2、rule 1、git 1 通过；Web terminal 原 2 通过、1 失败，失败点是后台尺寸采样尚未生成 baseline，协议探针未开始。日志及每组产物见 `temp/final-audit/diagnostic-{native,rule,git,web-terminal}-05a.log` 与对应 artifacts。
- 本机真实 bash PTY 最小复现证明后台 stty 采样被 SIGTTOU 作业控制暂停；仅在采样子 shell 忽略该信号后正常返回。保留交互 shell、实际尺寸连续 20 次采样、原始观察者输入与 resize 拒绝、原会话接管和刷新断言。t16p 修订夹具后 **3 通过**；日志 `temp/final-audit/diagnostic-sampler-web-terminal-05a.log`，产物 `diagnostic-sampler-web-terminal-artifacts-05a`，原始 JSON `temp/candidate-acceptance/web-terminal.4wf77g/result.json`。
- t16k Notes 延迟自身通知实际 Engine 集成 **2 通过**；t169 会话文件 **87 通过**。t16n 独审仍发现自身通知额外读盘拖住成功保存及读盘错误误报保存失败，已交 t15t/task03；未宣布该修改最终通过。
- t15t/task02 大小写改名修复单文件 21 通过，t168/task03 独审中。t168/task02 发现删除最后未知审查意见后的只读恢复缺口，同交 t15t/task03。新源码尚未构建、打包或最终真实 UI 复验。

### 2026-11-23 04:19 索引轮询复核

t168/task03 发现旧名在后续轮询编辑时重新出现。Lead 将 VaultWatcher.poll 已枚举的精确快照交给 flush，避免以旧拼写重新查到同一文件；原生事件仍按目标读取。两个大小写改名用例扩展到真实 watcher 多次轮询与后续编辑，先得到 2 失败/19 通过，再运行索引与 watcher 两文件 **29 通过**（t16r/t16s）。Vault 定向类型 **通过**（t16t）；Web terminal 修订用例定向类型 **通过**（t16q）。日志位于 `temp/final-audit/index-polling-case-{red,check}.log`、`vault-polling-types.log`、`web-sampler-types.log`。大小写不敏感查找仍为 Linux 定向模拟，未代替 Windows/macOS 原生卷实测。t168/task04 独审中。

### 2026-11-23 04:29 已审候选保存

t168/task05 已独立关闭 Vault 暂扣创建与轮询交叉的旧名复活、Agent 删除最后未知意见后只读恢复两项 P2。新增 watcher 夹具使用真实订阅根的规范路径，`TMPDIR` 符号链接定向回归 t16z 通过。对应已提交 `d1432fd3`（索引及监听）、`383a385e`（审查输入及忙碌网关）、`c0870297`（候选身份/旅程测试）。t170 推送并实际核对远端 `feature/issue-fix=c0870297c816f9205d264f00d209399a8c5f54e8`，`main=4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。

Notes 每次 writeId 的首轮 91 项、Engine2项、contracts/Notes/Agent定向类型通过（t16v/t16w）；独审 t16n/task02 又发现跨重载旧成功回执登记 writeId 晚于基线守卫，可能让旧自身通知拖住下一保存，t15t/task04 正修此明确缺口。Notes 代码未进入上述提交，仍保留工作区。新组合构建与最终 UI/包联验未完成。

### 2026-11-23 04:33 本轮返工关闭

t15t/task04 跨重载反例 2 红灯后最小调整成功标识登记顺序，会话 **93 项通过**。t16n/task03 用相同阻塞读盘和错误读盘探针独立核对，两个跨重载反例关闭，真实其他来源更新仍读取并接纳。t171 Vault/Notes 定向类型通过，之前 t16w contracts/Notes/Agent 定向类型通过。两份最终独审报告为 `temp/final-audit/t168-report05.md` 与 `t16n-report03.md`。本轮源码冻结后进入串行构建和受影响 UI 复验；这些源码证据尚不能代替新组合包验收。


## 2026-11-23 固定 4a54f0a9 的定向 UI 复验

应用源码和 `apps/desktop/out/build-info.json` 都为 `4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73`；t173 组合构建退出0。t174 在隔离 HOME/XDG、DBus、Xvfb 和 `/tmp/huhu-heavy.lock` 下串行运行以下三组，未重跑全量。驱动 `temp/final-audit/run-followup-groups.py`，原始日志 `followup-{failed,notes,mail}-4a54f0a9.log`，对应产物保存为 `followup-{group}-artifacts-4a54f0a9`。

- 原失败集11项：3通过、8失败。H05撤销空提交、Agent审查输入和网关能力交互通过。四项性能仍超标；终端10MiB得到5个窗内样本（p95 29.7ms），因不足10个样本失败，不能签吞吐通过。自动化结果展示、两卡权限夹具、Agent设置冷缓存夹具另有3项失败。
- Notes文档/看板关窗组：31通过、1失败。失败的“两篇笔记切Vault”在初次 `engineReady` 等待20s时即无元素，未进入保存操作。独立保全 `followup-notes-two-doc-evidence-4a54f0a9`。t177随后使用相同应用构建、仅加失败页面诊断附件重跑原单项，1通过（11.8s）；说明本轮未复现启动失败，不代表间歇启动问题已修复。
- Mail工作台组：13项全部通过，覆盖Graph降权读取与停发/再授权重试、同步取消、恢复原批次、OAuth浏览器回执、通知定位、草稿保留、原生附件及Web 9MiB上传、单信图片许可。包装命令退出1是退出trap删除临时目录时 `Directory not empty`，测试自身13通过；清理异常单列，不改成整条命令通过。t177也有同类清理异常。

任务滚动的两类失败分开保全：10个66–133ms帧间隔导致原断言失败，随后 `app.close()` 的 Close context 无返回，约54秒后用例总超时。trace `followup-task-scroll-evidence-4a54f0a9/trace.zip` SHA256 `bc64972e7f19725504dae06698fbc0e0a52d39264c69d9e47769dc9443a4197c`。t175只读报告给出分段剖析方案，尚无CPU采样证明具体热点，不把05a与4a的单轮差值作为性能改善。

t176只读诊断核对：持久结果需要等5s扫描再投递；能力目录响应拦截在途使卡片一直等待权限；Automations启动主动探测提前填了Agent版本缓存。限定修复已派发。t179真实Engine两条回归均红灯：收件后仍pending、扫描中到件未及时再投递，日志 `task-receipt-wakeup-red.log`。不延长原正文断言来隐藏投递等待。t178正在准备不改变正式阈值的可选性能取证和更低往返开销的真实键盘采样。

远端最后核对 `feature/issue-fix=4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73`，`main=4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。没有4a的新安装包，也未完成最终共同候选签收。#7继续暂停。Graph S5.2旧邮件移回收件箱是否通知的规则已再次通过异步问题请求用户决定，其余工作继续。

后续 t17b 对即时唤醒修复运行完整 `persistence-http.test.ts`，40/40通过（15.85s），日志 `task-receipt-wakeup-check.log`。独立并发审查与新构建UI复验尚未完成。

### 回执唤醒独审和夹具复验

t17c/task02 关闭 ACK 同步扫描问题：最终实现只登记合并后的延后检查，保留原持久 ACK 和唯一评论路径。t17f 两条定向回归通过（38 项过滤），t17g Tasks 定向类型通过。独审另指出首次查询无缓存和正文缺失的反馈不完整，已交 t176/task04；新生产结果 UI 仍待构建后验证。

t17d 用相同 4a 应用和修正夹具运行权限卡片及 Agent 设置三项，3/3 通过（19.4s），包装命令退出0。日志 `temp/final-audit/ui-fixture-diagnostic-4a54f0a9.log`，对应 artifacts 已保存。该结果不覆盖尚未构建的 Tasks 改动。

t17h 新性能诊断探针定向类型发现3项错误：可选 requestId、首尾 taskId 传入 undefined，以及 Electron 对话框 BaseWindow 重载。尚未运行新探针，已派发修正，不计为性能通过。

### 诊断收敛与已审改动保存

t17j 性能探针定向类型通过。t17k 固定4a应用诊断中1000个文件通知触发1002次 tasks.list（3+720+279），滚动2次超过66ms、最大133ms；结束采样时668个请求尚未结束。退出进入 flushing 后 home.focus.get 发出但未完成，3秒后主进程显示“无法确认退出前的保存结果”对话框，最终测试60秒超时。原始日志 `task-scroll-diagnostic-4a54f0a9.log` 及 `task-scroll-diagnostic-artifacts-4a54f0a9` 已保全。正在修复重复查询；尚未证明修复后时延。

t17m 终端探针在约3495.6ms发出400个按键后提前停止，其中395个窗内事件，尾标尚未到达；失败不能解释为性能不达标。原始日志 `terminal-flood-diagnostic-4a54f0a9.log` 与 artifacts 已保全，按原20秒界限修正驱动次数上限，不改变输出量或延迟阈值。

t17c/task03 关闭两入口加载反馈低项，定向格式/lint和已有类型证据通过。Tasks及夹具已保存到提交 `5aeac32e`；未构建这些生产变化、未完成最终包验收。

t17p 在同一4a应用完整终端负载通过（17.1s）：首输出到尾标10372.2ms，1311个窗内真实按键，三等分372/431/508，p95 32.4ms、最大44.0ms，完整10485760字节尾标。仍使用20秒时限、原p95≤100ms及≥10样本要求。日志 `terminal-flood-window-check-4a54f0a9.log`、产物 `terminal-flood-window-artifacts-4a54f0a9`。包装退出0同时报告 CLEANUP_INCOMPLETE，临时目录残留单列。此结果是4a构建基线，不替代未来共同包验证。

t17n 已核对远端 feature/issue-fix=`5aeac32ee00e0f3d5cfd2faf4e27f1840762865c`，main仍`4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。

### 事件查询合并候选

t178/task03 单文件回归24项通过：真实 QueryClient/QueryObserver 下，1000事件旧实现触发1000在途调用的反例失败，新实现合并为2次并得到最终1000版本；覆盖冷加载、缓存移除重建、错误/取消、观察者停用和不同Vault。t17q Workbench定向类型退出0。t17c/task05独审中，尚未构建，不将单元请求数替代真实千行滚动和退出证据。

t17c/task04独立复算终端原始附件确认1311个真实输入、p95 32.4ms及完整尾标；补充现有值变化/input事件断言防止未来空按键通过。当前基线数据满足新断言，未为该断言重复运行同一基线。

t17c/task05独审确认普通查询合并，但复现权限/插件目录在途请求收到撤销事件仍等待旧请求，并指出scope中止只处理未开始补刷、没有及时结算已开始刷新等待。两项已交t178/task04；安全缓存同步移除未退化。当前24项绿灯不能覆盖上述缺口，查询实现尚未验收。新构建推迟到返工独审完成；perf驱动真实输入低项已独立关闭。


## 2026-11-23 查询合并返工与终端夹具环境

`a97ece844bfdbc132b2d17a83bfb127610ffdeb4` 已推送 feature/issue-fix（t17v回读），main仍4ae7e7e4。普通事件合并当前请求后的补刷；权限与插件目录仍即时失效重查；作用域中止只结算自身等待。t178/task04及t17c/task06独立单文件29项通过，t17t Workbench类型检查通过，定向格式与diff检查通过。实际新构建滚动与退出尚待验。

t17s在固定4a应用运行新终端夹具，568个窗内样本，p95 32.9ms、max44.1ms，1项通过12.2s；Core停止及PID/socket退出检查完成。日志 `temp/final-audit/terminal-flood-cleanup-check-4a54f0a9.log`。包装随后报告临时HOME清理不完整，因此不记整体验证完成。

t176/task07只读确认诊断runner在env -i和隔离HOME下仍继承宿主Volta shim PATH，空注册触发同名外部命令递归。Lead按逐成员精确HOME核对后回收测试Electron进程组2210964，复查同HOME活进程0。记录 `temp/final-audit/flood-cleanup-incident.md` 与 `t176-probe-analysis.md`。两个后续runner已限定固定Node及/usr/bin:/bin，系统依赖存在、bash语法通过；尚未复跑，不将路径修正当作真实清理通过。独审另提出测试总超时后的独立清理预算，t178/task05正在修复。暂停重型验证直至返工完成。


后续 t17w 在纠正PATH后，旧4a应用20秒内没有尾标，测试失败；4339个窗内键入不替代完整输出要求。独立teardown附件desktopClosed/coreStopped/directoryRemoved全true，外层无清理错误。t17x使用同一fixture并将测试总时限注入为5000ms，结果timedOut，Core已启动且上述三段仍全true；这是超时清理的正向证据，不记性能通过。原始报告分别为 `temp/issue-evidence/huhu-2026-11-22/followup-flood-4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73.qKbH7D/result.json` 和 `followup-timeout-flood-4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73.Ug0KV3/result.json`；trace另保全integration/temp/final-audit/flood-{isolated,timeout}-cleanup-artifacts。t17c/task07提出取消后续动作边界，t178/task06正在补齐。旧残留目录已在同HOME进程0复查后删除。

终端fixture最后取消边界由t17c/task08复审关闭（blob f0abccd5efaa0d97c6186f4c9e73805f28486b6e）。t178/task06定向类型/语法/lint/format通过。保持20秒尾标和原性能阈值。进入固定组合构建，后续新版本结果另记。


## 固定da645ee8构建复验

t17y clean组合构建通过，t17z核对远端feature=da645ee844f98f99dd2175b31b1e54f6714490e3，main仍4ae7e7e4。t180受影响性能用例3通过/2失败，另3个F09扩展旅程按现有开关跳过，非全量。通过：1MiB文档444ms；80次输入p95 11.6ms；1000任务滚动最大帧间隔50ms，0次>66ms且退出完成。失败：inbox插件启用472ms>300ms（冷启1984ms、停用15ms），终端20秒无尾标（2956窗内样本）。不得把终端部分响应读数算完整通过。产物 `temp/final-audit/query-fixed-perf-artifacts-da645ee8` 和日志 `query-fixed-perf-da645ee8.log`，原始JSON在 `temp/issue-evidence/huhu-2026-11-22/followup-perf-da645ee844f98f99dd2175b31b1e54f6714490e3.nOaIGz/result.json`。

t181同构建任务结果完整旅程1项通过13.1s：自动化Agent规则经Tasks派遣，运行页显示已完成及结果，定位原会话。日志 `temp/final-audit/query-fixed-task-result-da645ee8.log`。包装无清理错误；后续性能问题分别由t178/task07和t176/task09定向调查。仍未满足整个批次交付。

### da645ee8 终端分段与插件网络诊断（t182 / t183）

固定应用 da645ee844f98f99dd2175b31b1e54f6714490e3，新增测试观测不改变阈值。t182 终端仍失败：20秒截止前 WebSocket 847308 字节，约21秒累计978380字节/161帧，无尾标；DOM原节点没有替换。截止后独立 Core terminal.read 已有完整尾标和 shell 提示，不能据此推断其在截止前何时完成。隔离 Core 与目录清理均成功。证据 `temp/final-audit/flood-stages-artifacts-da645ee8`，继续定位 attach/bridge。

t183 冷启动/插件/内存单项通过：1845ms，停用38ms/启用279ms，RSS341MiB。前次472ms失败仍保留。网络观测：能力目录响应14184843字节；停用后目录首字节约232ms，随后的启用请求 requestStart约220ms、responseStart约237ms。时间线表明请求发送前等待，但尚未单独证明目录生成或解析各自成本。证据 `temp/final-audit/plugin-network-artifacts-da645ee8`；未用一次通过代替波动分析。
