# S4-01 在三平台安装版验收桌面外壳

统一装配者一次切换窗口装饰、Root 与 Shell。清理旧顶部、失效样式/类型和 mock，登记实际适配的来源与许可。

**规格范围**　TB-01、TB-02、TB-03、TB-04、TB-05、TB-06、TB-07、TB-08、TB-09、TB-10、TB-11、TB-12、TB-13、TB-14、TB-15、TB-16、TB-17、TB-18。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S0-02 走查标题栏与关闭提示](S0-02-review-shell.md)、[S1b-02 在 macOS 保留系统红黄绿](S1b-02-mac-decoration.md)、[S1b-03 在 Windows 保留贴靠与窗口菜单](S1b-03-windows-decoration.md)、[S1b-04 在 Linux 的目标桌面操作窗口](S1b-04-linux-decoration.md)、[S2-02 在启动与错误页仍可移动和关窗](S2-02-launch-recovery.md)、[S2-03 让标题控制区跟随主题和可用宽度](S2-03-theme-geometry.md)、[S2-04 专注或失焦后仍可操作窗口](S2-04-focus-fullscreen.md)、[S3-02 将保存与编辑命令交给原焦点](S3-02-editor-focus.md)、[S3-03 从菜单执行 Vault 和视图操作](S3-03-workbench-commands.md)。各平台产物可分别验。最终结论需要承诺矩阵、关闭、菜单、生命周期均已整合。

**现有代码入口**　[main/index.ts](../../../../../apps/desktop/src/main/index.ts) · [renderer/main.tsx](../../../../../apps/desktop/src/renderer/main.tsx) · [shell/AppShell.tsx](../../../../../packages/workbench/src/shell/AppShell.tsx) · [renderer/env.d.ts](../../../../../apps/desktop/src/renderer/env.d.ts) · [settings/host.ts](../../../../../packages/workbench/src/settings/host.ts) · [e2e/shell.spec.ts](../../../../../tests/e2e/shell.spec.ts) · [packaged/packaged.spec.ts](../../../../../tests/e2e/packaged/packaged.spec.ts) · [tests/visual](../../../../../tests/visual) · [upstream/ledger.md](../../../../../docs/upstream/ledger.md) · [scripts/gen-notices.mjs](../../../../../scripts/gen-notices.mjs)。

**原型对照**　按已确认版本回放启动、工作台、专注、错误、关窗故障与菜单。宿主矩阵另测。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#scene) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 从根执行 pnpm typecheck、pnpm lint、定向单测、pnpm e2e、pnpm e2e:packaged、视觉比较与 pnpm notices。在真实安装包以 TB-01～18 索引收集场景证据。
2. 分列 OS/版本、Linux 会话、DPI、主题、控件矩形与整窗录像。在切屏、加载失败、保存超时和重新激活中查回归。缺环境的格保持未测。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
