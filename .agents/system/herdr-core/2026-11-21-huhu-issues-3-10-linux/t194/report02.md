# t194/task02 候选包 Gateway 与关窗用例独审

Lead `t3p`，审查者 `t194`，状态 `done`。审查对象为未提交的 Gateway、close 两份 spec 和包装器对应差异。期间包装器加入 `external-agent` 分支，本报告按要求覆盖 Gateway、close。工作树基准为 `17ce3c60f38ac769ef8dd6b5b56c78e2efe21074`。

## 发现

1. **P1｜Gateway 的 503 故障注入无法使已打开的 ASAR 入口消失。** Engine 在候选 Electron 的 Utility 进程中使用 `app.asar/out/renderer`。分享启动先 stat `index.html`，首次 GET 200 又打开同一入口。Electron 44.9.1 按路径缓存 ASAR 对象和解析后的目录，持有原文件描述符。后续 `statSync` 仍从缓存目录返回入口，`createReadStream` 的 `fs.open` 读取已缓存的复制件或从持有的归档取出内容。Linux 同目录 rename 保留已打开的 inode。生产 503 只在静态文件中间件查不到入口并落到下一处理器时产生，当前注入阻断这个前提。按源码可预期第 62 行仍得到 200，实际响应待 Lead 运行确认。以独立可移走的物理入口为注入点，保留启动后同一 listener 的 200→503（状态及错误正文）→200，并记录注入夹具与原包的关系。将入口在启动前移走只能验证 `assets-unavailable` 的启动分支。 [注入及恢复](../../tests/e2e/workflows/gateway-package-boundaries.spec.ts#L55) · [生产资源目录](../../apps/desktop/src/main/engine-supervisor.ts#L137) · [启动校验](../../packages/kernel/src/server/web-share.ts#L98) · [503 路由](../../packages/kernel/src/server/web-assets.ts#L24) · [Electron ASAR 缓存与 stat](https://github.com/electron/electron/blob/v44.9.1/lib/node/asar-fs-wrapper.ts#L379-L455) · [Electron 打开文件的包装](https://github.com/electron/electron/blob/v44.9.1/lib/node/asar-fs-wrapper.ts#L1177-L1185) · [Electron 归档复制缓存](https://github.com/electron/electron/blob/v44.9.1/shell/common/asar/archive.cc#L386-L419)
2. **P3｜关窗用例的失败清理可能跳过候选桌面回收。** 例如最终点击已触发关闭，动作因页面先销毁而拒绝，`finally` 检查 `isClosed()` 后页面仍能在 `unrouteAll`、`isVisible` 与 `click` 之间关闭。任一步拒绝会跳过 `await close()`，替换原错误并丢失候选夹具的 Engine/PID 退出、profile 删除证据。该 profile 在包装器临时根之外。`session-flush` 的复用段也有同样的写法。现有 `withFixtureCleanup` 可以让解除夹具状态和 `candidate.close` 独立尝试并保留首个错误。正常成功链路未见对应阻断。 [关窗清理](../../tests/e2e/workflows/close-package.spec.ts#L89) · [独立 profile](../../tests/e2e/helpers/candidate-desktop.ts#L87) · [夹具退出及回收](../../tests/e2e/helpers/candidate-desktop.ts#L204) · [现有清理函数](../../tests/e2e/helpers/candidate-desktop.ts#L29)

## 已核对行为

- Gateway 的复选框、批量预览、保存、刷新均走候选真实桌面控件。预览后经同一 Engine 的 `gateway.update` 提升版本，原批次保存带旧版本，UI 必须提示冲突，落盘必须完整保留两个未授权项。刷新再次保存检查一次版本推进和两项开放。新 Vault 在 Engine ready 前初始化显式关闭策略，预览显示后读取策略文件有前置条件。开始 Web 分享、创建邀请均走桌面面板，取同一回环 listener 的 origin。未命中的 JS/CSS 请求走真实静态资源路由，明确断言 404 与相同错误正文。公开静态资源可直接 HTTP GET。 [候选用例](../../tests/e2e/workflows/gateway-package-boundaries.spec.ts#L16) · [初始化](../../apps/engine/src/boot.ts#L629) · [策略版本守卫](../../packages/kernel/src/exposure.ts#L69) · [静态路由](../../packages/kernel/src/server/web-assets.ts#L18)
- Gateway 故障只会改动校验并解出的包副本。候选辅助核对归档路径和原始快照，rename 成功后 `finally` 恢复同一文件，外层始终尝试关闭候选，`afterAll` 回收私有提取目录。就地只读检查的已存 `b8f6c427` 归档中，`out/renderer/index.html` 为打进 ASAR 的 2249 字节文件。新候选归档布局依照当前 builder 配置推导。 [候选提取](../../tests/e2e/helpers/candidate-package.ts#L27) · [归档恢复](../../tests/e2e/workflows/gateway-package-boundaries.spec.ts#L59) · [builder 配置](../../apps/desktop/electron-builder.yml#L8)
- close 的两种选择沿用 `session-flush` 的 W05–W06 行为。真实 `BrowserWindow.close()` 进入窗口关闭流水线，`app.quit()` 进入 `before-quit`。首轮继续编辑验证笔记最后输入尚未落盘，保存分支只注入看板更新的错误回执，检查窗口可操作、草稿仍在、笔记未提前结算、专注继续。解除注入后保存与放弃均等待真实关闭，再按分支验证布局、完整笔记和专注状态。已查阅 `17ce3c60` 的开发版原用例两条通过记录，候选新用例仍需实跑。 [候选关窗用例](../../tests/e2e/workflows/close-package.spec.ts#L35) · [原用例](../../tests/e2e/knowledge/session-flush.spec.ts#L395) · [窗口关闭](../../apps/desktop/src/main/index.ts#L236) · [应用退出](../../apps/desktop/src/main/index.ts#L604) · [开发版日志](park-notes-regress-17ce3c60.log#L115)
- 包装器按模式开启对应环境开关，验证 Gateway 1 项、close 2 项，跳过或重试后成功不计为接受。Git HEAD、干净工作树、AppImage 哈希和包内构建 SHA 都有校验。当前未提交改动需先纳入正式候选才能走包装器。 [包装器入口](../../scripts/accept-linux-candidate.sh#L4) · [两种模式](../../scripts/accept-linux-candidate.sh#L69) · [报告校验](../../scripts/accept-linux-candidate.sh#L96)

## 版本与验证限制

| 审查对象 | 工作树 blob |
| --- | --- |
| `tests/e2e/workflows/gateway-package-boundaries.spec.ts` | `dc08d42106ab9507759577575947c5f7a444b925` |
| `tests/e2e/workflows/close-package.spec.ts` | `06979bddb64f8f771e445e6ee8f99a379fda8b39` |
| `scripts/accept-linux-candidate.sh`，含并行加入的 external-agent | `89c53f154d06688ef6ae035960e53970989a37b4` |

核对源码、依赖与现有开发版日志，完成只读归档头检查和包装器 `git diff --check`。Gateway 定向类型与 lint 结果沿用 Lead 的 t198 回报。close 定向类型、lint、format 与 `bash -n` 沿用 t199 回报。本轮未启动 Electron、未运行 E2E、构建、打包或全仓检查，未编辑业务或测试文件。
