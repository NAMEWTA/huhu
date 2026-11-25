import { Badge, Button, Dialog, EmptyState, Select } from "@huhu/ui";
import { useCapability, type ModuleProps } from "@huhu/workbench";
import { History } from "lucide-react";
import { useState } from "react";
import { HistoryState, type HistoryInput, type HistoryPage, type HistoryRow } from "../shared/occurrence-history.js";
import { planSourceName } from "../shared/plan-directory.js";
import { OccurrenceDetail } from "./OccurrenceDetail.js";
import { formatMoment, occurrenceLabel } from "./plan-presentation.js";
import { t } from "./i18n.js";

type Filter = { source: string; query: string; day: string; state: "" | NonNullable<HistoryInput["state"]> };
const empty: Filter = { source: "", query: "", day: "", state: "" };

function localDay(day: string) {
  if (!day) return {};
  const start = new Date(day + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), until: end.toISOString() };
}

export function OccurrenceHistory({ planId, back, onNavigate }: { planId: string | null; back(): void; onNavigate: ModuleProps["onNavigate"] }) {
  const [filter, setFilter] = useState(empty);
  const [pages, setPages] = useState<NonNullable<HistoryInput["cursor"]>[]>([]);
  const [selected, setSelected] = useState<HistoryRow | null>(null);
  const page = useCapability<HistoryPage>("automations.plans.history", {
    ...(planId && { planId }),
    ...(filter.source && { source: filter.source }),
    ...(filter.query && { query: filter.query }),
    ...(filter.state && { state: filter.state }),
    ...localDay(filter.day),
    cursor: pages.at(-1),
  });
  function change(patch: Partial<Filter>) {
    setFilter({ ...filter, ...patch });
    setPages([]);
  }
  return (
    <div className="automations-occurrence-list automations-plan-history hu-stack">
      <h1>{t.nav.activations}</h1>
      {planId ? <Button onClick={back}>返回计划目录</Button> : null}
      <search aria-label="筛选发生" className="hu-toolbar">
        <label>
          搜索发生 <input type="search" maxLength={256} value={filter.query} onChange={(event) => change({ query: event.currentTarget.value })} />
        </label>
        <label>
          来源{" "}
          <Select value={filter.source} onChange={(event) => change({ source: event.currentTarget.value })}>
            <option value="">全部来源</option>
            {[...new Set([...(page.data?.sources ?? []), ...(filter.source ? [filter.source] : [])])].map((source) => (
              <option key={source} value={source}>
                {source === "unknown" ? "未知来源" : planSourceName(source)}
              </option>
            ))}
          </Select>
        </label>
        <label>
          发生状态{" "}
          <Select
            value={filter.state}
            onChange={(event) => {
              const value = event.currentTarget.value;
              change({ state: value === "attention" || value === "" ? value : HistoryState.parse(value) });
            }}
          >
            <option value="">全部状态</option>
            <option value="attention">待处理</option>
            {HistoryState.options.map((state) => (
              <option key={state} value={state}>
                {occurrenceLabel[state]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          发生日期 <input type="date" value={filter.day} onChange={(event) => change({ day: event.currentTarget.value })} />
        </label>
      </search>
      {page.error ? (
        <p role="alert">
          {page.error.message} <Button onClick={() => void page.refetch()}>重新读取</Button>
        </p>
      ) : null}
      {page.isPending ? <p role="status">正在读取激活记录…</p> : null}
      {page.data && !page.data.rows.length ? <EmptyState icon={History} title={filter === empty ? t.noActivations : "没有符合筛选的发生记录"} /> : null}
      {page.data?.rows.map((row) => (
        <article key={row.id} className="automations-occurrence" data-testid="activation-row">
          <header className="hu-toolbar">
            <Button variant="ghost" aria-haspopup="dialog" onClick={() => setSelected(row)}>
              {row.title}
            </Button>
            <time dateTime={row.at}>{formatMoment(row.at)}</time>
            <Badge>{row.trigger === "manual" ? "立即运行" : row.trigger === "scheduled" ? "按排期触发" : "来源事件"}</Badge>
            <Badge>{row.counts && row.state === "completed" ? "受理检查结束" : occurrenceLabel[row.state]}</Badge>
            {row.needsAttention ? <Badge tone="warning">子运行待处理</Badge> : null}
          </header>
          {row.counts ? <p>{t.summary(row.counts)}</p> : null}
        </article>
      ))}
      {pages.length || page.data?.next ? (
        <nav className="hu-toolbar" aria-label="发生记录分页">
          <Button disabled={!pages.length || page.isFetching} onClick={() => setPages(pages.slice(0, -1))}>
            上一页
          </Button>
          <Button
            disabled={!page.data?.next || page.isFetching}
            onClick={() => {
              if (page.data?.next) setPages([...pages, page.data.next]);
            }}
          >
            更早记录
          </Button>
        </nav>
      ) : null}
      <Dialog open={selected !== null} title={selected?.title ?? "运行详情"} wide testId="occurrence-inspector" onClose={() => setSelected(null)}>
        {selected ? <OccurrenceDetail key={selected.id} id={selected.id} {...(selected.terminalRunId && { terminalRunId: selected.terminalRunId })} onNavigate={onNavigate} /> : null}
      </Dialog>
    </div>
  );
}
