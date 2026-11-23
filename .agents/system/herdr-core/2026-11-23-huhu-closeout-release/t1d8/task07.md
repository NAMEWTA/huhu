# RGL 生产接入
身份 t1d8/task07.md；Lead t3p；共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release；工作目录 /home/wta/projects/huhu；sol/high。Lead已核对冻结 t1fc 32项30过2失败：RGL8/8、Homarr8/8、Huhu7/8键盘播报缺、GridStack7/8越界策略不符。原件 artifacts-stable/result.json/trace。按W01-01及design明确规则选择RGL2.3.0，仅一个生产宽画布实现。
先读相关技能及已有现代指南。按report06建议小范围适配，保留草稿/保存/冲突/离场/instanceId/窄屏布局/业务输入/readonly语义；原生传感/缩放/吸附走RGL，领域几何沿用已验证实现。移除被替代的自有指针基础设施，勿保留双轨。生产键盘与指针成功统一播报。适配dynamic definitions的尺寸与空位，组件卸载清理，无新硬编码颜色。
写入范围 packages/workbench/src/home相关、workbench对应依赖声明、pnpm-lock.yaml最小所需、相关单元与dashboard E2E，以及#10设计/比较证据文档和上游license台账。其他worker拥有Mail/Tasks，不碰。依赖安装Lead执行：先改package声明并通知，Lead pnpm install；不自行重型build/typecheck/E2E。Worker仅单文件Vitest。UI E2E补宽窄/真实键盘播报/持久化/触摸覆盖，Lead串行跑。
保留可复现PoC源码与固定版本在仓内合理测试/证据目录，勿仅依赖ignored temp；不要提交node_modules或海量trace。运行汇总包含30/32总结果及各candidate、不把失败擦掉，raw路径与哈希保留。迁移前现有 spec/实现/用例先读，保证业务卡身份不因拖动重建。
报告 report07.md（不能写则temp/closeout-release/t1d8-report07.md），列单测/未运行重型验证、依赖/许可/适配路径及建议命令。完成后停止写入供Lead验证。
