# H7.1–2 远端目录拖入本机栏的只读诊断

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- 执行身份 — t1ys / task01.md，Lead 为 t1hr
- 工作版本 — main `793366cf`，执行结果为 done（顾问诊断完成）
- 业务验收 — [042-s4.md](../../../../dev/changes/2026-11-24-issue-inventory/evidences/042-s4.md)，仍待 Lead 复验

**最可能的故障点在双栏拖放手势到批次提交之间。** 优先验证用例在移动到目标时是否仍从 `pull` 把手发起了原生拖动，以及本机栏是否接到了可接受的释放。S7 的操作已经返回，具体中断在哪个 DOM 事件、桌面用户能否同样触发，现有记录无法判定。建议在一次定向 E2E 中先定位这条边界，再决定改用例还是改产品。

## 三轮证据

时间为对应 ZIP 内 `test.trace` 的单调时钟，单位为毫秒。原件均在项目根 `temp/dev/2026-11-24-issue-inventory/runs/lead/`。

| 轮次 | 直接观测 | 能确定什么 |
| --- | --- | --- |
| S4 | `e2e-ssh-ws-s4.log:45–49`，传输中心首个批次为 partial，紧接着读取本机 `pull/sub/pulled.txt` 得到 ENOENT。 | 当时目标文件不存在。前一段上传本来就是 partial，首行状态不能识别下载。 |
| S5 | `s5/workflows-ssh-workspaces-H7-1–2-批量目录逐项确认.zip`，动作 2801 从 383766.852 到 383877.886 将整行拖到本机 region。2802 在 2.7 ms 内读到与上传相同的成功提示。2804 从 383934.862 到 388937.098 等含 `pulled.txt · 已完成` 的批次，最终找不到元素。 | 失败附件的传输中心只列本机 `selected-root` → 远端 `/home/test`，已完成 3/7；失败行是上传的 `tree/escape`。面板通过 hidden 切换，旧成功提示可以保留。 |
| S7 | `s7/workflows-ssh-workspaces-H7-1–.zip`，4112 在 288450.847 确认把手 draggable=true。4113 于 288451.570 开始等响应；4115 于 288452.331 开始从把手拖至本机标题，288805.017 正常返回（352.686 ms）。4113 在 298454.305 超时。 | 响应监听早于动作；用例在点击传输中心和读取目标文件前已失败。两份 ZIP 只有测试步骤、源码和失败附件，无浏览器 network 轨迹。S7 证明 10 秒内未观察到符合条件的响应，无法据此计数实际发出的请求。 |

## 对根因的约束

- S7 的谓词匹配 POST `/api/v1/call`、能力 `ssh.transfers.startBatch`、方向 remote → local；与 `packages/workbench/src/engine-client/client.ts:62` 和 `plugins/ssh/src/ui/FileBatch.tsx:38` 的请求格式一致。谓词不筛 HTTP 状态或业务成败，因此普通服务端错误响应也应唤醒它。之前的缓存误读能解释 S4/S5 的提示，解释不了 S7 的超时。
- `FileWorkspace.tsx:130` 将本机标题直接放在绑定 drop 的 section 内；两栏共用同一个 provider（317 行）。源把手启用且目标存在。尚未观测到 `dragstart` 写入选择、目标 `dragover` 接受自定义 MIME、`drop` 调用 submit 这三步。源把手启用也不能证明释放时目标未处于 loading，或 submit 中目录、busy、session.state 的检查均已通过。对应分支见 `FileBatch.tsx:30–46,73–79,96–115`。
- S7 同轮 A01 的主机排序使用桌面原生 `dragTo`、自定义 MIME 和列表顺序回读，验收通过（`e2e-ssh-all-s7.log:11`、`tests/e2e/ssh/host-records.spec.ts:143`）。H5.2 曾挂在鼠标移动，S7 的拖动已经返回，不能仅凭同一运行环境就认定同一故障。A01 在 dragover 只检查内部状态，H7 还检查自定义 MIME；这是可以直接观测的差异。
- 对目录下载、普通子文件落盘和链接跳过已有直接队列测试。实施者回执 `t1tw/report12.md` 记录对应测试文件 7/7 通过；它覆盖引擎调用后的行为，没有覆盖拖动事件。现有证据优先指向提交前路径。

## 一次定向复验与修复选择

1. 由 Lead 在原 X11/Xvfb 环境只跑 `tests/e2e/workflows/ssh-workspaces.spec.ts -g 'H7.1–2 批量目录逐项确认'`。在首次上传前就监听该能力的 request、response、requestfailed，只记时间、方向、names、状态及返回的 batchId。已成功的按钮上传可作观测正对照。拖动前后分别读一次 `ssh.transfers.list`，查看有无新的 remote → local 批次。超时时先附上记录，再关闭 fixture。
2. 在同一次真实拖动中记录源把手和目标栏的 pointerdown、dragstart、dragover、drop、dragend，保留命中元素、坐标、所属栏、types、dropEffect 及冒泡后 defaultPrevented。记录两个元素的可视矩形和滚动容器的 scrollTop。Playwright 1.65.0 的 dragAndDrop 先对源定位并按下，再独立将目标滚入视口后移动和释放；当前目标是栏顶标题，源把手在文件表内，可能因滚动改变命中。现有 trace 没有坐标，需现场核对。若 drop 到达仍无请求，只记录 FileBatch 在 start、drop、submit 哪个条件提前返回。
3. 若中断源于测试滚动，选同一可见高度的本机栏落点，先在把手上按下并移动越过起拖阈值，再移动到该落点、释放。若原生事件已经到达，但目标拒绝，修正实测失败的 guard；保留会话、方向和系统文件边界。若已创建正确批次，只修正响应观测，并按真实 batchId 断言结果。若常规可见落点也反复丢失原生手势，内部拖动可复用 `WorkspacePaneTools.tsx:68,123–153` 的主指针捕获、阈值及释放命中，用相同 provider 的目标栏调用现有 submit；保留外部文件拖入提示、无效落点取消和勾选按钮。
4. 最终验收仍从真实拖动进入。断言恰好新增一个正确方向和会话的批次、普通文件内容相符、链接行提示跳过且本机没有链接，再继续原用例的跨会话复制。手工派发 DOM 事件、按钮下载或直接调用队列都不能单独验收拖动。

**未运行的验证**　本次只读核查已有产物和代码，未运行单测、E2E、构建或手动桌面复现。未修改产品或测试，未提交。上述根因判断和修复分支待定向复验。

## Lead 验收

- Lead 2026-11-25：采纳诊断；第 3 次实施派 t1tw task13（加观测并改用指针捕获内部拖动）。顾问会话回收。
