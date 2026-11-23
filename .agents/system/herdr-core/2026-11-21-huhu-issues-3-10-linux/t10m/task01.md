# 画板快照渲染故障只读诊断
共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux，Lead t3p，worker t10m，机器wta-ubuntu。
工作树agent-linux基线4ae7e7e4；只读业务和已有证据。当前integration在跑唯一全量E2E t109，禁止启动任何测试/类型检查/构建/安装/GUI，禁止修改integration及业务/测试文件，禁止子代理。
新失败为integration/test-results/knowledge-local-reference--85708-画板读取未打开文件，更新及切-Vault-后释放旧快照/，trace与error-context。tests/e2e/knowledge/local-reference-blocks.spec.ts第54行用例，首先snapshot img不存在，UI明确显示Excalidraw画板加载失败/无法渲染画板快照。镜像正文成功。追查现有ExcalidrawEmbed、快照adapter、生产打包资源与测试fixture，利用trace网络/console/资源判断具体机制。不把5秒超时当原因，不盲加timeout、不改断言。已有同套leak200轮通过(160)，该测试162失败。
目标：证据支持的根因及最小实现/验证方案；若已有trace不够，写精确下一轮所需只读观测点，区别确定与推测。若有确定产品补丁仍只建议，Lead另排实施。可读temp/sources成熟实现但无需联网扩大范围。
只写temp/final-audit/t10m-report01.md，Lead主动读取，勿hc send勿申请权限。报告明确未运行验证。
