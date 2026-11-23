# Mail 当前候选独立收口审查
Lead t3p / worker t142。目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux，HEAD 9e854b1c；审查 plugins/mail 未提交改动含新增 graph-mail/graph-send/fixtures 与 UPSTREAM，及源头台账。只读业务，不跑测试或构建、不派子代理、不 hc send。输出 temp/final-audit/t142-report01.md。
读取当前批次证据 linux-final-acceptance.md、Mail spec 及 tasks/S4.2-outlook-delta.md，并读取 temp/final-audit/t120-report01.md、t125-report01.md、t12f-report01.md（如存在），避免重复已知问题。Graph S5.2 通知口径正在等待用户决定，明确列未签收即可，不再次设计通知或要求提供真实租户。此次聚焦：最新有效窗口补位是否保留预算/重启/取消/切代/不透明游标边界；Graph MIME发送与既有SMTP/Exchange路径是否保持账号授权、失败未知和重交去重语义；已有Mail其他改动是否有具体回归。只有可给出输入时序和代码证据的发现，列优先级/文件行号/用户影响/必要回归；若无新增发现明确说明已知未签收项和未验证范围。
本任务不涉及前端实施；若检查前端行为需指南，Lead此前search/retrieve完整 JS 指南在 /tmp/mwg-guide-3235787-1795365728802.md，可读取复用，不联网查询。参考文档已在报告与本地sources提供，缺资料记录局限，不请求网络权限。禁止修改业务或测试。
