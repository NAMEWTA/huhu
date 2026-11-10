# 进展

## 当前状态（2026-11-10）

实现已开始，进度见下表。未列出的任务均未开始。

| 任务 | 状态 | 证据 |
| --- | --- | --- |
| W01.1 monorepo 与工具链 | 完成（oxfmt/knip 仅占位配置） | lint/typecheck/test 通过；边界规则样例被拦截 |
| W01.2 Electron 骨架 | 完成（仅 Linux 本机验证） | Playwright 启动用例通过 |
| W01.3 CI / W01.4 打包 | 配置已写，**未在 CI 上运行** | 无 |
| W03.1 contracts（含 kinds、task DTO） | 完成 | 单元测试；审计通过 |
| W03.2 Cordis 与插件管理器 | 完成，已接入 Engine | 启停/回滚/依赖/并发/事件订阅释放测试 |
| W03.3 Dispatcher | 完成 | 契约测试；两轮审计问题已修 |
| W03.4 HTTP/WS 服务 | 完成（服务端）；Renderer 客户端未做 | 401/403/413/429、补发/resync 测试 |
| W03.5 Engine 进程 | 子进程启动/关闭/端点描述完成；Main 监管、崩溃重启、utilityProcess 未做 | 子进程测试 |
| W03.6 CLI | call、vault info、自动启动无界面 Engine 完成；便捷命令、mcp 未做 | 集成测试 |
| W04.1 Vault 生命周期 | 路径守卫、vault.json、写者锁、只读完成；启动页、切换窗口未做 | 单元/集成测试 |
| W04.2 原子写与操作日志 | 完成（含崩溃注入） | 子进程崩溃恢复测试 |
| W04.3 语义 Markdown | frontmatter 局部改写、kind 模式、仓储完成 | 单元测试 |
| W04.4 文件监听 | 完成（原生 + 轮询回退） | 集成测试（仅 Linux） |
| W04.5 索引与 vault.* 能力 | 完成（中文二元分词）；性能指标未测 | 单元/集成测试 |
| W04.6 数据包导出导入 | 库完成；未接能力 | 恶意包测试 |
| W02.1/W02.2/W02.3 设计系统与外壳 | 六主题 token（对比度测试）、Button/CompletionCircle/Badge/Banner/EmptyState、AppShell（rail/标签/状态栏/贡献注册表）完成；未用 Tailwind/shadcn（手写 CSS），无 DataTable/DateTimePicker/Sheet/详情面板/命令面板 | 单元测试 + Playwright |
| W03.5 桌面端 | Main 监管 Engine utilityProcess、崩溃提示与重启、窗口关闭有序停止完成；启动页（W04.1）以环境变量/默认目录过渡 | Playwright（杀进程→重启） |
| W05.2–W05.4 笔记后端 | 创建/模板/改名/移动改写双链/复制/回收站/日记/星标/保存完成 | 单元 + HTTP 集成 |
| W06 编辑器（部分） | CodeMirror 源码模式、消毒预览（双链、GFM）、自动保存与冲突提示；无实时预览/分屏/合并/多文件类型 | 组件测试 + Playwright |
| W08.1 任务后端 | 分类、勾选、输入版本、CRUD、回收站、提醒完成；UI 与 TaskQuery 服务未做 | 单元/HTTP 集成测试 |

未开始：W01.5 testkit、W02 设计系统与外壳、W05–W07 知识库与编辑器、W08 UI、W09–W20 其余全部。**0.0.1 发布条件远未满足**：没有可用的界面功能，三平台 CI 与安装包未验证。

## 定义依据

- 原型 v9 已在真实 Chromium 中逐模块打开核对（14 个模块），并按源码确认路由实际使用的组件（未路由的旧组件不作为产品意图）。
- 参考源码按 [reuse](reuse.md) 中列出的路径逐一确认存在；Herdr Core 的平台支持与协议、Open Knowledge 的进程结构、Orca 的 SSH 与 Agent 目录、agent-autoloop 的 worker 适配器、DSH 的 Cordis API 均按源码核对。
- 未执行任何安装、构建或运行参考项目的操作；所有性能目标与平台行为都是待测目标，不是已测结果。

## 下一步

从 [W01 工程基线](tasks/W01-foundation.md) 开始；W01.4（三平台安装包冒烟）与 W12.1（Herdr 三平台集成）是最早需要验证的外部事实。

## 打包冒烟（Linux，2026-11-10）

`electron-builder --linux dir` 在本机成功产出 `release/linux-unpacked`；用 `xvfb-run` 启动解包产物，应用运行 12 秒并在 Vault 目录创建了 `.huhu/vault.json`（说明打包后的 Engine utilityProcess 正常启动）。AppImage/deb、Windows、macOS 安装包与校验和脚本在 CI 中尚未运行。
