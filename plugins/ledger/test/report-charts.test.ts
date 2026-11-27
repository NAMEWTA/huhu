// @vitest-environment jsdom
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from "echarts";
import { expect, test } from "vitest";
import { cartesianOption, pieOption, radarOption, type ChartTheme } from "../src/ui/report-chart-options.js";

const theme: ChartTheme = { foreground: "text", muted: "muted", surface: "surface", border: "line", accent: "accent", income: "income", expense: "expense", palette: ["one", "two"], fontFamily: "sans-serif" };

function tooltip(option: EChartsOption, params: TooltipComponentFormatterCallbackParams) {
  const config = Array.isArray(option.tooltip) ? option.tooltip[0] : option.tooltip;
  if (typeof config?.formatter !== "function") throw new Error("Missing tooltip formatter");
  return config.formatter(params, "");
}

const point = (dataIndex: number, seriesIndex: number, name: string, extras: { percent?: number } = {}): Exclude<TooltipComponentFormatterCallbackParams, unknown[]> => ({
  dataIndex,
  seriesIndex,
  name,
  componentType: "series",
  componentSubType: "",
  componentIndex: 0,
  data: 0,
  value: 0,
  $vars: [],
  ...extras,
});

test("overview retains two smooth area lines and reads exact amounts beyond safe integer precision", () => {
  const option = cartesianOption(
    theme,
    "TWD",
    ["2026-01"],
    [
      { name: "收入", amounts: ["9007199254740993123"], color: theme.income, area: true },
      { name: "支出", amounts: ["2"], color: theme.expense, area: true },
    ],
    "overview",
  );
  expect(option.xAxis).toMatchObject({ type: "category", data: ["2026-01"] });
  expect(option.yAxis).toMatchObject({ type: "value", show: false });
  expect(option.series).toMatchObject([
    { type: "line", smooth: true, lineStyle: { color: "income" }, areaStyle: { opacity: 0.08 } },
    { type: "line", smooth: true, data: [0.02], lineStyle: { color: "expense" } },
  ]);
  const body = tooltip(option, [point(0, 0, "2026-01"), point(0, 1, "2026-01")]);
  expect(body).toBeInstanceOf(HTMLElement);
  expect((body as HTMLElement).textContent).toContain("TWD 90071992547409931.23");
});

test("stacked bars add exact values before formatting and duplicate legends remain independent", () => {
  const option = cartesianOption(
    theme,
    "JPY",
    ["2026-01-01"],
    [
      { name: "分类", amounts: ["9007199254740993"] },
      { name: "分类", amounts: ["2"] },
    ],
    "bar",
  );
  expect(option.series).toMatchObject([
    { name: "分类", type: "bar", stack: "total" },
    { name: "分类（2）", type: "bar", stack: "total" },
  ]);
  const body = tooltip(option, [point(0, 0, "2026-01-01"), point(0, 1, "2026-01-01")]) as HTMLElement;
  expect(body.lastElementChild?.textContent).toBe("合计 JPY 9007199254740995");
});

test("donut slices keep precision and treat category labels as text; radar omits unavailable axes", () => {
  const label = "<img src=broken>";
  const pie = pieOption(theme, "CNY", [{ name: label, amountMinor: "9007199254740993" }]);
  expect(pie.series).toMatchObject([{ type: "pie", radius: ["45%", "75%"] }]);
  const body = tooltip(pie, point(0, 0, label, { percent: 100 })) as HTMLElement;
  expect(body.querySelector("img")).toBeNull();
  expect(body.textContent).toContain(label);
  expect(body.textContent).toContain("CNY 90071992547409.93 · 100%");

  const metrics = [
    { label: "储蓄", rule: "", score: 40 },
    { label: "保障", rule: "", score: null },
    { label: "杠杆", rule: "", score: 70 },
    { label: "投资", rule: "", score: 20 },
  ];
  const radar = radarOption(theme, metrics);
  expect(radar.radar).toMatchObject({
    indicator: [
      { name: "储蓄", max: 100 },
      { name: "杠杆", max: 100 },
      { name: "投资", max: 100 },
    ],
  });
  expect(radar.series).toMatchObject([{ type: "radar", data: [{ value: [40, 70, 20] }] }]);
});
