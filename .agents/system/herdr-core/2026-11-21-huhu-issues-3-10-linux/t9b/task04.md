# 返回shell调用名收尾复核
Lead t3p，worker t9b；integration。只读固定提交cce683a0对父提交的六文件diff，复核report03唯一新P2是否关闭，不重新审计已关闭provider/Mail范围。保留规范映像核验、Source链接绑定，argv0使用已核对的原调用名。
Lead t9r先红（/bin/sh实际被改成/usr/bin/dash）；t9s定向TS、Go测试构建及六真实PTY场景通过，新增shell-alias用Bash链接为sh，实际shopt -oq posix成功，最终exit23。t9t四providerversion+interactive再通过。日志temp/issue-evidence/huhu-2026-11-22/shell-name-{red,check}.log及provider-shell-alias-check.log。
只核对该修复及证据，不必重复实程。写report04.md后冻结。Agent取消工作树由t86持有，不读取未完成差异。无子代理或业务写入。
