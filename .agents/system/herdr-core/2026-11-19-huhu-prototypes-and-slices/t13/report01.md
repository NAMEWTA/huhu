# task01.md 执行报告

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices
- Core — 本机 `wta`，ID `346bd5608735e3fcb27f9d01f5c8008e`
- terminal_address — t13
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t13/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t13/report01.md
- 模型 — GPT-6.2-Sol，xhigh，依据 `hc get t13 --json`
- 工作目录 — D:/Document/code/huhu
- 执行结果 — done

## 结论

完成 #6、#7 的独立离线交互原型，并分别走查桌面成功、故障、恢复和复位，以及窄屏操作。两个 HTML 版本均待用户确认。

#6 采用最新用户决定。干净安装的工具开放数为 0。开启须逐项提交或显式确认批量范围。局域网邀请可重复使用，撤销后立即拒绝旧链接，并断开通过该邀请建立的会话。其他邀请建立的会话保持可用。停服务或切 Vault 使当前 Web 会话和链接失效。#10 的草稿离场决定已回读，归该 change 的执行者。

## 产物与基线

| Change | 入口及记录 | 原型目录 SHA-256 |
| --- | --- | --- |
| #6 工具目录与 Web 工作台 | [原型](../../../../dev/changes/2026-11-19-issue-6-unified-tools-web/prototype/index.html) · [走查](../../../../dev/changes/2026-11-19-issue-6-unified-tools-web/prototype-review.md) | `ff01f773cb0a8c0ffc52a986ef6d6ac66f5e7e606a1c59ce5ed53a34813d6135` |
| #7 SSH 客户端与工作区 | [原型](../../../../dev/changes/2026-11-19-issue-7-ssh-module/prototype/index.html) · [走查](../../../../dev/changes/2026-11-19-issue-7-ssh-module/prototype-review.md) | `c80f18ecc8e942f86d486a478cca44545ed6f35846381b01219f9e4bd2ab343e` |

两个目录各含 HTML、两份 CSS、两份脚本和一份 Huhu 标志。使用 Huhu `feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10` 的工作台外壳、主题和模块组件作设计基线。#7 对照源码清单中的 Motty `main@2daa9db582e16edf60a60b7ada26f47f808f973c`，核对 Viva `main@a5da67aa63440ee836c37a5aa1c70e3eb317401c` 可读。对照 Motty 的工作区结构、启动回滚、传输状态、转发和监控规则，自行以 Huhu 界面表达。改动位于以上两个原型目录及确认记录和本报告。

## 验证

Microsoft Edge 157.0.4341.60，Playwright Core 1.65.1。通过 `file:` 打开实际交付文件，浏览器上下文设为离线。1440 × 1000 浅色、390 × 844 深色，四次加载均无页面脚本异常、资源加载失败或非本地文件请求。实际资源指纹通过 `fingerprint.mjs --expect` 核对。两套运行均退出码 0。

| 验收 | 操作及结果 | 证据 |
| --- | --- | --- |
| #6 工具策略与实际可用性 | Escape 取消时焦点还原，开放数仍为 0。逐项启用反映到 CLI 和 MCP，停止 MCP 后 CLI 发现仍有效。批量写失败维持原选择，重试整批成功，版本冲突退回。 | [#6 走查](../../../../dev/changes/2026-11-19-issue-6-unified-tools-web/prototype-review.md) |
| #6 Web 监听、邀请与业务 | 端口占用后重试，可取消启动。A/B 同用 D-001，C 使用 D-002。撤销 D-001 后 A/B 断开、旧链接拒绝，C 仍能操作。浏览器任务出现在桌面同步区，笔记冲突保留输入后可重存，附件添加入列表。停止／切 Vault 失效，复位回零。窄屏检索、开启工具、仅本机进入工作台可操作。 | [#6 走查](../../../../dev/changes/2026-11-19-issue-6-unified-tools-web/prototype-review.md) |
| #7 配置、路由与工作区 | 测试未保存主机，修改使测试失效后保存。路由拒绝自指，修正后保存。双分栏单独失败，另一个会话工作。认证取消后重连。模拟指纹变化要求独立核对，确认新指纹后恢复。窄屏首次信任、取消认证、重连及打开附属文件可用。 | [#7 走查](../../../../dev/changes/2026-11-19-issue-7-ssh-module/prototype-review.md) |
| #7 SFTP、转发与监控 | 独立文件视图固定于源分栏，附属面板随活动分栏。目标冲突取消、续传前缀不符、传输故障均保留旧目标，确认重试后完成。暂停、继续及取消改变任务状态。转发占用端口后重试、采样和停止。监控故障后可重试、取样及暂停，原型可复位。 | [#7 走查](../../../../dev/changes/2026-11-19-issue-7-ssh-module/prototype-review.md) |

本机复跑脚本为系统临时目录中的 `huhu-t13-qa.cjs`，参数为 `six` 或 `seven`。同处有 `huhu-t13-6-catalog.png`、`huhu-t13-6-desktop.png`、`huhu-t13-7-desktop.png` 及两份 `huhu-t13-*-narrow.png`。完整操作步骤保留在对应走查记录。

## 阻碍与接续

原型交付无阻碍。样例监听、协议发现、会话、监控和文件仅在浏览器内存中演练。真实 Electron、其他浏览器、网络、SSH／SFTP、生产数据落盘以及完整功能矩阵按实施计划验证。#6 原型以三个设备槽和可另建邀请表示独立会话，外部工具是否额外按 SSH 主机限权仍待决。#7 对被引用主机采用先解引用再删除的演示约定，独立文件使用同页视图，采样使用离线模拟。两个版本等待用户视觉与交互确认。

## Lead 验收

待外部 Lead 核验后追加。

- Lead 验收通过。核对 #6、#7 两份 HTML、确认记录与最终工作区。Lead 独立复验了分组撤销、模拟主机信任以及桌面和窄窗离线加载。
