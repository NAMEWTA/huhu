<a id="responsive-tables"></a>

# 响应式表格

大型数据表格在小屏幕上常因列溢出，或缩小到无法辨认而难以阅读。本指南演示如何通过**粘性定位**让表头在滚动期间保持可见，以及如何在空间不足时将表格转为适合移动设备的“堆叠”布局。

<a id="recommended-approach"></a>

## 推荐方法

响应式表格的核心是保持数据单元格与其表头之间的关系。

1. **语义基础**：使用标准 `<table>`，包含 `<thead>`、`<tbody>` 和 `<th>`。
2. **粘性上下文**：给列标题和行标题都应用 `position: sticky`。这样无论用户朝哪个方向滚动多远，都不会失去数据含义的上下文。
3. **自适应变换**：使用 `@container` 查询，而不是 `@media` 查询。这样表格会依据自身宽度调整（例如放在侧栏或窄仪表盘组件中时），而非依据整个视口。
4. **注入标签**：在堆叠布局中隐藏 `<thead>`，通过 `::before` 伪元素和 CSS 变量将可访问的表头注入每个单元格。
5. **可辨读的单元格**：让较长单元格文本保持单行，不要让列缩到无法辨读。关于截断并在需要时显示完整文本、且不增加使用阻力的方法，参见 `single-line-overflow`（通过 `npx -y modern-web-guidance@latest retrieve "single-line-overflow"` 获取）。

<a id="implementation-steps"></a>

## 实现步骤

<a id="1-markup-and-layout"></a>

### 1. 标记与布局

用标准语义表头组织表格。使用 `.table-wrapper` 处理溢出，并提供查询容器。给容器添加 `tabindex="0"`，确保仅使用键盘的人能稳定地滚动表格。

给包装器添加 `role="region"`，传达其用途。通过 `aria-labelledby`（引用已有的表格标题／名称元素的 `id`）或 `aria-label`，提供无障碍名称。

```html
<div tabindex="0" role="region" aria-labelledby="employee-table-caption" class="table-wrapper">
  <table>
    <caption id="employee-table-caption">Current employee directory</caption>
    <thead>
      <tr>
        <th>Employee</th>
        <th>Role</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <!-- Row header remains sticky horizontally on desktop, 
             and becomes a sticky card header on mobile -->
        <th>Alex Rivera</th>
        <td>Engineer</td>
        <td>Active</td>
      </tr>
    </tbody>
  </table>
</div>
```


<a id="2-configure-sticky-headers"></a>

### 2. 配置粘性表头

启用滚动，并让表头保持粘性。使用逻辑属性和明确的 z-index 值管理堆叠顺序。

```css
.table-wrapper {
  overflow: auto;
  max-inline-size: 100%;
  max-block-size: min(500px, 80vh);
  container-type: inline-size;
}

table {
  border-collapse: separate;
  border-spacing: 0;
}

/* Sticky column headers (desktop) */
thead {
  position: sticky;
  inset-block-start: 0;
  z-index: 1; /* Above sticky row headers */
}

/* Sticky row headers (desktop) */
tbody th {
  position: sticky;
  inset-inline-start: 0;
  background: white; /* Required to cover background during scroll */
}
```


<a id="3-responsive-stacked-layout"></a>

### 3. 响应式堆叠布局

空间有限时，隐藏原始表头行，将表格转为卡片。通过伪元素注入标签。只为非文本内容提供替代文本，否则屏幕阅读器可能同时朗读文本内容和无障碍名称。

```css
@container (width < 600px) {
  table, thead, tbody, tr, th, td {
    display: block;
  }

  thead {
    /* MANDATORY: Hide column header from layout and screen readers. */
    display: none
  }

  tr {
    margin-block-end: 1.5rem;
    border: 1px solid #ccc;
  }

  /* Sticky row headers at the top of each block/card */
  tbody th {
    position: sticky;
    inset-block-start: 0;
    z-index: 2;
    background: #eee;
  }

  /* Define column labels as CSS variables (often set via JS) */
  table {
    --label-1: "Employee";
    --label-2: "Role";
    --label-3: "Status";
  }

  /* Inject labels */
  td:nth-child(2)::before {
    /* MANDATORY: If using non-text content, provide the accessible name (after the /) which ensures screen readers hear the text alternative. */
    content: var(--label-2) ": ";
  }
  /* MANDATORY: Map the label for each column */
  td:nth-child(3)::before {
    content: var(--label-3) ": ";
  }
}
```

