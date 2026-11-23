# 原生历史任务派遣实施报告

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- Lead / terminal — `t3p` / `t1dd`，本机默认 Core
- 任务 / 报告 — `t1dd/task01.md` / `t1dd/report01.md`
- 执行结果 — 实施交付完成，产品验收待 Lead。工作目录为 `/home/wta/projects/huhu` 的共享 main，复核时 HEAD 为 `cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2`，产物在未提交增量中。

## 产品入口与支持面

普通用户可以通过已有交互入口生成持久来源。部署先在 Engine 宿主配置固定 Linux x64 Codex 0.170.0、受控 helper 和独立的 `HUHU_CODEX_DISPATCH_HOME`。Linux 私有目录归当前用户且无组和其他用户权限。用户在 Agent CLI 设置的 Codex 自定义环境变量中将 `CODEX_HOME` 指向同一目录，按现有本机 Agent 设置使用该固定二进制。然后在要保留的 Space 正常打开**交互** Codex，完成一轮并退出。任务编辑器在同一 Space 的「原生历史」组显示该持久记录。用户选择记录、保存任务，再从任务详情派遣。

受控预检现允许上述唯一一个经过目录同一性检查的 Agent 设置环境变量。受控 helper 自己设置环境。受控 new 仍以 `ephemeral:true` 启动。普通默认目录、全局 `CODEX_HOME`、与其互为祖先的目录、Claude、Pi 及尚无本轮固定版本恢复证明的平台不开放此路径。未配置的默认安装仍没有受控历史可派选项。

## 实施内容

- Task 保存 provider、Space、原生 UUID、机器、Space revision 及不透明的历史来源和修订。预检要求完整身份唯一命中，旧任务仍解析并显示重选提示。派遣冻结来源配置，后续只查已接受的目标。自动扫描对恢复目标使用受控适配器，绕过普通 PATH/headless 探测。
- 在原工作目录用私有 profile 扫描并复核唯一 rollout，检查来源实体、修订、读写权限和配置。受控 helper 先 `thread/read`，再按精确 UUID 和 rollout `thread/resume`，要求返回同一 UUID、文件、目录、idle 和只读、禁网络、never 权限。首轮前再次检查文件实体及恢复后的修订。预检及启动阶段不传正文，原生选择保持 deferGoalContinuation。
- 复用现有私有启动及输入签名凭据、Core 代次、同键指纹、原轮 native 收据、问答、结果和停止机制。任务在原启动绑定就绪后才获准发送正文。等待启动时取消、任务编辑或过期重新进入 Tasks 的原状态检查。恢复后首轮输入权锁定给原 dispatch，另一个 Task 或人工／评审无法抢先；取消后该绑定进程保留原身份，可关闭后重新选择。失去确认时沿原键查询，写入意图不重复发送。
- 新用例覆盖目录 A/B 倒序和失效、受控准备只携带正文摘要。Engine 夹具新增同键相同／异载荷、原生确认延迟、取消等待恢复、首轮占用和修订失效。桌面用例覆盖编辑器选择 B、保存、派遣、确认原 Space/cwd/thread、回答原生问题、一次结果，以及 A 的原始 rollout 保持一致。

## 实际验证

- worker 运行 `pnpm exec vitest run plugins/tasks/test/agent-dispatch-executor.test.ts`，单文件 3/3 通过。
- worker 运行 `git diff --check` 和三个文件的 `node --check`，均通过。文件为 `plugins/agent-cli/src/engine/codex-dispatch-helper.cjs`、`apps/engine/test/fixtures/codex-app-server.cjs`、`temp/closeout-release/codex-resume-protocol-probe.mjs`。
- Lead 在 `t1f1` 运行固定官方 Linux x64 Codex 0.170.0 与回环 Responses 服务的协议探针，退出 0。第二个 App Server 在原 writer 活跃时得到 `-32600 already has an active writer`。原进程退出后，原 thread、rollout 文件实体和 cwd 均匹配，恢复为 idle，权限为 readOnly、networkAccess false、never。在同一文件追加一个新 turn，回环只收到一次含新正文的模型请求。实际输出为 `temp/closeout-release/codex-resume-protocol.log`，SHA-256 为 `f8c3335b9b3ae59c132747a559661aa4d730cfe1a2b7cf635e4c07f2863d2267`。
- 协议探针直接调用 App Server API。真实生产 helper、任务状态机与工作台连通以及原生问答仍须产品路径验收。探针未包含保存有活动目标的历史；helper 在恢复时传入 `deferGoalContinuation`，并拒绝首轮前观察到的意外 turn。

## 未运行的验证

Worker 未运行 Engine live、Electron/Playwright、桌面构建、打包、全仓类型检查、lint、knip 或全量测试。Lead 串行验证命令如下。

```bash
HUHU_AGENT_LAUNCH_TEST_BIN="$PWD/apps/desktop/resources/herdr/linux-x64/herdr-core" pnpm exec vitest run apps/engine/test/codex-dispatch.live.test.ts
pnpm exec vitest run apps/engine/test/task-dispatch.live.test.ts -t 'Tasks production dispatch keeps providers without acceptance evidence unsupported'
pnpm --filter @huhu/desktop run build
HUHU_CODEX_DISPATCH_BIN="$PWD/temp/issue-evidence/huhu-2026-11-22/fixtures/codex-0.170.0/codex" pnpm exec playwright test tests/e2e/workflows/task-journey.spec.ts -g 'C01 任务编辑器直接恢复所选的 Codex 持久历史并完成原生问答'
```

E2E 用两条合成的持久 rollout 作为已退出的输入，模型与产品 helper 使用实机固定二进制和回环服务。为验证普通来源的准备步骤，可另在本机固定测试 profile 通过 Agent CLI 设置并创建一条交互历史，退出后确认新任务目录可选其原 UUID。已通过的协议探针自身使用真实 provider 在隔离目录生成 source turn。

### Modern Web Guidance

- **`forms`** — 我把原生选择控件的可见标签用 `htmlFor` 和 `id` 绑定。用户选择历史后仍显式保存任务（“always associate `<label>` with its input using `for` and `id`”）。
- **`select-menu-interaction`** — 我让失效的已保存选项保留在原位置并显式提示重选，只在显示错误时把其描述关联到控件（“list that id in aria-describedby only while the field is invalid”）。

Lead 收取备用报告；产品验收尚待完成。
