# 表格行拖拽 · 矩阵 150、151

定位第二个数据行，用行句柄把它拖到第三个数据行下方。Huhu 的 DOM 与 Markdown 顺序都变为 `First row`、`Third row`、`Second row`，表头保持在首位。此样本只验证行移动。

[Huhu 截图](table/huhu-drag-second-row-below-third.png) · [DOM](table/huhu.json) · [最终 Markdown](table/huhu.md)

**等价。** OK 的行句柄可执行相同拖拽，DOM 与磁盘 Markdown 给出相同顺序。

[OK 截图](table/ok-drag-second-row-below-third.png) · [DOM](table/ok.json) · [最终 Markdown](table/ok.md)
