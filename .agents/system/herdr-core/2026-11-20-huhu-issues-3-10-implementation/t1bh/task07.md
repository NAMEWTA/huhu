# task07 独立查清 #6 D02 Agent 规则开放的服务端边界

只读冻结集成 SHA 897cd78a。读取 #5/#6 source、spec、tasks、actual callers、task-scan occurrence（规则版本、意图、授权范围、控制终端）并以复用优先给出最小垂直切片。静态目录和三种外部调用路径已有机制，重点确认每项需要的权限、能否精确约束规则版本、版本/重试边界、需要拒绝的操作、最短真实 E2E。核对可复用 Huhu 模块，不写业务、不执行真实终端任务或使用真实 Vault、不进行任何远端写入。报告路径 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1bh/report07.md，列确切代码与契约出处，说明现有覆盖和余项。后续会另派 P2 修复复审。
