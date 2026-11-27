import { BarChart, LineChart, PieChart, RadarChart } from "echarts/charts";
import { GridComponent, LegendComponent, RadarComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import type { ECharts, EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react/esm/core.js";

echarts.use([BarChart, LineChart, PieChart, RadarChart, GridComponent, LegendComponent, RadarComponent, TooltipComponent, CanvasRenderer]);

export type ChartSelection = { componentType: string; dataIndex: number; seriesIndex: number };

export default function LedgerCanvas({ option, onReady, onSelect }: { option: EChartsOption; onReady(chart: ECharts): void; onSelect?: ((point: ChartSelection) => void) | undefined }) {
  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      notMerge
      autoResize={false}
      onChartReady={onReady}
      onEvents={
        onSelect
          ? {
              click: (point: ChartSelection) => {
                if (point.componentType === "series") onSelect(point);
              },
            }
          : {}
      }
      style={{ width: "100%", height: "100%" }}
    />
  );
}
