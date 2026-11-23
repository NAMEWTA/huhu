# RGL 接入独立审查
身份 t1fr/task01.md，Lead t3p，代码 /home/wta/projects/huhu，共享根父目录。sol/xhigh，只读业务，不开agent，不跑浏览器/build/全量检查。允许小型Node或单文件Vitest。
读取 t1d8/task07.md、report06.md及可用report07；审查 packages/workbench/src/home/DashboardGrid.tsx、Dashboard.tsx、layout/css未提交增量、单元测试及新E2E。按 #10 spec/design 核对领域布局、手势生命周期/Escape/unmount、卡片实例身份、输入焦点、只读/窄列、尺寸与保存、键盘语义。判断是真实RGL适配而非双轨自有拖动基础设施。
冻结PoC32项30过2失败，其中RGL8/8，原始证据 temp/closeout-release/grid-comparison-results/artifacts-stable。生产合并types/build t1fm已过，实际Electron8项6过2失败 temp/closeout-release/dashboard-rgl-ui.log/result.json：Escape位置恢复误差88px和窄屏drag按钮未隐藏。Lead已安排原实施者修这两项，不重复作为新发现。其他生产文件修复将由其通知。
只报告真实问题，指明复现路径和要求；不要用扩大测试清单替代缺陷。报告同目录report01.md，只读则temp/closeout-release/t1fr-report01.md，锁只读不升级，Lead主动收取。测试和UI取证仍由Lead串行。
