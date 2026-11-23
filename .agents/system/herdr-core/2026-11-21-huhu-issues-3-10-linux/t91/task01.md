# Linux 真实 provider 与交互返回的窄范围方案
身份 wta-ubuntu/t91，Lead t3p。只读业务代码，输出本目录 report01.md，禁止子代理/重型验证/Go构建/E2E/代码修改。工作目录 integration，固定候选 d0f50bbb；当前 t86 修改 sessions/native-pty/Automations 的回包恢复，不属于你的实现范围。
读取 t8y/report01.md 第1/2项、Issue4 source C01/C02与环境章节、interactive-environment.ts、native/agent-pty 现有实现、temp/sources成熟相关代码。给出能直接实施的最小方案：
1. 真实安装 Volta Codex/Pi、直接 npm Pi 与 Claude 的受保护交互预览/运行，不能用合成ELF替代真实支持；核对现有resolver与上游包装行为，固定解释器/入口/必要资源的方式，保留argv/工作目录/包资源语义。不要绕过现有批准和映像核对，也不要为了容易测试只支持裸ELF。
2. Agent自然退出后留在同pane交互shell（不是Core重跑原Agent），受保护环境的有效范围和退出码可观察方式，已批准自动化sh命令仍运行一次后结束。优先复用现有Windows/成熟PTY方式。
明确具体文件边界、接口变化（native-pty.ts由t86持有，需Lead协调）、验证真实provider入口且不读真实历史/凭据的方式，以及技术上真未决的取舍。不泛化安全审计、不涉及SSH、不降低原验收。尽快交可实施建议，不需要证明全部实现。
