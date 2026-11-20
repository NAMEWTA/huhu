import { Button } from "@huhu/ui";
import { CapabilityError, useCapability, useDiscoveredCapabilities } from "@huhu/workbench";
import { t } from "./i18n.js";

type RuleSummary = { data: { enabled: boolean } };
type RunSummary = { id: string; title: string; state: string; startedAt: string | null };

export function AutomationHomeWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  const directory = useDiscoveredCapabilities();
  const canReadRuns = directory.data?.some(({ name }) => name === "automations.runs.list") === true;
  const rules = useCapability<RuleSummary[]>("automations.list");
  const runs = useCapability<RunSummary[]>("automations.runs.list", { limit: 1 }, { enabled: canReadRuns });
  const latest = runs.data?.[0];
  const denied = runs.error instanceof CapabilityError && runs.error.code === "PERMISSION_DENIED";
  return (
    <>
      <div aria-busy={rules.isPending}>
        {rules.isError ? (
          <>
            <p role="alert">无法读取自动化规则</p>
            <Button onClick={() => void rules.refetch()}>重试</Button>
          </>
        ) : rules.data ? (
          <p data-testid="automation-widget-rule-count">已启用 {rules.data.filter(({ data }) => data.enabled).length} 条规则</p>
        ) : (
          <p>正在读取规则…</p>
        )}
      </div>
      <div aria-busy={canReadRuns && runs.isPending}>
        {!canReadRuns || denied ? (
          <p>当前连接没有读取运行记录的权限</p>
        ) : runs.isError ? (
          <>
            <p role="alert">无法读取最近运行</p>
            <Button onClick={() => void runs.refetch()}>重试</Button>
          </>
        ) : latest ? (
          <p data-testid="automation-widget-latest-run">
            {latest.title} · {t.runs.state[latest.state] ?? latest.state}
            {latest.startedAt && (
              <>
                {" "}
                · <time dateTime={latest.startedAt}>{new Date(latest.startedAt).toLocaleString("zh-CN")}</time>
              </>
            )}
          </p>
        ) : (
          <p>{runs.isPending ? "正在读取最近运行…" : "暂无运行记录"}</p>
        )}
      </div>
      <Button onClick={() => onNavigate("automations")}>打开自动化</Button>
    </>
  );
}
