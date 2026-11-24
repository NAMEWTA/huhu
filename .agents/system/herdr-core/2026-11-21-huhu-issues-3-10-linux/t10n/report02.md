# t10n · Linux 同包验收脚手架独审

Lead t3p，worker t10n，任务 task02，主机 wta-ubuntu。审查工作树 `agent-linux`，基线 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。对照 t10p 的 task01/report01，读取新增候选桌面 helper、两个 spec、包装器及相关调用者。以下结论来自静态阅读。

## 发现

### P1 · 当前包装器无法为已冻结的 4ae7e7e4 AppImage 执行这套新增脚手架

`scripts/accept-linux-candidate.sh:11–13,45–46` 要求执行工作树干净，且 HEAD 等于传给脚本的候选提交。`tests/e2e/helpers/candidate-package.ts:29–37,43–49` 又要求解包的 `out/build-info.json` 等于同一个 SHA。冻结 AppImage 对应 `4ae7e7e4`，该提交的脚本没有 `web/rule/package`，也没有新 helper。在当前工作树运行会卡在干净工作树门槛，提交脚手架后会同时改变 HEAD 与包内提交的对应关系。从旧干净提交运行则缺新增入口。证据记录的阶段明确区分冻结包和准备中的修复。 [冻结制品记录](../../../../dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/verification/linux-final-acceptance.md#冻结候选与落地)

如果目标是补验现有冻结包，建议分别固定并记录干净的验收脚手架提交、应用构建提交和 AppImage SHA，分别校验对应来源。如果下一轮计划重打包，可保留当前单 SHA 门槛，使用包含脚手架的干净提交重建一次，再让各模式共享新制品摘要。以现有包装器审查时，两种用途只能按后一种交付。

### P2 · 用例失败时，关闭与清理错误仍会覆盖主要断言

`tests/e2e/helpers/candidate-desktop.ts:27–42` 通过嵌套 `finally` 保证尝试关闭 Electron、停止 Core 和删除目录，但后两阶段的异常会依次覆盖前面的错误。启动阶段的 `:56–62` 保存了一个清理附件，附件本身若失败也会覆盖原错。正常调用点仍用 `finally` 直接等待所有清理。`tests/e2e/workflows/web-share.spec.ts:291–322` 的重开断言或 Web 断言会被 `close()/browser.close()` 的错误覆盖。`tests/e2e/workflows/automation-linux-environment.spec.ts:149–160` 中，令牌撤销失败会跳过凭据清除，关闭失败还能覆盖规则断言和撤销失败。

建议在测试边界保留最先发生的断言或启动错误，依次尝试所有已取得资源的清理。清理失败作为附加诊断，主体成功时才由清理失败判失败。可用一个必定失败的去重断言叠加 Core stop 失败和一个 Vault 准备失败核对，报告应同时保留原始原因及清理错误。

### P2 · Core 清理限定了作用域，但允许遗留 holder 或未证实退出的进程

`tests/e2e/helpers/candidate-desktop.ts:27–40` 只扫描本次随机 0700 profile 的 `runtime`，只对匹配形状的 Agent Core socket 使用绝对 `HC_SOCKET` 和随包二进制。读取 `packages/herdr-client/src/herdr-core.ts:34–43,71–79` 及 Herdr Core 的 `cli.rs:805–813` 可确认这条路径不会转到用户默认 Core，且 `server stop` 只连接现有端点。缺陷在于主 socket 已消失但 holder 仍活着时，当前正则不会枚举 holder。若主 socket 仍在但无法连接，Core CLI 也可能以退出码 0 返回 `stopped: false`。脚手架只看退出码，随后移除 profile。应用 Agent Core 的 teardown 原本只断开连接（`plugins/agent-cli/src/engine/index.ts:109–120`，`herdr-core.ts:230–234`），因此这属于夹具的清理责任。当前 helper 也未核对桌面 Engine PID 退出，已有打包 helper 提供了针对 Engine 的观测模式（`tests/e2e/packaged/packaged.spec.ts:71–103`）。

建议在业务用例内记录本 profile 实际的 Core PID、socket 和持有进程证据，检查停止回执及实际退场。可借鉴 `packages/herdr-client/src/herdr-core.ts:254–285` 对无主 socket、有 holder 的识别。诊断失败时保存该证据。保持只按本次记录的拥有关系清理。定向覆盖正常退出、主 Core 先退出但 holder 尚在，以及两个隔离 profile 同时存在时只停止目标实例。

### P2 · 身份附件能证明包与桌面主进程，缺少实际 Engine/Core 实例与 CLI 请求的对应证据

`tests/e2e/helpers/candidate-package.ts:50–61,76–83` 会记录包、归档、Core、CLI 的哈希和 Electron 进程路径，`candidate-desktop.ts:50–54` 等待 Engine 就绪后附上该信息。静态链路确实指向同一解包树。规则只断言 `agent.core.status.state === "connected"`（`automation-linux-environment.spec.ts:145–147`），桌面调用的该能力只返回连接状态与版本（`plugins/agent-cli/src/engine/index.ts:466`、`packages/herdr-client/src/herdr-core.ts:197–205`）。`apps/cli/src/connect.ts:70–91` 还允许描述文件缺失时启动随包的无界面 Engine。这个分支没有源码回退，但当前报表无法直接区分 CLI 绑定原桌面 Engine，还是曾启动另一个包内实例。规则实际使用的 `protected-launch/helper.cjs` 位于 ASAR 外，包身份附件列出的是 Codex helper，未列该规则 helper。

建议用已有的 Vault `engine.json` 和 Linux 进程证据记录脱敏的 PID、端口及执行路径，核对 CLI 前后描述仍属于桌面 Engine，和 Web/MCP 的端点一致。在私有 socket 上取得 Core PID，核对其实际可执行文件与包哈希。Web 首次和重开附件分别记录 profile、Engine 实例和同一 Vault 的身份信息，排除凭据、令牌及用户数据。将本用例直接使用的受保护启动 helper 加入身份清单。

### P3 · 规则用例无法分辨第二次实际领取的是轮换值还是旧值

`tests/e2e/workflows/automation-linux-environment.spec.ts:66,89–109,129–137` 的 shell 仅检查变量非空、写相同的计次行并输出待遮蔽值。两次运行均断言成功、`***` 及不含明文。若配置返回新 revision，但第二次误读旧凭据，所有这些断言仍成立。另外，CLI 的脱敏只检查 stdout（`:45–53`），MCP 只要求撤销后 `isError`，也会接受非授权原因的错误（`:142–144`）。建议为两份合成凭据产生不同的非秘密运行标记，断言各自被相应运行取得，保留现有遮蔽与计次。检查成功和失败 CLI 的 stderr，并断言 MCP 返回可辨认的撤销/拒绝授权原因。

## 静态核对

- **同包路径**　候选 helper 复制和校验 AppImage 后从解包路径启动，主进程实际 `process.execPath`、`resourcesPath` 和构建提交由 `confirmCandidate` 对照。桌面 Engine 使用同一 ASAR 内的 `out/main/engine.js`，Web 资源从同包 renderer 提供。候选环境没有传入源码 renderer、Engine、Core 覆盖变量。`apps/desktop/src/main/engine-supervisor.ts:68–73,133–155` 选择包内 Core，绝对路径不可运行会失败。规则直接使用候选 `resources/bin/huhu`，该脚本绑定同包 Electron、`cli/cli.mjs` 和默认包内 Engine。源码分支的 `HUHU_CLI_TEST_BUNDLE` 在包模式不读取。
- **Web 重开与隔离**　`tests/e2e/workflows/web-share.spec.ts:165–176,187–217,275–307` 使用三个独立浏览器 context；桌面退出后以新 HOME/XDG/userData 打开同一 Vault。首个 profile 仍持有 Vault，两个 close 分别清理各自创建的目录。深链接在生产 `apps/desktop/src/renderer/web-host.ts:33–43` 有对应解析，正文断言同时覆盖菜单保存、两端增量、浏览器刷新、重开和未编辑旁路文件。首次与重开共享该次包装器的私有 D-Bus Secret Service，与外部用户会话隔离。
- **Safe 和模块凭据**　`scripts/accept-linux-candidate.sh:30–51` 使用私有 HOME/XDG，`env -i` 清除调用环境中的地址与配置，`dbus-run-session` 和独立 GNOME keyring 提供 Secret Service。候选桌面和同包 CLI 取该连接。`automation-linux-environment.spec.ts:57–64,89–147` 在 CLI/MCP 配置、执行和重交前后断言 Safe 为已初始化且锁定。实际规则用 `plugins/automations/src/engine/terminal-environment.ts:198–206,523–565` 的 ModuleCredentials 领取，Engine 在 Linux 指定 Secret Service（`apps/engine/src/module-credential-host.ts:12–18`）。复用同一测试对 Safe 锁定与模块凭据的区分。Git 则仍需自己的同包证据。
- **模式与数量**　`scripts/accept-linux-candidate.sh:16–23,52–83` 的 `rule` 导出 `HUHU_RULE_PACKAGE_ACCEPTANCE=1`，只选中对应文件的一项规则。`web` 导出 `HUHU_WEB_SHARE_ACCEPTANCE=1`，选一项。`package` 启用打包配置的五项，`credentials` 按名称筛一项，`native` 两项，`tasks/workspace` 各按标题选一项。退出码与 JSON 门槛会拒绝 skipped、unexpected、flaky 和报告错误。按包装器和 helper 的临时路径模板，Agent Core socket 为 64 ASCII 字节，holder 为 80 字节，低于 107 字节边界。包装器保留与全量运行共用的重型锁。

## 未运行的验证

未运行验收包装器、任何测试或类型检查、安装、构建、打包、GUI、浏览器、Core 停止或鉴权探针。未修改候选代码，未启动子代理。以上规格断言与静态接线只说明脚手架意图，仍需 Lead 在选定候选上串行执行 Web 和 rule 以及相关失败清理检查。

## Lead 接收
P1所述旧包不能跑新脚手架属于已记录计划边界：本批还有生产修复，明确使用下一干净组合提交重新打包，不放宽单SHA校验，也不补签4ae。P2/P3返工后定向验证。
