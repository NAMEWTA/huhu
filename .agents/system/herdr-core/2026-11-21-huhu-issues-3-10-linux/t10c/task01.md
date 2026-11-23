# 全量 E2E 紧凑编辑器失败只读诊断
身份 Lead t3p、worker t10c、本机 wta-ubuntu；共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux。
工作目录 /home/wta/projects/huhu/temp/issue-worktrees/integration，固定 HEAD 4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030。仅可写本目录 report01.md（先临时再原子发布），代码/测试/配置均只读。禁止运行任何测试、E2E、类型、构建、启动app，禁止子代理。Lead正在 t109唯一全量E2E，不能改动其输入。
使用 dev-debug；若提出客户端实现建议，遵循 zh-modern-web-guidance search/retrieve。任务是根因分析和最小具体修复建议，不实施。
当前失败：tests/e2e/knowledge/compact-inbox.spec.ts G07 在92行 markdown-editor不存在；compact-submit.spec.ts 三项在38/78行期待旧缓冲但source已经最新或空；editor-compact-commands.spec.ts32行期待选区参考实际空。对应 test-results/*compact*/error-context.md 与 trace.zip 已产生，可用pythonzip读取原始trace和截图。不要把每个trace轮询错误重复列出。
核对 holdBridgeTimers 与当前编辑器结算机制、真实点击/宿主文件打开链路、键盘选区。区分产品问题、过时测试与环境问题。不能放宽断言掩盖行为缺口；建议保留原验收语义的修复方法。补充查看当前同类新失败，但不要扩到SSH（用户已暂停）。
运行日志 /home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/e2e-4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030/run.log。
输出每组证据、根因置信度、代码位置、最小修改范围、必须由Lead复跑的用例。报告完成 hc send t3p 路径。
