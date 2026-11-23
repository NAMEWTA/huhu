# Windows 共享工作台阶段验收

冻结构建来自 `2ceec67d9be1227da4815dc1df1afd8f1d8069c3`，版本 `0.0.1-rc.4`。Windows x64，Electron 44.9.1，Chromium 152.0.7977.167，Edge 157.0.4341.60。构建使用锁定 pnpm 12.10.1，Core `t11y` 退出 0，加载产物的 Electron `appInfo` 与完整 `build-info.json` 对应。

| 范围 | 实际结果 |
| --- | --- |
| 静态包与深链 | 关闭开发服务器，经桌面 Engine 提供的编译资源进入真实 Edge。中文、空格及 `#` 笔记路径和指定任务 ID 在直接访问、刷新后打开正确对象。实际来源是本机 Windows 的非回环网络地址。浏览器未提供 preload 和 secure-context UUID。 |
| 同一 Vault | 从 Edge 表单新建任务，从真实富文本编辑器修改笔记。三个浏览器事件流都观察到任务变动，桌面查询返回同一任务和保存正文。 |
| 浏览器文件和复制 | 在笔记标签操作中触发复制，普通 HTTP 回退到选中的原路径文本。浏览器导出 Markdown 后逐字节读取下载，并用浏览器文件选择导入合成笔记，桌面读回原文。 |
| 两份邀请、三份会话 | 两次兑换同一邀请产生两个独立 `HttpOnly`、`SameSite=Strict` 会话，另一邀请产生第三个。加入后地址片段中的邀请被清除。撤销第一份邀请后两个旧页面显示会话不可用，旧链接拒绝重入。第三份会话仍可读，停止 Web 才断开，控制端继续读取 Vault。 |
| 桌面回归 | 同一编译产物经过完整 `session-flush.spec.ts`，16 项通过，覆盖落盘、恢复草稿、多窗许可、故障保留窗口及启动错误页。 |

真实 Edge 初次回放在 `/notes/…` 与 `/tasks/…` 下误用相对构建资产路径，模块获得 HTML 响应。`d039bc4` 改由文档根解析资产。后续已认证页面的 bootstrap 复查被编辑器相对 `/api` 路由适配器拦截，浏览器停留在旧页面。独立用 Edge 的冻结脚本追踪至页面内 404，根因报告在实施主题 `t11j/report01.md`。`cd697d8` 的绝对同源 URL 定位和复制回退已随上述构建重跑。后端 `aab62ba` 由 `t4z/report06.md` 独立检查真实 Engine、端口切换和活动流，`5cb39eb` 统一桌面分享管理的发现与执行授权。

在集成检出中从配套 Windows 阶段构建运行 `node D:/Document/code/huhu/temp/issue-baseline/web-workbench-edge.cjs`。构建、浏览器、桌面回归日志在原工作区 `temp/issue-baseline/core-finished/{t11y,t11z,t121}.log`。父候选失败日志 `t115.log`、`t119.log` 和独立冻结副本 `temp/issue-baseline/t11j-5cb39eb37dbc/` 支持红绿复查。测试使用合成 Vault、隔离用户目录和三个 Edge 上下文，结束后撤销邀请并停止监听。

第二台物理设备、正式 NSIS、真实 Agent/SSH 终端、桌面邀请管理和看板草稿联合场景仍待后续组合验收。
