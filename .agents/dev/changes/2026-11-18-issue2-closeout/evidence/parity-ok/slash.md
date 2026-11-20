# B03 · 斜杠菜单

在 `Slash anchor` 后新建段落输入 `/`，查看分类与导航，依次尝试 `accordion`、`折叠`、`h2`、`zzzzparitynoresult`，以 Enter、Tab 和鼠标各选一次二级标题，最后检查 Escape 与滚动后视口边缘。Huhu 的 `accordion` 匹配「折叠面板」，`折叠` 匹配「折叠面板」「折叠块」，`h2` 匹配「二级标题」。无结果有文字状态，三种选取方式均写入有效的 Markdown 二级标题。Escape 收起菜单并保留 `/heading` 字面文本和正文焦点。边缘场景测得菜单完全在 1440 × 900 的视口内。

[Huhu 分类与预览](slash/huhu-categories-and-order.png) · [Huhu 无结果](slash/huhu-no-results.png) · [Huhu 视口边缘](slash/huhu-viewport-edge.png) · [全部步骤 DOM](slash/huhu.json) · [最终 Markdown](slash/huhu.md)

| 对照项 | 分类 | OK 与 Huhu |
| --- | --- | --- |
| 分类及顺序 | 已登记差异 | 基础块、插入、组件、媒体、嵌入预览的语义顺序相同，组内分别有 8、6、10、5、7 项，项目顺序相同。固定 OK 的五个组名和部分项目仍为英文。Huhu 本地化见 `6f1023c`，命令未改变。 |
| 英文过滤、中文过滤 | 已登记差异 | `accordion` 均命中同一组件。`折叠` 在固定 OK 无结果，在 Huhu 命中两个中文名称。取词差异来自菜单本地化，见 `6f1023c`。 |
| 别名与无结果 | 等价 | `h2` 均匹配「二级标题」，无意义查询均显示「没有结果」并列出零选项。 |
| 预览和方向键 | 等价 | 下键到「二级标题」，上键回到「一级标题」，可见预览均为「一级标题」和「大号章节标题。」 |
| Enter、Tab、鼠标 | 等价 | 三种选取方式均关闭菜单，在 DOM 中插入二级标题并保存。样本最终 Markdown 一致。 |
| Escape | 等价 | 关闭菜单、保留 `/heading` 及正文焦点。之后脚本清除临时查询。 |
| 视口边缘定位 | 等价 | 两边均在 1440 × 900 视口内把 360 像素高的菜单放到光标上方。OK 光标底边约 731 像素，Huhu 约 841 像素。两端的工作台布局与菜单宽度不同。 |

[OK 分类与预览](slash/ok-categories-and-order.png) · [OK 无结果](slash/ok-no-results.png) · [OK 视口边缘](slash/ok-viewport-edge.png) · [全部步骤 DOM](slash/ok.json) · [最终 Markdown](slash/ok.md)
