import { ledgerMinorToDecimal } from "@huhu/contracts";
import type { BarSeriesOption, EChartsOption, LineSeriesOption, TooltipComponentFormatterCallbackParams, TooltipComponentOption } from "echarts";
import { displayMoney } from "../shared/money.js";

export type ChartTheme = {
  foreground: string;
  muted: string;
  surface: string;
  border: string;
  accent: string;
  income: string;
  expense: string;
  palette: string[];
  fontFamily: string;
};

export type MoneySeries = { name: string; amounts: string[]; color?: string; dashed?: boolean; area?: boolean };
export type MoneySlice = { name: string; amountMinor: string };
type Metric = { label: string; rule: string; score: number | null };

function base(theme: ChartTheme): EChartsOption {
  return { color: theme.palette, textStyle: { color: theme.foreground, fontFamily: theme.fontFamily }, animation: false };
}

function tooltip(theme: ChartTheme): TooltipComponentOption {
  return {
    confine: true,
    renderMode: "html",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    textStyle: { color: theme.foreground },
  };
}

function textTooltip(lines: string[]) {
  const content = document.createElement("div");
  content.className = "ledger-chart-tooltip";
  for (const line of lines) {
    const row = document.createElement("div");
    row.textContent = line;
    content.append(row);
  }
  return content;
}

function chartNames(labels: string[]) {
  const used = new Set<string>();
  return labels.map((label) => {
    let name = label;
    for (let n = 2; used.has(name); n++) name = `${label}（${n}）`;
    used.add(name);
    return name;
  });
}

export function cartesianOption(theme: ChartTheme, currency: string, categories: string[], series: MoneySeries[], mode: "overview" | "line" | "bar"): EChartsOption {
  const scale = 10 ** (ledgerMinorToDecimal("0", currency).split(".")[1]?.length ?? 0);
  const bar = mode === "bar";
  const compact = mode === "overview";
  const names = chartNames(series.map(({ name }) => name));
  const plotted: (BarSeriesOption | LineSeriesOption)[] = series.map(({ amounts, color, dashed, area }, index) => {
    const data = amounts.map((amount) => Number(amount) / scale);
    const name = names[index]!;
    if (bar) return { name, type: "bar", stack: "total", data, emphasis: { focus: "series" } };
    return {
      name,
      type: "line",
      data,
      smooth: true,
      symbol: "circle",
      symbolSize: compact || categories.length > 12 ? 5 : 7,
      lineStyle: { type: dashed ? "dashed" : "solid", width: 2, ...(color && { color }) },
      ...(color && { itemStyle: { color } }),
      ...(area && { areaStyle: { opacity: compact ? 0.08 : 0.2 } }),
    };
  });
  return {
    ...base(theme),
    legend: {
      type: "scroll",
      bottom: 0,
      textStyle: { color: theme.muted, overflow: "truncate", width: 112 },
      inactiveColor: theme.muted,
      pageTextStyle: { color: theme.foreground },
      pageIconColor: theme.accent,
      pageIconInactiveColor: theme.border,
    },
    grid: { top: 12, right: 16, bottom: 28, left: compact ? 12 : 8, containLabel: true },
    // Formatter amounts come from the exact DTO strings rather than the plotted coordinates.
    tooltip: {
      ...tooltip(theme),
      trigger: "axis",
      axisPointer: { type: bar ? "shadow" : "line", lineStyle: { color: theme.border }, shadowStyle: { color: theme.border, opacity: 0.4 } },
      formatter: (params) => {
        const entries = Array.isArray(params) ? params : [params];
        const words = entries.flatMap(({ seriesIndex, dataIndex }) => {
          const item = series[seriesIndex ?? -1];
          const amount = item?.amounts[dataIndex];
          return item && amount !== undefined && (!bar || amount !== "0") ? [{ name: item.name, amount }] : [];
        });
        const total = words.reduce((sum, { amount }) => sum + BigInt(amount), 0n).toString();
        return textTooltip([entries[0]?.name ?? "", ...words.map(({ name, amount }) => `${name} ${displayMoney(amount, currency)}`), ...(bar ? [`合计 ${displayMoney(total, currency)}`] : [])]);
      },
    },
    xAxis: {
      type: "category",
      data: categories,
      boundaryGap: bar || compact || categories.length === 1,
      axisLine: { show: !compact, lineStyle: { color: theme.border } },
      axisTick: { show: false },
      axisLabel: { color: theme.muted, hideOverlap: true, rotate: compact ? 0 : 35, formatter: (value: string) => (compact ? value.slice(5) : value) },
    },
    yAxis: {
      type: "value",
      show: !compact,
      axisLabel: { color: theme.muted, formatter: (value: number) => (Math.abs(value) >= 10_000 ? `${(value / 10_000).toFixed(1)}万` : String(value)) },
      splitLine: { lineStyle: { color: theme.border } },
    },
    series: plotted,
  };
}

export function pieOption(theme: ChartTheme, currency: string, slices: MoneySlice[]): EChartsOption {
  const names = chartNames(slices.map(({ name }) => name));
  return {
    ...base(theme),
    tooltip: {
      ...tooltip(theme),
      trigger: "item",
      formatter: (params) => {
        const point = Array.isArray(params) ? params[0] : params;
        const slice = slices[point?.dataIndex ?? -1];
        return slice ? textTooltip([slice.name, `${displayMoney(slice.amountMinor, currency)} · ${point?.percent ?? 0}%`]) : "";
      },
    },
    legend: {
      type: "scroll",
      bottom: 0,
      textStyle: { color: theme.muted, overflow: "truncate", width: 112 },
      inactiveColor: theme.muted,
      pageTextStyle: { color: theme.foreground },
      pageIconColor: theme.accent,
      pageIconInactiveColor: theme.border,
    },
    series: [
      {
        type: "pie",
        radius: ["45%", "75%"],
        center: ["50%", "45%"],
        bottom: 24,
        itemStyle: { borderRadius: 3, borderColor: theme.surface, borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, color: theme.foreground, position: "center", width: 96, overflow: "truncate" }, scaleSize: 8 },
        data: slices.map(({ amountMinor }, index) => ({ name: names[index]!, value: Number(amountMinor) })),
      },
    ],
  };
}

export function radarOption(theme: ChartTheme, metrics: Metric[]): EChartsOption {
  const available = metrics.filter((metric) => metric.score !== null);
  return {
    ...base(theme),
    tooltip: {
      ...tooltip(theme),
      trigger: "item",
      formatter: (_params: TooltipComponentFormatterCallbackParams) => textTooltip(available.map(({ label, score }) => `${label} ${score} / 100`)),
    },
    radar: {
      radius: "56%",
      indicator: available.map(({ label }) => ({ name: label, max: 100 })),
      axisName: { color: theme.muted },
      axisLine: { lineStyle: { color: theme.border } },
      splitLine: { lineStyle: { color: theme.border } },
      splitArea: { show: false },
    },
    series: [
      {
        type: "radar",
        data: [
          {
            name: "财务健康",
            value: available.map(({ score }) => score!),
            itemStyle: { color: theme.accent },
            lineStyle: { color: theme.accent },
            areaStyle: { color: theme.accent, opacity: 0.2 },
          },
        ],
      },
    ],
  };
}
