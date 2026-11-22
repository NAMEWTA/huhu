# #4 W1.1 与 W1.2 Windows 启动和对账独立审查

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t54
- task — task04.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/task04.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/report04.md
- 执行身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t54
- 执行结果 — done

## 结论

| 增量 | 规格轴 | 规范轴和合入建议 |
| --- | --- | --- |
| W1.1 `5cda8418c5a278ee7c60b58599e28359949dd945` | 上轮超长 cwd 预检缺口已修复。短扩展路径和普通中文含空格目录实起通过。 | 可单独合入 Windows 后端预检及夹具。复用同一目录/命令解析。完整交互生命周期仍待验收。 |
| W1.2 `db0a562fd7c15a031509e7ac1477228de5e4bfd3` | 记录完整时，真实丢回包后可找回原操作及进程。记录截断时，同请求会启动第二个真实进程。缺状态的候选也会绑定。 | 会话 JSON、Core 标签和错误合同保持原模块所有权。持久去重仍有 P1 缺口。修复后再完成 W1.2 验收及接入 W6.1 new。 |

核对 `ce5289ddd1ae5713167f6987fe6db53c3beef51f` → `5cda8418c5a278ee7c60b58599e28359949dd945` → `db0a562fd7c15a031509e7ac1477228de5e4bfd3` 的两个直接提交。W1.1 两文件，W1.2 七文件。Windows x64，Node 24.21.0，Vitest 3.2.7。三个版本从 Git 对象归档，第三方依赖复用 Windows 集成安装，工作区包各指向冻结源码。集成锁额外登记了本轮命令未用的 `tsx`。 [上轮独立审查](report01.md) · [t80 交付及生命周期证据](../t80/report01.md)

## 规格轴

### W1.1 · Windows cwd 预检通过

- 在 `ce5289d` 复现同一长目录错误。用三个 95 字符子目录构造真实存在的 390 代码单元扩展路径。合成 `.cmd` 预览成功，实际启动返回 `HERDR_UNAVAILABLE`、Windows 267，隔离 Core 仍可用。
- `5cda841` 冻结夹具对真实存在的 259 和 300 代码单元目录验证普通盘符及扩展拼写。两入口均返回 `INVALID_INPUT / stage=cwd / reason=windows_cwd_too_long / maxLength=258`，Core 未启动且会话列表为空。附加实机探针在 `db0a562` 启动了 258 代码单元目录中的合成 `.cmd`，退出 0，进程自读 cwd/argv 与预览相等。
- 三树夹具均在普通中文含空格目录启动 PowerShell 与合成 `.cmd`，机器、目录和参数相符，argv 内的 `two words` 和 `带 空格的提示` 各为一个元素。两根进程退出 0。短盘符扩展路径被转换为可执行的普通路径。
- C01 的返回 shell 采用 t80 的既有见证。直接跑合成 Agent 退出 7 时，Core 将终端标为 finished，keep 开关结果相同。PowerShell `-NoExit` 包装能继续接受人工输入，Core 根进程仍在运行，Agent 子进程退出码 7 只能由包装层读取。候选目前采用直接启动。真正 UNC、安装包 GUI PATH、真实登录及交互 Agent 返回 shell 仍属完整 W1.1 验收。 [W1.1](../../../../dev/changes/2026-11-19-issue-4-agent-cli/tasks/W1.1-launch.md)

### W1.2 · P1 受理记录不可读时会绕过原 launch 去重

在真实 Core 0.1.19 上先丢弃合成 `.cmd` 成功创建的回包。经过第一次 Vault 重开，候选已在原 session 上找回原进程。保持原进程运行，关闭插件与 Vault，将唯一对应的会话 JSON 截断为 `{"id":`，再重开同一 Vault。提交完全相同的 launch 参数及网关键。实际返回成功，并创建另一个 session、attempt、terminal address 和 PID。锁定 Core 的独立客户端确认两个进程同时 live，共用同一个 `huhu.launch`。两个终端随后在隔离 Core 中清理。

根因是展示列表对不可读 JSON 作跳过处理，启动去重也直接用该列表按 requestId 查询。原记录损坏时，查不到记录即判为新请求。即使原进程仍带完整标签，该分支也未查 Core。应把损坏/无法定位的持久请求留为待核实，或者维护按 requestId 可验证的索引，并用故障注入证明同请求永远只启动一次。定位 `plugins/agent-cli/src/engine/sessions.ts:151–164,188–192,275–308`。 [W1.2](../../../../dev/changes/2026-11-19-issue-4-agent-cli/tasks/W1.2-launch-reconcile.md)

### W1.2 · P2 缺生命周期状态的候选会被确认为 running

独立协议夹具保留原 Core ID、协议代次、五标签、cwd、argv、address、PID 和 created_ms，单独省略 `state`。候选接受该条终端并持久标记 running。同一探针分别更改 cwd、argv，或移除有效 created_ms/PID，四种情况都保留 `RUN_UNKNOWN`，没有第二次 `terminal.run`。锁定 Core 本次真实回包包含合法 state，这里的缺字段属于注入的异常边界。

`processBinding` 检查地址、数值和 spawn_pending，`bind` 把其余非 finished 数据处理为 running。建议明确核对 state 和相容的结束字段，缺少状态事实时保留待查。定位 `plugins/agent-cli/src/engine/launch-binding.ts:16–23,70–77`、`sessions.ts:356–378,407–428`。

### W1.2 · P2 原 junction 消失会使同一已发送请求无法重查

在合成目录内创建 Windows junction。首次启动供 resolver 使用该 junction，夹具记录一个成功启动。删除 junction 本身，原目录和候选仍存在。重建服务并提交相同的原始路径与请求，得到 `IDEMPOTENCY_MISMATCH`，没有重发。首次指纹取 realpath 目标，重查时取找不到的原路径，且指纹比较早于允许旧配置失效的恢复分支。应保留稳定的原请求身份和已解析路径证据，使同字面请求可找回原操作，同时拒绝确有新目标解析结果的请求。定位 `sessions.ts:174–204,268–281`。

### 正常对账和负向重试实测

- 对冻结 `db0a562` 复跑真实 Core 夹具。在成功 `terminal.run` 响应到达客户端时丢弃它并断开连接，再让当次快照失败。HTTP 以外的真实 Dispatcher 入口返回 `RUN_UNKNOWN / snapshot_unavailable`，会话持久为 unknown。重建插件与 Dispatcher，关闭并重开同一 Vault，再用原 launch 和网关键重查。原 request、session、attempt、Core ID / 协议代次 1 和原 terminal address / PID / created_ms 一致，独立 RPC 只列到一个匹配终端。私有启动凭据在 JSON 内保留，公开启动与列表响应均没有该字段。
- 复跑冻结模拟协议测试。并发或重开后同键异 Space、cwd、provider、提示词、解析后 argv 均冲突。外 Vault、其他 Space、session、launch、尝试标签、其他 Core ID/协议代次、同地址不同 PID/created_ms 均未认领。空/多条/list 失败/spawn_pending/holder timeout 均保留待查且零次重发。握手前失败与明确的 `-32602 / invalid_params` 才允许沿用 session 继续启动。绑定进程的停止也校验身份，地址复用探针未执行 kill。

## 规范轴和 W6.1 前置

- W1.1 共用 `prepareLaunch`，保留现有参数和设置入口。长度常量对应本次锁定的 Windows Core。W1.2 复用私有会话文件、原子替换、规范化 hash 及 Core RPC。新字段保持在私有记录，输出 schema 继续沿用原入口。冻结差异检查、Cosmokit/Cordis 声明构建及 Agent CLI 类型检查通过。本轮未重跑 t80 的全量 Windows POSIX 可执行位与符号链接 EPERM 项。
- 当前可作为 W6.1 **新建根进程证据**的是完整记录的稳定 request/session/attempt、Core ID 和协议代次，以及通过五标签、cwd/显式 argv、地址、PID 与 created_ms 匹配的初次绑定。该证明覆盖 Core 启动的根进程。协议 generation=1 与应用层 attempt ID 分别承担协议兼容和尝试识别。
- **W6.1 new 的生产接入先解决 P1**，并补足异常候选校验。仍需实现授权的目标枚举、派遣/检查、provider 接受正文的证据、真实进程代次核验及人工/评审/任务输入所有权。冻结树没有 `agent.targets.list`、`agent.runs.dispatch`、`agent.runs.inspect`。existing/resume 另需验证 provider 原生会话资格、替代 shell/地址重用和安全的输入仲裁。不能以 `session.running` 代表 provider 收到正文，也不能把 Core hello 的协议代次当作 provider 进程代次。 [W6.1](../../../../dev/changes/2026-11-19-issue-4-agent-cli/tasks/W6.1-bound-input.md) · [跨 Issues 执行合同](../../../../dev/changes/2026-11-19-issue-4-agent-cli/design.md)

## 实跑命令与日志

每个 Core 使用合成 Vault 专用的 `HC_SOCKET`。二进制来自集成目录的 `apps/desktop/resources/herdr/win32-x64/herdr-core.exe`，运行版本 0.1.19，SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`，与 t80 一致。Git 中 Win x64 归档的锁定 SHA-256 为 `1cf7de14c862abc49b8eaeed32dc6a60d8146740edb2c244570d1a9f07cb813a`。

```powershell
# 分别在三个冻结归档，按对应组执行。live 测试设置 HUHU_AGENT_LAUNCH_TEST_BIN。
# ce5289d
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 plugins/agent-cli/test/t54-r4-long.test.ts
# 5cda841
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 plugins/agent-cli/test/launch.live.test.ts
# db0a562
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 packages/herdr-client/test/frames.test.ts plugins/agent-cli/test/launch.live.test.ts plugins/agent-cli/test/launch-reconcile.test.ts plugins/agent-cli/test/sessions.test.ts packages/contracts/test/execution-receipt.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 plugins/agent-cli/test/t54-r4-reconcile.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 plugins/agent-cli/test/t54-r4-live.test.ts
foreach ($p in 'vendor/cosmokit','vendor/cordis','plugins/agent-cli') { node node_modules/typescript/bin/tsc -p "$p/tsconfig.json" }
git diff --check ce5289d 5cda841
git diff --check 5cda841 db0a562
```

临时探针从冻结夹具派生。以下为实际日志摘录，launch、session、Core 和进程均来自合成测试。

```text
candidate/focused exit=0
 Test Files  5 passed (5)
      Tests  80 passed | 6 skipped (86)
{"isolatedId":"d295c642147aac6e527cf6651dbc8ae1","launchId":"6e5d6eef-cd8b-4df5-ad94-e0c83771730d","sessionId":"sess-mwomitheksag","attemptId":"10630148-e143-40b6-be44-afff4600517f","address":"t3","pid":18040,"createdMs":1795157662666}
T54_R4_258 {"length":258,"exit":0,"sameCwd":true,"argv":["--model","opus","--fixture","two words","boundary 258"]}
T54_R4_CORRUPT {"code":"ok","originalAttempt":"1c9912dd-ed7f-4fe7-85f0-665371c74d86","matches":[{"address":"t3","pid":14076,"created":1795157741275,"state":"live","session":"sess-mwomki4xs6mu","attempt":"1c9912dd-ed7f-4fe7-85f0-665371c74d86"},{"address":"t5","pid":41620,"created":1795157741541,"state":"live","session":"sess-mwomkibllwf5","attempt":"165f27ec-b216-4dde-a199-7520177060b8"}]}
T54_R4_FIELD {"field":"cwd","result":"RUN_UNKNOWN","tries":1}
T54_R4_FIELD {"field":"argv","result":"RUN_UNKNOWN","tries":1}
T54_R4_FIELD {"field":"created_ms","result":"RUN_UNKNOWN","tries":1}
T54_R4_FIELD {"field":"pid","result":"RUN_UNKNOWN","tries":1}
T54_R4_FIELD {"field":"state","result":"running","tries":1}
T54_R4_JUNCTION {"first":"sess-mwomkevg3e82","result":"IDEMPOTENCY_MISMATCH","tries":1}
```

旧失败复现和 W1.1 冻结夹具均通过。W1.2 附加的三个红灯依次对应重复启动、缺 state 绑定及原 junction 消失后的无法重查。四个独立 Core 均已停止，复查相应管道状态均为退出码 5 / os error 2。本轮创建的命令 pane `t10p`、`t10q`、`t10s`、`t10t` 均已关闭。原仓库业务文件与用户改动只读，未新增 Git worktree。

## Lead 验收

由 Lead 追加。
