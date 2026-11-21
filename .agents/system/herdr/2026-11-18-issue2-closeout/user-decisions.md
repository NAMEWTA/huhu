# 用户决定（closeout4）

2026-11-20，用户在主会话以 AskUserQuestion 作答：
- D02：评论正文与回复按规格 §8.1 渲染 Markdown 与引用块（与固定 OK 字面显示不同），磁盘原文不变，补内容安全验收。
- R7：保持现有 Comments/ 格式，嵌套属性路径、属性值内选区批注、消息编辑三项差异登记为用户确认范围。
- F05：保留 huhu-preview 的 standard、secure、corsEnabled 三位，作为用户确认的安全约束；白名单测试保持锁定。
- OP-D08：以 (a) 的隔离实测作为选型依据，不补做 (b) 对跑。
- Mod+K：确认现行分工——富文本编辑器内编辑链接，编辑器外与源码模式打开命令面板。
- notes.move 非空 targetDir 须为已存在目录、notes.create.templatePath 仅桌面端：接受，写入发布说明。
- Q7：Windows/macOS 实机、真实输入法、硬件鼠标登记为未验证后可关闭；如 CI 三平台子集可跑，推送后记录结果。
- OP-D03：保留按事务微任务交付，把决定中的「编辑→会话 300 ms 防抖」记为用户修订；800 ms 自动保存不变。
- G04 分母：以「被测生产模块在 Huhu 交付闭包内」为适用分母（未交付模块的测试逐文件记为不适用）；须 ≥70%，且 112 个待定文件核完后仍达标。
- G04 ORCA：单独适用 70% 闸门，补到 ≥70% 或逐个说明不适用。
- OP-D09：保留 Huhu 的 PDF 外壳，登记为用户批准的等价适配；查找、缩放、计数和高亮按 ORCA 上游测试关键断言补齐。
- 幻灯片模式（frontmatter slides、SlidesToolbarControls 及 use-boolean-frontmatter-field 的幻灯片用途）：不在 Issue #2 范围，登记为用户确认排除。
- OK 技能/托管产物体系（skill-path-links、skill-ref-*、SkillProperties、ManagedArtifactProperties、SkillToolbarControls）：不在范围，登记为用户确认排除（矩阵 §14 第 6 项原为推定）。
