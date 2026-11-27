import { APPEARANCE_CHANGED } from "@huhu/ui";
import type { ECharts, EChartsOption } from "echarts";
import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { ChartSelection } from "./LedgerCanvas.js";
import type { ChartTheme } from "./report-chart-options.js";

const LedgerCanvas = lazy(() => import("./LedgerCanvas.js"));

export function LedgerChart({ id, build, onSelect, compact = false }: { id: string; build(theme: ChartTheme): EChartsOption; onSelect?(point: ChartSelection): void; compact?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<ECharts | null>(null);
  const [theme, setTheme] = useState<ChartTheme>();
  const [sized, setSized] = useState(false);

  useEffect(() => {
    const element = container.current!;
    const updateTheme = () => {
      const styles = getComputedStyle(element);
      const token = (name: string) => styles.getPropertyValue(name).trim();
      setTheme({
        foreground: token("--text"),
        muted: token("--muted"),
        surface: token("--panel"),
        border: token("--line-strong"),
        accent: token("--accent"),
        income: token("--success-text"),
        expense: token("--danger-text"),
        palette: Array.from({ length: 8 }, (_, index) => token(`--tag-${index + 1}`)),
        fontFamily: styles.fontFamily,
      });
    };
    const resize = () => {
      if (!element.clientWidth || !element.clientHeight) return;
      setSized(true);
      if (instance.current && !instance.current.isDisposed()) instance.current.resize();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    updateTheme();
    window.addEventListener(APPEARANCE_CHANGED, updateTheme);
    return () => {
      observer.disconnect();
      window.removeEventListener(APPEARANCE_CHANGED, updateTheme);
      instance.current = null;
    };
  }, []);

  return (
    <div ref={container} className={compact ? "ledger-chart ledger-chart-compact" : "ledger-chart"} data-testid={`ledger-chart-${id}`} aria-hidden="true">
      {sized && theme && (
        <Suspense fallback={null}>
          <LedgerCanvas
            option={build(theme)}
            onReady={(chart) => {
              instance.current = chart;
            }}
            onSelect={onSelect}
          />
        </Suspense>
      )}
    </div>
  );
}

export function ReportTable({ title, children }: { title: string; children: ReactNode }) {
  const caption = useId();
  return (
    <div className="hu-data-table-scroll ledger-chart-table" role="region" aria-labelledby={caption} tabIndex={0}>
      <table className="hu-table">
        <caption id={caption}>{title}</caption>
        {children}
      </table>
    </div>
  );
}
