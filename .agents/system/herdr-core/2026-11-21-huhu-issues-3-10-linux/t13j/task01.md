# TipTap 停放快照回归及修复
Lead t3p worker t13j；工作树 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux，HEAD f0fb1810。读 AGENTS/dev-build 与 temp/final-audit/t13d-report01.md。
仅修独审已明确的 Activity 包裹 TipTap 隐藏时临时脱离DOM使URL提前撤销。保留真正关闭释放、直接画板Activity、同内容恢复、31幅图待挂载、共享灯箱与模式变化。
先复用真实 EditorContent.dom.test.tsx 的 TipTap+Activity 宿主，写能够区分临时停放和真正销毁的回归（可只mock SVG导出，不mock EditorContent生命周期）；写完先落 temp/final-audit/t13j-red-ready.md，停止生产修改并等Lead运行红灯。不得自行跑任何测试/tsc/lint/build/E2E，不派子代理，不提交/reset。
可写 editor/vendor/open-knowledge/app/src/editor/EditorContent.dom.test.tsx、components/ExcalidrawEmbed.dom.test.tsx、components/snapshot-url-pool.dom.test.ts；生产实现第二任务再授权。先静态提出最小修复建议，复用现有 editor 停放/销毁所有权，不用无限保留URL或随意延迟回收掩盖。
已执行modernweb搜索/retrieve，完整读 /tmp/mwg-guide-3235787-1795365728802.md；React Activity机制参考已安装React源码与 https://react.dev/reference/react/Activity。不要申请权限绕过；写报告即可，禁止 hc send（Lead读取）。报告 temp/final-audit/t13j-report01.md 或红灯准备文件。
