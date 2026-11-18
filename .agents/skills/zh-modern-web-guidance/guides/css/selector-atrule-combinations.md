<a id="selector---rule-combinations"></a>

# 选择器与 @ 规则组合

<a id="the-problem"></a>

## 问题

经常需要结合不同类型的过滤条件，例如选择器 + 媒体查询、媒体查询 + 容器查询等。

例如，将 `(prefers-color-scheme: dark)` 与选择配色覆盖的选择器（如 `:root:has(> head > meta[name="color-scheme"][content="dark"])` 或 `:root.dark`）结合，无论配色通过什么方式设置，都在浅色/深色模式下应用某些样式。

直接做法会产生重复代码：

```css
/* Light mode styles */
.card.featured {
  font-weight: 400;
}

#logo-dark {
  display: none;
}

@media (prefers-color-scheme: dark) {
  /* Dark mode styles */
  :root:not(.light) {
    .card.featured {
      font-weight: 300;
    }

    #logo-dark {
      display: inline;
    }

    #logo {
      display: none;
    }
  }
}

/* Dark mode styles, again */
:root.dark {
  .card.featured {
    font-weight: 300;
  }

  #logo-dark {
    display: inline;
  }

  #logo {
    display: none;
  }
}
```

<a id="what-to-do-instead"></a>

## 替代做法

将组合过滤结果保存在自定义属性中，再通过容器样式查询根据该属性设置规则。

重要：由于容器查询的机制，只有能够将自定义属性放在所有待匹配规则目标的祖先上，此方法才有效。

<a id="1-decouple-selection-logic-from-applied-rules"></a>

### 1. 将选择逻辑与应用规则解耦

```css
:root {
  --color-scheme: light;

  @media (prefers-color-scheme: dark) {
    --color-scheme: dark;
  }

  &:has(> head > meta[name="color-scheme"][content="dark"]) {
    --color-scheme: dark;
  }

  &:has(> head > meta[name="color-scheme"][content="light"]) {
    --color-scheme: light;
  }
}
```

<a id="2-key-on-the-custom-property-for-applied-rules"></a>

### 2. 根据自定义属性应用规则

```css
@container not style(--color-scheme: dark) {
  .card.featured {
    font-weight: 400;
  }

  #logo-dark {
    display: none;
  }
}

@container style(--color-scheme: dark) {
  .card.featured {
    font-weight: 300;
  }

  #logo {
    display: none;
  }
}
```

<a id="3-optional-utility-classes-for-toggling-visibility"></a>

### 3. 可选：切换可见性的工具类

根据条件是否匹配切换可见性非常常见。工具类必须胜过任意组件样式（因此使用 `!important`），而其显示时的 `display` 值未知，不能通过覆盖处理，应使用 `not style(...)` 限定：

```css
@container not style(--color-scheme: dark) {
  .if-dark {
    display: none !important;
  }
}

@container not style(--color-scheme: light) {
  .if-light {
    display: none !important;
  }
}
```

<a id="fallbacks"></a>

## 回退

容器样式查询的 Baseline 状态：新近可用。自 2026-05-19 起达到 Baseline。
支持：Chrome 111（2023 年 3 月）、Edge 111（2023 年 3 月）、Firefox 151（2026 年 5 月）和 Safari 18（2024 年 9 月）。

根据分支的重要程度和可接受回退，存在两种方案：

1. 对关键分支，如果不支持样式查询时所有状态也必须正确工作，就不能使用样式查询。应采用上面的直接方案，为每个状态复制规则。工具类仍可使用，只要也用相同方式定义。
2. 对非关键分支，如果默认状态可以接受，就在任何 `@container` 外定义基础样式，仅用样式查询覆盖。这保留了该方法的大部分思想，主要缺点是覆盖会引入值之间的耦合。

```css
#logo-dark {
  display: none;
}

@container style(--color-scheme: dark) {
  #logo-dark {
    display: inline; /* override */
  }

  #logo {
    display: none;
  }
}
```

