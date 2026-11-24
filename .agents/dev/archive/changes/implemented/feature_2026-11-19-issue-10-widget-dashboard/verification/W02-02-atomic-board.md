# W02-02 看板整板提交

Windows x64 26300，Node 24.21.0，Vitest 3.2.7。测试用隔离 Vault，通过已有能力 Registry、Dispatcher 和 Engine HTTP 路径。写者持有 Vault 写锁，复用 VaultFiles 的字节版本与同目录原子写。

| 验收 | 实测 |
| --- | --- |
| 保存和重启 | 测试向正常 Engine Registry 登记整板能力，经桌面令牌 HTTP 提交。释放该 Engine 后在同一 Vault 启动第二个实例，经正式 `home.dashboard.get` 读回相同 revision、实例和几何。`t4p` 三项读写用例通过。 |
| 并发 | 两份不同布局用同一 baseRevision 并发，只提交一份。同一请求键的同输入重发得到同一版本。 |
| 校验 | 空与重复实例 ID、几何缺失、重叠、无穷值、负坐标、定义尺寸越界、隐藏单例重复、未知新增类型、随请求送入业务内容均为 `INVALID_INPUT`。每次失败后整份文件逐字节一致。 |
| 写入故障 | 只读为 `READ_ONLY_VAULT`。在替换前注入写入异常返回 `INTERNAL`，文件字节不变，随后仍能保存。既有未知类型的配置能够随其他布局更改原样保存，改写该配置和覆盖损坏文件均被拒绝。 |

`t4k` 联合运行 Kernel 看板、专注习惯和 Engine 定向回归，16 项通过、44 项按名称跳过。`t4j` Kernel TypeScript 检查退出 0。`t4p` 是后续在实际 Engine 入口新增的重启验证。原始运行输出在原工作区 `temp/issue-baseline/core-finished/`。

整板能力目前通过测试装配。生产登记、实际 Widget 定义以及旧首页写者切换按 W06。回执丢失后读回对照由 W02-03，备份与恢复由 W02-04、W02-05。
