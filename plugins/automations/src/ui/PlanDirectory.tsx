import { OccurrenceDetail } from "./OccurrenceDetail.js";
import { AutomaticRunControl } from "./AutomaticRunControl.js";
import type { PlanSummary, PlanWrite, PlanWriteResult } from "@huhu/contracts";
import { Badge, Button, Dialog, EmptyState, Field, IconButton, Select } from "@huhu/ui";
import {
  readAutomationPlanLink, requestAutomationSource, requestOpenAgentSession, requestOpenTask, useCapability, useDiscoveredCapabilities, writeAutomationPlanLink,
  useEngine, useModuleIcons, useQueryClient, type ModuleProps,
} from "@huhu/workbench";
import { ArrowLeft, ArrowUpRight, Ellipsis, Layers, Pause, Pencil, Play, Plus, RefreshCw, Workflow } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ObservationConfiguration } from "../engine/observations.js";
import { planSourceName, planStates } from "../shared/plan-directory.js";
import { ObservationEditor } from "./ObservationEditor.js";
import { blockedLabel, describeTrigger, formatMoment, occurrenceLabel, planZone } from "./plan-presentation.js";
import { PlanScheduleControls, planIntentId } from "./PlanScheduleControls.js";
import { TaskReminderEditor } from "./TaskReminderEditor.js";
import { RuleDetails } from "./RuleDetails.js";
import type { EditableRule, RuleTemplate } from "./RuleEditor.js";
import { RuleDraftDialog } from "./RuleDraftDialog.js";
import { uncertainPlanWrite } from "./plan-write.js";
import { t } from "./i18n.js";

type Page = { plans: PlanSummary[]; nextCursor: string | null };
type Filter = {
  query: string; plugin: string; action: string; state: "" | (typeof planStates)[number]; order: "recent" | "title" | "next";
};
type Sheet =
  | { kind: "templates" | "reminder" | "restore-default" }
  | { kind: "rule"; rule?: EditableRule; template?: RuleTemplate }
  | { kind: "observation"; config?: ObservationConfiguration; target?: "task" | "agent-session" }
  | { kind: "menu" | "delete"; plan: PlanSummary }
  | { kind: "occurrence"; id: string; plan: PlanSummary };

const initialFilter: Filter = { query: "", plugin: "", action: "", state: "", order: "recent" };
const stateNames: Record<(typeof planStates)[number], string> = {
  enabled: "已启用", paused: "已暂停", blocked: "受阻", completed: "一次性已完成", unrun: "尚未运行", failed: "最近失败", attention: "待处理",
};
const actionOptions = {
  "automations.runNow": "执行规则",
  "tasks.dispatch": "任务跟进",
  "notifications.create": "递送提醒",
  "automations.plans.createObservation": "观察状态",
  "mail.sync.refresh": "同步邮件",
  "sync.run": "同步 Git",
  "ssh.monitor.panels.run": "采样监控",
  "home.focus.update": "结算专注",
  "ledger.recurring.generate": "生成固定收支",
};
const sourceOptions = ["automations", "tasks", "agent-cli", "mail", "versioning", "ssh", "kernel", "ledger"];

const templates = [
  { id: "reminder", title: "周期提醒", detail: "按日历发送提醒或创建任务", draft: { kind: "reminder", title: "周期提醒", cron: "0 9 * * *" } },
  { id: "scan", title: "扫描 Agent 任务", detail: "每 15 分钟检查可派遣的任务", draft: { kind: "agent_tasks", title: "处理可执行的 Agent 任务", cron: "*/15 * * * *" } },
  { id: "prompt", title: "定时固定需求", detail: "选择 Space 和 CLI，每次创建并派遣新任务", draft: { kind: "agent_prompt", title: "定时固定需求", cron: "0 9 * * *" } },
  { id: "observation", title: "Agent 状态变化提醒", detail: "选择现有 Agent 会话和递送方式" },
] as const;

let returnState: { vaultId: string; filter: Filter; cursors: string[] } | undefined;

export function PlanDirectory({ active, onNavigate, onOpenRuns, registerLeaveGuard, requestedPlan }: {
  active: boolean;
  onNavigate: ModuleProps["onNavigate"];
  registerLeaveGuard: ModuleProps["registerLeaveGuard"];
  onOpenRuns(planId: string): void;
  requestedPlan: { id: string } | null;
}) {
  const engine = useEngine();
  const cache = useQueryClient();
  const discovered = useDiscoveredCapabilities();
  const modules = useModuleIcons();
  const vault = useCapability<{ readOnly: boolean }>("vault.info");
  const [filter, setFilter] = useState(() => returnState?.vaultId === engine.vaultId ? returnState.filter : initialFilter);
  const [cursors, setCursors] = useState<string[]>(() => returnState?.vaultId === engine.vaultId ? returnState.cursors : []);
  const [selected, setSelected] = useState(() => readAutomationPlanLink(engine.vaultId));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState("");
  const [write, setWrite] = useState<PlanWrite | null>(null);
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const detailRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const sourceLookup = useRef<AbortController | null>(null);
  const focusDetail = useRef(selected !== null);
  const scrollBeforeDetail = useRef(0);
  const cursor = cursors.at(-1);
  const plans = useCapability<Page>("automations.plans.list", {
    limit: 12, order: filter.order, ...(cursor && { cursor }),
    ...(filter.plugin && { plugin: filter.plugin }), ...(filter.action && { action: filter.action }),
    ...(filter.state && { state: filter.state }), ...(filter.query.trim() && { query: filter.query.trim() }),
  }, { enabled: active });
  const rows = plans.data?.plans ?? [];
  const detail = useCapability<PlanSummary | null>("automations.plans.read", { planId: selected }, { enabled: active && selected !== null });
  const selectedPlan = detail.data?.intent === "deleted" ? null : detail.data;
  const empty = useCapability<Page>("automations.plans.list", { limit: 1 }, { enabled: active && Boolean(filter.plugin || filter.action || filter.state || filter.query) });
  const capabilities = discovered.data?.map(({ name }) => name);
  const writable = vault.data?.readOnly === false;
  const canCreate = writable && Boolean(capabilities?.includes("automations.create"));
  const canObserve = writable && Boolean(capabilities?.includes("automations.plans.createObservation"));
  const refresh = () => cache.invalidateQueries({ queryKey: [engine.vaultId], predicate: ({ queryKey }) => String(queryKey[1]).startsWith("automations.") });

  useEffect(() => {
    if (!selectedPlan || !focusDetail.current) return;
    detailRef.current?.focus({ preventScroll: true });
    detailRef.current?.scrollIntoView({ block: "nearest" });
    focusDetail.current = false;
  }, [selectedPlan]);
  useEffect(() => () => sourceLookup.current?.abort(), [active, selected]);
  useEffect(() => {
    if (!requestedPlan) return;
    focusDetail.current = true;
    setSelected(requestedPlan.id);
    writeAutomationPlanLink(engine.vaultId, requestedPlan.id);
  }, [requestedPlan, engine.vaultId]);

  function select(planId: string | null) {
    setSelected(planId);
    writeAutomationPlanLink(engine.vaultId, planId);
  }

  function back() {
    select(null);
    const previous = origin.current;
    requestAnimationFrame(() => {
      const target = previous?.isConnected ? previous : searchRef.current;
      const scroller = target?.closest("main");
      if (scroller) scroller.scrollTop = scrollBeforeDetail.current;
      target?.focus({ preventScroll: true });
    });
  }

  function filterBy(next: Filter) {
    setFilter(next);
    setCursors([]);
    select(null);
  }

  function openSheet(next: Sheet) {
    setError("");
    setSheet(next);
  }

  async function openEditor(plan: PlanSummary) {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError("");
    try {
      if (plan.trigger.kind === "observe") {
        const config = await engine.call<ObservationConfiguration | null>("automations.plans.readObservation", { planId: plan.planId });
        if (!config) throw new Error("原观察已删除。");
        openSheet({ kind: "observation", config });
      } else {
        const rule = await engine.call<EditableRule>("automations.read", { id: plan.planId });
        openSheet({ kind: "rule", rule });
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "暂时无法读取编辑内容。");
    } finally {
      submitted.current = false;
      setBusy(false);
    }
  }

  async function submit(input: PlanWrite) {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError("");
    setWrite(input);
    try {
      const result = await engine.call<PlanWriteResult>("automations.plans.submit", input, { write: true, idempotencyKey: input.intentId, intentKey: input.intentId });
      if (result.outcome === "unknown") {
        setError("未确认计划变更。可以核对原请求。");
        return;
      }
      setWrite(null);
      if (result.outcome === "not-accepted") setError(result.error.message);
      else if (input.change === "delete") {
        setSheet(null);
        if (selected === input.planId) back();
      }
      await refresh();
    } catch (failure) {
      if (!uncertainPlanWrite(failure)) setWrite(null);
      setError(failure instanceof Error ? failure.message : "暂时无法确认计划变更。");
    } finally {
      submitted.current = false;
      setBusy(false);
    }
  }

  async function restoreDefault() {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await engine.call<{ ruleId: string }>("automations.plans.defaultTaskScan", { action: "restore" }, { write: true });
      setFilter(initialFilter);
      setCursors([]);
      select(result.ruleId);
      setSheet(null);
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "无法恢复默认扫描。");
    } finally {
      submitted.current = false;
      setBusy(false);
    }
  }

  function toggle(plan: PlanSummary) {
    if (write) return;
    void submit({ change: "set-intent", planId: plan.planId, expectedRevision: plan.revision, intentId: planIntentId(),
      intent: plan.intent === "enabled" ? "paused" : "enabled" });
  }

  async function openSource(plan: PlanSummary) {
    const { plugin, object } = plan.source;
    setError("");
    if (plugin === "agent-cli" && object.kind === "agent-session") {
      sourceLookup.current?.abort();
      const lookup = new AbortController();
      sourceLookup.current = lookup;
      try {
        const sessions = await engine.call<{ id: string; spaceId: string }[]>("agent.sessions.list", {}, { signal: lookup.signal });
        if (lookup.signal.aborted || readAutomationPlanLink(engine.vaultId) !== plan.planId) return;
        const sourceSession = sessions.find(({ id }) => id === object.id);
        if (!sourceSession) throw new Error("原 Agent 会话已不可用。");
        requestOpenAgentSession({ vaultId: engine.vaultId, spaceId: sourceSession.spaceId, sessionId: sourceSession.id });
      } catch (failure) {
        if (!lookup.signal.aborted) setError(failure instanceof Error ? failure.message : "无法打开原 Agent 会话。");
        return;
      } finally {
        if (sourceLookup.current === lookup) sourceLookup.current = null;
      }
    }
    if (plugin === "tasks" && object.kind === "task") requestOpenTask(object.id);
    returnState = { vaultId: engine.vaultId, filter, cursors };
    if (plugin === "ledger" && object.kind === "ledger-book") {
      requestAutomationSource(engine.vaultId, plan);
      onNavigate?.("ledger", "recurring");
    } else if (plugin === "versioning") onNavigate?.("settings", "versioning");
    else {
      if (plugin === "mail" || (plugin === "ssh" && !engine.endpoint.browserSessionId && object.kind === "ssh-monitor-panel")) {
        requestAutomationSource(engine.vaultId, plan);
      }
      onNavigate?.(plugin === "kernel" ? "home" : plugin);
    }
  }

  const allEmpty = plans.data && rows.length === 0 && !cursor && (!filter.query && !filter.plugin && !filter.action && !filter.state || empty.data?.plans.length === 0);
  const filtersActive = Boolean(filter.query || filter.plugin || filter.action || filter.state);
  const currentSheet = sheet && sheet.kind === "rule" ? sheet : null;

  return (
    <div className="automations-plan-center" data-testid="plan-directory" hidden={!active}>
      <div className="automations-plan-heading">
        <h1>计划</h1>
        <div className="row">
          <AutomaticRunControl />
          <IconButton icon={RefreshCw} label="刷新目录" disabled={plans.isFetching} onClick={() => void refresh()} />
          <Button icon={Layers} disabled={!canCreate && !canObserve} onClick={() => openSheet({ kind: "templates" })}>从模板新建</Button>
          <Button icon={Plus} disabled={!canObserve} onClick={() => openSheet({ kind: "observation" })}>新建状态观察</Button>
          <Button variant="primary" icon={Plus} disabled={!canCreate} onClick={() => openSheet({ kind: "rule" })} data-testid="rule-new">新建计划</Button>
        </div>
      </div>
      {vault.data?.readOnly ? <p role="status">当前 Vault 为只读。</p> : null}
      {plans.error ? <p role="alert" className="hu-field-error">{plans.error.message}</p> : null}
      {error && !sheet ? <p role="alert" className="hu-field-error">{error}</p> : null}
      {write && !sheet ? <Button disabled={busy} onClick={() => void submit(write)}>核对原变更</Button> : null}
      <div className={`automations-plan-columns${selected ? " automations-plan-has-detail" : ""}`}>
        <section className="automations-plan-list-panel" aria-label="计划目录">
          <div className="automations-plan-filters">
            <Field label="搜索计划"><input ref={searchRef} type="search" aria-label="搜索计划" placeholder="名称、来源或目标" maxLength={256} value={filter.query} onChange={(e) => filterBy({ ...filter, query: e.target.value })} /></Field>
            <Field label="来源"><Select aria-label="来源" value={filter.plugin} onChange={(e) => filterBy({ ...filter, plugin: e.target.value })}>
              <option value="">全部来源</option>{sourceOptions.map((source) => <option key={source} value={source}>{planSourceName(source)}</option>)}
            </Select></Field>
            <Field label="动作"><Select aria-label="动作" value={filter.action} onChange={(e) => filterBy({ ...filter, action: e.target.value })}>
              <option value="">全部动作</option>{Object.entries(actionOptions).map(([action, title]) => <option key={action} value={action}>{title}</option>)}
            </Select></Field>
            <Field label="状态"><Select aria-label="状态" value={filter.state} onChange={(e) => filterBy({ ...filter, state: e.target.value as Filter["state"] })}>
              <option value="">全部状态</option>{planStates.map((state) => <option key={state} value={state}>{stateNames[state]}</option>)}
            </Select></Field>
            <Field label="排序"><Select aria-label="排序" value={filter.order} onChange={(e) => { setCursors([]); setFilter({ ...filter, order: e.target.value as Filter["order"] }); }}>
              <option value="recent">最近修改</option><option value="title">名称</option><option value="next">下次执行</option>
            </Select></Field>
            {filtersActive ? <Button variant="ghost" onClick={() => { filterBy(initialFilter); searchRef.current?.focus(); }}>清除筛选</Button> : null}
          </div>
          <p className="automations-plan-page-status" role="status">{plans.isPending ? "正在读取计划…" : plans.data ? `第 ${cursors.length + 1} 页 · ${rows.length} 项` : ""}</p>
          <ul className="automations-plan-rows">
            {rows.map((plan) => (
              <li key={plan.planId} data-plan-id={plan.planId} className={selected === plan.planId ? "automations-plan-row-selected" : ""}>
                <button type="button" className="automations-plan-row-main" data-testid="rule-row"
                  aria-label={`打开自动化 ${plan.title}`} aria-current={selected === plan.planId ? "true" : undefined} onClick={(e) => {
                    origin.current = e.currentTarget;
                    scrollBeforeDetail.current = e.currentTarget.closest("main")?.scrollTop ?? 0;
                    focusDetail.current = plan.planId !== selected;
                    select(plan.planId);
                  }}>
                  <strong>{plan.title}</strong>
                  <span><PlanBadges plan={plan} /> {plan.needsAttention ? <Badge tone="warning">子运行待处理</Badge> : null} <small>{planSourceName(plan.source.plugin)}</small></span>
                  <span>{plan.action.summary}</span>
                  <small>{plan.businessSchedule?.label ?? describeTrigger(plan.trigger)}</small>
                  <small>下次 {plan.nextAt ? formatMoment(plan.nextAt, planZone(plan)) : "未安排"} · {recentLabel(plan)}</small>
                </button>
                <div className="automations-plan-row-actions">
                  <IconButton icon={plan.intent === "enabled" ? Pause : Play} label={`${plan.intent === "enabled" ? "暂停" : "启用"} ${plan.title}`}
                    disabled={busy || write !== null || !plan.actions.includes(plan.intent === "enabled" ? "pause" : "resume")} onClick={() => toggle(plan)} />
                  <IconButton icon={Ellipsis} label={`更多操作 · ${plan.title}`} onClick={() => openSheet({ kind: "menu", plan })} />
                </div>
              </li>
            ))}
          </ul>
          {!plans.isPending && !plans.isError && !rows.length ? <EmptyState icon={Workflow}
            title={allEmpty ? "尚无计划" : "没有匹配的计划"}
            hint={allEmpty ? "可新建计划，或从模板开始。" : "调整筛选条件或返回上一页。"} /> : null}
          <div className="row">
            {cursor ? <Button onClick={() => setCursors((prev) => prev.slice(0, -1))}>上一页</Button> : null}
            {plans.data?.nextCursor ? <Button onClick={() => setCursors([...cursors, plans.data!.nextCursor!])}>下一页</Button> : null}
          </div>
        </section>
        {selected ? (
          <section className="automations-plan-inspector" aria-label="计划详情" data-testid="rule-detail">
            <Button variant="ghost" icon={ArrowLeft} onClick={back}>返回计划目录</Button>
            {detail.error ? <p role="alert">{detail.error.message}</p> : null}
            {detail.isPending ? <p role="status">正在读取计划详情…</p> : null}
            {selectedPlan === null ? <p>原计划已移除或不可访问。</p> : null}
            {selectedPlan ? (
              <>
                {!rows.some(({ planId }) => planId === selected) ? <p role="status">此计划在当前列表页之外。</p> : null}
                <PlanBadges plan={selectedPlan} />
                <h2 ref={detailRef} tabIndex={-1}>{selectedPlan.title}</h2>
                <PlanInspector key={selected} plan={selectedPlan} busy={busy || write !== null}
                  onEdit={() => void openEditor(selectedPlan)} onToggle={() => toggle(selectedPlan)}
                  onMenu={() => openSheet({ kind: "menu", plan: selectedPlan })}
                  onOccurrence={(id) => openSheet({ kind: "occurrence", id, plan: selectedPlan })}
                  onSource={onNavigate && selectedPlan.source.plugin !== "automations" && (selectedPlan.source.plugin !== "ssh" || !engine.endpoint.browserSessionId)
                    && (selectedPlan.source.plugin === "kernel" || modules[selectedPlan.source.plugin])
                    ? () => void openSource(selectedPlan) : undefined}
                  refresh={refresh} registerLeaveGuard={registerLeaveGuard} />
              </>
            ) : null}
          </section>
        ) : null}
      </div>
      {sheet?.kind === "templates" ? (
        <Dialog open wide title="从模板新建" onClose={() => setSheet(null)}>
          <p>模板会填入新表单，保存后默认暂停。</p>
          <div className="automations-plan-template-grid">
            {templates.map((template) => {
              const available = template.id === "observation" ? canObserve && capabilities?.includes("agent.sessions.list") : canCreate && (template.id === "reminder" || capabilities?.includes(template.id === "scan" ? "tasks.list" : "agent.catalog.detect"));
              return <article key={template.id}><h3>{template.title}</h3><p>{template.detail}</p>
                {!available ? <p>需要启用相应来源插件。</p> : null}
                <Button disabled={!available} onClick={() => openSheet("draft" in template ? { kind: "rule", template: template.draft } : { kind: "observation", target: "agent-session" })}>
                  使用模板 · {template.title}
                </Button>
              </article>;
            })}
            <article><h3>一次性任务提醒</h3><p>选择任务和提醒时刻。</p>
              {writable && capabilities?.includes("tasks.list") && capabilities.includes("automations.plans.createTaskReminder") ?
                <Button onClick={() => openSheet({ kind: "reminder" })}>使用模板 · 一次性任务提醒</Button>
                : <p>需要启用任务插件。</p>}
            </article>
            <article><h3>恢复系统默认扫描</h3><p>恢复系统原有的扫描计划和固定身份。</p>
              <Button disabled={!writable || !capabilities?.includes("automations.plans.defaultTaskScan") || !capabilities.includes("tasks.list")}
                onClick={() => openSheet({ kind: "restore-default" })}>恢复默认扫描</Button>
            </article>
            <article><h3>来源计划</h3><p>Mail、Git 与 SSH 计划需要先在原模块配置账号、仓库或监控面板。</p></article>
          </div>
        </Dialog>
      ) : null}
      {sheet?.kind === "restore-default" ? <Dialog open title="恢复默认扫描" error={error} onClose={() => { if (!busy) setSheet(null); }}
        actions={<><Button disabled={busy} onClick={() => setSheet(null)}>取消</Button>
          <Button variant="primary" disabled={busy} onClick={() => void restoreDefault()}>确认恢复</Button></>}>
        <p>如果系统默认扫描已移除，恢复后会按每 15 分钟检查一次可派遣任务。</p>
      </Dialog> : null}
      {sheet?.kind === "reminder" ? <TaskReminderEditor registerLeaveGuard={registerLeaveGuard} onClose={() => setSheet(null)} onSaved={(planId) => {
        setFilter(initialFilter); setCursors([]); select(planId); setSheet(null); void refresh();
      }} /> : null}
      {currentSheet ? <RuleDraftDialog key={currentSheet.rule?.id ?? "new"}
        {...(currentSheet.rule && { rule: currentSheet.rule })} {...(currentSheet.template && { template: currentSheet.template })}
        registerLeaveGuard={registerLeaveGuard} onClose={() => setSheet(null)} onSaved={(id) => {
          setSheet(null);
          if (!currentSheet.rule) { setFilter(initialFilter); setCursors([]); }
          select(id);
          void refresh();
        }} /> : null}
      {sheet?.kind === "observation" ? <ObservationEditor
        {...(sheet.config && { initial: sheet.config })} {...(sheet.target && { targetKind: sheet.target })}
        onClose={() => setSheet(null)} onSaved={refresh} registerLeaveGuard={registerLeaveGuard} /> : null}
      {sheet?.kind === "menu" ? (
        <Dialog open title="计划操作" onClose={() => setSheet(null)} error={error}>
          <p>{sheet.plan.title}</p>
          <div className="row">
            {canEdit(sheet.plan) ? <Button disabled={busy} icon={Pencil} onClick={() => void openEditor(sheet.plan)}>编辑计划</Button> : null}
            <Button onClick={() => { setSheet(null); onOpenRuns(sheet.plan.planId); }}>查看运行记录</Button>
            {sheet.plan.actions.includes("delete") ? <Button variant="danger" disabled={busy || write !== null} onClick={() => openSheet({ kind: "delete", plan: sheet.plan })}>删除计划</Button> : null}
          </div>
        </Dialog>
      ) : null}
      {sheet?.kind === "delete" ? <DeletePlan plan={sheet.plan} pending={write} busy={busy} error={error}
        onClose={() => setSheet(null)} onSubmit={(input) => void submit(input)} /> : null}
      {sheet?.kind === "occurrence" ? <Dialog open title="运行详情" wide onClose={() => setSheet(null)}><h3>{sheet.plan.title}</h3><OccurrenceDetail key={sheet.id} id={sheet.id} onNavigate={onNavigate} /></Dialog> : null}
    </div>
  );
}

function canEdit(plan: PlanSummary) {
  return plan.actions.includes("reschedule") && (plan.trigger.kind === "observe" || plan.action.capability === "automations.runNow");
}

function PlanBadges({ plan }: { plan: PlanSummary }) {
  return <>
    <Badge tone={plan.intent === "enabled" ? "success" : "neutral"}>{plan.intent === "enabled" ? t.enabled : plan.intent === "paused" ? t.paused : "已删除"}</Badge>
    {plan.availability.state === "blocked" ? <Badge>{blockedLabel[plan.availability.reason]}</Badge> : null}
  </>;
}

function recentLabel(plan: PlanSummary) {
  const last = plan.lastOccurrence;
  return !last ? "尚未运行" : last.state === "completed" ? "最近一次已完成"
    : last.state === "failed" ? "最近一次执行失败" : `最近 ${occurrenceLabel[last.state]}`;
}

function DeletePlan({ plan, pending, busy, error, onClose, onSubmit }: {
  plan: PlanSummary; pending: PlanWrite | null; busy: boolean; error: string;
  onClose(): void; onSubmit(input: PlanWrite): void;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open title="删除计划" initialFocusRef={keep} onClose={() => { if (!busy) onClose(); }} error={error}
      actions={<><Button ref={keep} disabled={busy} onClick={onClose}>取消</Button>
        <Button variant="danger" disabled={busy} onClick={() => onSubmit(pending ?? {
          change: "delete", planId: plan.planId, expectedRevision: plan.revision, intentId: planIntentId(),
        })}>{pending ? "核对原删除请求" : "删除计划"}</Button></>}>
      <p>删除「{plan.title}」会停止未来触发。原来源对象和已受理的运行仍可查看。</p>
    </Dialog>
  );
}

function PlanInspector({ plan, busy, onEdit, onToggle, onMenu, onOccurrence, onSource, refresh, registerLeaveGuard }: {
  plan: PlanSummary; busy: boolean;
  onEdit(): void; onToggle(): void; onMenu(): void; onOccurrence(id: string): void;
  onSource: (() => void) | undefined; refresh(): Promise<unknown>; registerLeaveGuard: ModuleProps["registerLeaveGuard"];
}) {
  const isRule = plan.action.capability === "automations.runNow";
  const rule = useCapability<EditableRule>("automations.read", { id: plan.planId }, { enabled: isRule });
  return (
    <>
      <p>{planSourceName(plan.source.plugin)}{!isRule ? ` · ${plan.source.object.id}` : ""}</p>
      {plan.availability.state === "blocked" ? <p role="status">{plan.availability.detail ?? blockedLabel[plan.availability.reason]}</p> : null}
      <div className="row">
        {canEdit(plan) ? <Button icon={Pencil} disabled={busy} onClick={onEdit} data-testid="rule-edit">{plan.trigger.kind === "observe" ? "编辑观察" : "编辑计划"}</Button> : null}
        {plan.actions.includes(plan.intent === "enabled" ? "pause" : "resume") ? <Button disabled={busy} onClick={onToggle}>{plan.intent === "enabled" ? "暂停" : "启用"}</Button> : null}
        <Button icon={Ellipsis} onClick={onMenu}>更多操作</Button>
      </div>
      <div className="automations-plan-facts">
        <div><small>下次执行</small><strong>{plan.nextAt ? <time dateTime={plan.nextAt}>{formatMoment(plan.nextAt, planZone(plan))}</time> : "未安排"}</strong></div>
        <div><small>最近发生</small>{plan.lastOccurrence
          ? <Button variant="ghost" onClick={() => onOccurrence(plan.lastOccurrence!.occurrenceId)}>{recentLabel(plan)}</Button>
          : <strong>尚未运行</strong>}</div>
      </div>
      <section className="automations-plan-detail-section"><h3>做什么</h3><p>{plan.action.summary}</p>
        {rule.data && rule.data.data.legacyEnvironment !== true ? <RuleRun rule={rule.data} plan={plan} refresh={refresh} onOccurrence={onOccurrence} /> : null}
        {rule.error ? <p role="alert">{rule.error.message}</p> : null}
        {rule.data ? <RuleDetails rule={rule.data} /> : null}
      </section>
      <section className="automations-plan-detail-section"><h3>何时执行</h3><p>{plan.businessSchedule?.label ?? describeTrigger(plan.trigger)}</p>
        {!isRule ? <PlanScheduleControls plan={plan} changed={refresh} scheduleOnly registerLeaveGuard={registerLeaveGuard} /> : null}
      </section>
      <section className="automations-plan-detail-section"><h3>执行与结果</h3>
        <p>{plan.owner.scope === "vault" ? "当前 Vault" : plan.owner.scope === "device" ? "绑定设备" : "绑定连接"}</p>
        {onSource ? <Button icon={ArrowUpRight} onClick={onSource}>{plan.source.plugin === "tasks" ? "打开来源任务" : `打开${planSourceName(plan.source.plugin)}`}</Button> : null}
      </section>
    </>
  );
}

type RunIntent = { id: string; expectedVersion: string; intentId: string };
const pendingRuleRuns = new Map<string, RunIntent>();
const submittingRuleRuns = new Set<string>();

function RuleRun({ rule, plan, onOccurrence, refresh }: {
  rule: EditableRule; plan: PlanSummary; onOccurrence(id: string): void; refresh(): Promise<unknown>;
}) {
  const engine = useEngine();
  const scope = JSON.stringify([engine.vaultId, engine.endpoint.browserSessionId ?? "desktop", rule.id]);
  const [pending, setPending] = useState(() => pendingRuleRuns.get(scope) ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState<string | null>(null);
  async function run() {
    if (submittingRuleRuns.has(scope)) return;
    submittingRuleRuns.add(scope);
    setBusy(true);
    setError("");
    const input = pendingRuleRuns.get(scope) ?? { id: rule.id, expectedVersion: rule.version, intentId: planIntentId() };
    pendingRuleRuns.set(scope, input);
    setPending(input);
    try {
      const result = await engine.call<{ activationId: string; summary: { state?: string } | null }>("automations.runNow", input,
        { write: true, idempotencyKey: input.intentId });
      const unknown = result.summary?.state === "unknown" || result.summary?.state === "pending";
      if (unknown) setError("原运行已受理，结果仍待核实。");
      else {
        pendingRuleRuns.delete(scope);
        setPending(null);
      }
      setLastRun(result.activationId);
      await refresh();
    } catch (failure) {
      if (!uncertainPlanWrite(failure)) {
        pendingRuleRuns.delete(scope);
        setPending(null);
      }
      setError(failure instanceof Error ? failure.message : "暂时无法确认运行。");
    } finally {
      setBusy(false);
      submittingRuleRuns.delete(scope);
    }
  }

  return <div className="row">
    <Button variant="primary" icon={Play} disabled={busy || (!pending && (plan.availability.state === "blocked" || plan.lastOccurrence?.state === "unknown"))} onClick={() => void run()}>
      {pending && !busy ? "核对原运行" : t.runNow}
    </Button>
    {lastRun ? <Button onClick={() => onOccurrence(lastRun)}>查看本次运行</Button> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
