# Task 回执用例观察屏障
共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux；Lead t3p，worker t10k，机器wta-ubuntu。
工作树agent-linux基线4ae7e7e4，承接t10f未提交独立CLI/MCP用例。读t10h/report01.md P2第3项与P3。
只可改 plugins/agent-cli/test/native-receipts.live.test.ts 和 plugins/agent-cli/test/fixtures/codex-receipts-provider.cjs。不得改生产代码、其他worker文件、提交/暂存。禁止子代理，禁止任何测试/类型检查/构建/安装/E2E（t109全量仍运行）。
补足无匹配证明的确定性屏障：当前fixture只是输出帧后log，不能证明helper已处理。优先复用正常协议，建议在同一stdout顺序发送一个带唯一id的不支持RPC请求，观察helper返回-32601作为此前同步帧已处理的fence。不可新增生产测试后门；不要用任意sleep替代。之后还应见证一次真实answer.inspect对账完成且仍unknown，再放行匹配proof。可用现有CodexDispatch.connectAnswer/inspect调用观察包装但不能mock结果。核对已有第三条Engine proof用例也有同种竞态，在同文件一并修复。保持全部原有错误线程/轮次/题目/答案负向断言及唯一输入/回答语义。
同时修新增each夹具在临时root分配后到try之前创建子目录失败的清理缺口，最小调整try边界，不全文件重构。
报告temp/final-audit/t10k-report01.md：屏障因果链/改动/未运行验证。勿hc send（可能权限阻塞），Lead主动收取。不要申请扩大权限。
