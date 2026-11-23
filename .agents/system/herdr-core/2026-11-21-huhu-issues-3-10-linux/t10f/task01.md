# 补齐 CLI-only 与 MCP-only 独立任务链证据
Lead t3p；worker t10f；wta-ubuntu。共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux。
工作树 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux，分支 impl/huhu-mail-graph-completion，基线4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030。与t10d共享工作树但范围完全分离：t10d只Mail；你只plugins/agent-cli/test/native-receipts.live.test.ts及必要的新同目录fixture（不能改已有共享生产代码）。根依赖、锁、Agent生产接口归Lead。不要git add/commit，以diff交回Lead，避免与Mail提交交错。
按dev-build实现测试覆盖。读 #6 spec D01、tasks/G5b.1* 与独审 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t10b/report01.md 第1项。现有native-receipts.live.test.ts261测试是MCP创建+CLI派遣答复等交叉链，不满足每入口独立闭环，也无编辑。保留现有交叉链，新增/扩展两个独立场景：CLI-only、HTTP MCP-only各自创建、编辑、派遣、查询原问题、回答、读唯一结果；经实际命令run与HTTP入口，不直接调用dispatcher冒充。沿真实Engine/Core与已有syntheticAppServer夹具，同Vault原Core会话，稳定intent与重复回执仍沿用原任务/回答、不重复输入；明确外部身份和授权默认关→开。不能给测试专用生产后门，若发现产品缺陷报告Lead具体接口与失败预期。
当前t109在另一个integration固定候选上跑唯一全量E2E；你只编写代码和测试，不启动测试/类型/build/install/E2E，不碰integration、不启动子代理。等Lead释放重型资源再允许单文件定向测试。
输出：准确覆盖映射与未运行清单，报告本工作树 temp/final-audit/t10f-report01.md，hc send t3p路径。禁止为了测试通过缩小或放宽目标，纯合成provider明确标出；真实provider独立包已有另一场景，不混称。
