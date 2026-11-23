# Issue 收尾与 0.0.2-rc.1 预览发布

2026-11-23 用户要求按最新代码归档完成 change、更新必要的永久知识、关闭完成 Issue，并补齐真实缺口，最后发布预览版本 +0.0.1。#7、#11、#12 明确排除；SSH 现有代码与 change 保留。版本从 0.0.1-rc.4 增加 patch 为 0.0.2-rc.1。此次授权取代此前“只交付代码、不关闭 Issue、不发布”的阶段限制。

起点：main fc43ceef5b64ca1c9a68404c9110a6ca46883034，工作区干净。起点生产源码相对 f6c4e0d5 未改变；先复核现有证据，再按变化做增量验证，不将历史全量失败改写成通过。线上账号、第二设备、Windows/macOS 实机等用户已决定自行后测，保留未验证边界。

待完成：独立 Issue 审查；归档及修链；永久知识核验；版本同步与发布验证；实际关闭 Issue；创建并核对 GitHub 预览 Release。

本次只使用主工作树；其他历史 detached worktree 不参与执行，不新增 worktree。共享编排记录：[topic](../../../system/herdr-core/2026-11-23-huhu-closeout-release/topic.md)。

## 独立审查与分流

两名 sol/xhigh 独审确认 #1、#3、#9 可按已确认范围关闭。#4/#5 缺原生历史任务派遣；#6 缺外部 Agent 普通评论、独立 Web 构建和空 MCP 包清理；#8 缺账号行操作/未读数及可调分栏；#10 缺约定的成熟网格实测选型。先前非 SSH 完成总结只覆盖已运行路径，不再作为这几项无缺口的证明。本轮按用户要求补齐后再关对应 Issue。

已归档 #3、#9 和 GitHub Issue 来源配置 change，保留原型/证据并修正仓内相对引用。#1 沿用既有归档。#2 已由维护者关闭，但原收尾 change 存在未闭环的历史验收，暂保留不伪装完成。SSH 与总批次暂保留。

## 第一批实际落地

文档提交 `cc551778` 已推送 main（纯文档提交跳过无关 CI）。GitHub #1、#3、#9 已发表评论并按 completed 关闭；评论分别为 7091650047、7091651256、7091652368，链接固定归档提交。#7/#11/#12 未操作。版本同步到 0.0.2-rc.1 尚在工作区，未发布。冻结锁文件检查成功。

复核发现任务原生历史派遣与 Mail交互等确定缺口后，重新进入定向实施。此前最终包证据依然有效，但不代表这些未覆盖能力已交付。

## 新增缺口实施与增量验证

Mail M01 和独立 Web/普通评论已交付首版代码及定向单文件回归，已完成 sol/xhigh 独立审查，Mail 发现的缺口见下文。桌面定向类型检查 t1dj 通过。独立 Web 构建 t1dk 通过；随后完整桌面构建发现共享配置在 electron-vite 打包后的目录解析偏移，已改为两个入口显式传 editorRoot，t1dp 完整桌面构建通过。Mail 两账号/分隔条及 Graph 切换取消 E2E t1dq 已通过，原始结果见下文。

原生历史派遣方案 t1d7 已核对，交由 t1dd（sol/high）实施。Dashboard 同样本网格比较由 t1d8 准备运行夹具，Lead 运行后确定生产接入；未凭静态源码宣布选型完成。重型验证串行，当前仅主工作树执行。

增量结果：t1dq Mail 3/3、t1dr Web 1/1，通过且零跳过/错误。都使用修正配置后的源码桌面产物，未称为最终安装包验收。[原始报告索引](evidence/mail-web-incremental.json)。

受影响的四个 E2E spec 定向类型检查 t1ds 通过；19 个 Web/Mail TS 文件定向 lint/format 与 Mail CSS stylelint 通过。暂存已删除的空 MCP 包后，版本同步检查确认 0.0.2-rc.1 一致。尚未运行最终全量门禁与 Release。

独立复审 t1dm 确认 #6 当前切片无代码阻断，#8 另有三项确切缺口：同账号跨目录副本选择与联系人不一致、可重建缓存错误影响账号清单、分栏偏好未持久化。已交 t1dv 修复，#8 保持开放。t1dm 在沙箱中不能写 .agents，Lead 收取其已完成临时报告，未替它接受权限提示。

网格四候选夹具首轮发现 Homarr tsconfig 未解析及 trace HTML 触发 HMR，t1dy 已停止并保留失败原件，t1d8/task03 修复夹具入口。这是测试环境问题，不是候选运行结论。

真实固定 Codex 0.170.0 协议探针 t1f1 exit0：同一持久 rollout/线程恢复后只新增一次模型请求，另一进程的活跃 writer 被拒绝。日志 `temp/closeout-release/codex-resume-protocol.log`；这是底层真实程序协议验证，尚不替代 Huhu 任务界面和 Engine 派遣的最终验收。网格第二轮入口已修复，但夹具 stage ref 生命周期导致空容器读数异常，t1f0 停止保全 trace，转 task04 修复，未作候选选型结论。

网格 t1f2 首次完整32项：20通过、12失败、零跳过；四候选卸载均出现相同5条监听差异，需要排除统一测量/驱动影响。RGL/GridStack适配仍待核对，转t1d8/task05，尚未作最终生产选型。Mail三项返工 t1dv已交付，4项定向单文件无网络用例通过；原IMAP回环用例在worker沙箱被拒，Lead t1f4复跑完整该文件及定向类型；t1f3独立复审并行只读。

Mail重跑 t1f4 messages-engine 5/5（含真实回环），类型遇到TaskEditor可空文案已修；t1f6 desktop与指定E2E types、完整桌面构建通过。t1f8 Mail正常管理/缓存故障/分栏重开3/3，零跳过。独审t1f3另外发现离场排队写入、首次权限未定及失败重试、迟到GET覆盖三项时序问题，交t1f9返工。t1f5原生Engine live1/1通过；t1dd继续把C01手工来源替换为真实provider来源。网格t1f7增量24项17过7失败，其中RGL发生Vite依赖优化reload，不能当候选缺陷；测量监听基线继续修复，t1d8/task06。

冻结网格t1fc完整32项30过2失败，RGL8/8、Homarr8/8，按design RGL优先正式转生产接入；依赖t1ff安装成功，锁新增5个包。真实Codex产生A/B持久历史的桌面C01 t1fd 1/1零跳过，选B后原线程问答一次结果，A文件不改；普通交互TUI来源步骤仍未单独实测。独立审查t1fg进行中。

### Mail 分栏保存生命周期与 RGL 初次生产回归

- t1fj Mail types、t1fm 合并 desktop/E2E types 与构建通过；t1fn Mail 3/3 Electron E2E 零跳过。权限等待、连续保存离场、失败重试、迟到读取和草稿守卫均通过，证据见 evidence/mail-lifecycle.json。
- t1fq 看板 8 项生产回归 6 过 2 失败：首拖预览位置偏差 88px（trace 复核确认尚未执行 Escape）、窄列移动把手仍显示；原日志/trace 保留 temp/closeout-release/dashboard-rgl-ui。已交 t1d8 修复，未将 PoC 的 RGL 8/8 误记为生产完成。
- t1fg 原生历史独立审查发现取消准备后 writer/输入占用未释放、停用 Codex 后首轮仍送出，以及同目录误忙/真实 writer 原因丢失、自动化资格预览不一致。报告与探针保留，t1fp 执行定向修复。

受影响 E2E 类型补纳 acceptance.spec.ts 后通过；Mail hook lint 发现一次无用 Map 展开，删除展开后 t1ft lint 通过。该调整只迭代原 Map 的已有键，savePane 不插入新键；未重跑行为不受影响的 E2E。

看板像素更新修复后 t1fw 定向types/build+8项生产E2E全过；触摸取消最终补丁 t1fy types/build及2项鼠标/触摸E2E全过。独审t1fr/task02确认触摸监听与实例清理已修，剩余P3跨格后停住占位反馈滞后交t1d8/task08。实际保存位置正确，仍按规格修复预览而非弱化断言。新增RGL依赖第三方通知 t1fx已生成通过。

t1fz 最终源码增量串行通过：desktop及受影响E2E types、Engine真实Core原生派遣1/1、扫描资格HTTP集成1/1、无证据provider回归1/1、desktop/Web构建、RGL3/3和真实Codex桌面C01 1/1（全零跳过）。RGLtask08签收；原生返工独审t1g0待报告。完整证据 evidence/history-rgl-reviewed.json。

最终静态检查：lint、knip、格式检查通过；全仓串行类型检查在 Engine 测试中发现裸 HeadersInit 类型名不属于 Node 全局，已改为现有 Headers 构造参数的非空类型。Engine、desktop、Agent 及受影响 E2E 类型复跑通过。历史列表匹配完整单文件3/3；独审追加发现 Pi 硬链接同源可重复认领，交 t1fp/task03 最小修复，最终全量测试待其冻结后仅执行一次。

原生历史最后复核 t1g0/task03 已通过，包含 Pi 硬链接 pending/运行中保护及独立文件并发。t1fp/t1g0 已验收并回收。#4/#5/#6/#8/#10 的实现 change 已移入 implemented/feature 归档，原型保留，335 份引用随目录深度修正；既有临时来源链接改为固定上游 SHA 或真实历史工件位置，过时规划代码路径标明已迁移。66 项网格原件哈希复核一致。

本轮最终全量 `pnpm test` 仅运行一次（t1g8）：189 文件，178 通过、4 失败、7 跳过；2254 测试，2217 通过、7 失败、30 跳过。7 项失败中，CLI 版本写死、刷新新增历史能力探针和 Pi 旧文案合计5项是旧测试预期，修订后两文件30/30通过（t1g9）。Tasks 公开 ZIP 恢复如今总生成新 ID，旧夹具错误预期保留 ID，正在修正；仍用低层归档读入构造复制/旧格式身份，保留原运行凭据不能跨目录认领的断言。SSH 的跳板修订失效预期 VERSION_CONFLICT、实际 NOT_FOUND 是已暂停范围的既有失败，未改代码、未隐藏失败，不宣称全仓全绿。

t1gb：Tasks 持久派遣完整单文件40/40通过，CLI/Agent/Tasks 定向类型检查与6个变更文件lint通过。没有重跑第二次全量；首轮7失败中的6个非SSH旧预期已由完整受影响文件复跑覆盖，SSH 1项保留。门禁及原始日志哈希见 evidence/final-source-gates.json。


## 最终制品与 Issue 关闭

实现已推送 main `e14bc4c790c0afb6f5e75a25bbbb740a2202be25`；#4/#5/#6/#8/#10 已附归档链接并按 completed 关闭，原 #1/#3/#9 已关闭，#7/#11/#12 未操作。Linux 0.0.2-rc.1 从该固定提交构建；同一 AppImage 的八组验收最终15项通过、零跳过，见 evidence/final-package-acceptance.json。外部 Agent 初轮2项失败是 E2E 错误向 comments.add 传通用意图键；仅删除测试调用的该参数，保留行为断言，在相同制品上2/2通过。原失败记录与一行补丁均保留，未改生产代码或伪称初轮全绿。

GitHub CI 排队未完成；全量测试保留暂停范围内1项 SSH 已知失败，不宣称全仓全绿。线上账号、第二设备、Windows/macOS 实机等依用户决定留待后续自测。
