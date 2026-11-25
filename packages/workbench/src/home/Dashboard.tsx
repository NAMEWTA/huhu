import { DASHBOARD_COLUMNS, defaultDashboardBoard, homeWidgetConfigSchema, homeWidgetType, type DashboardBoard, type DashboardRepairChange, type HomeWidgetDefinition } from "@huhu/contracts";
import { Button, Dialog, IconButton } from "@huhu/ui";
import { Copy, Grip, Plus, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { Component, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { useContainerWidth } from "react-grid-layout";
import { createRequestId } from "../engine-client/client.js";
import { DashboardGrid, DASHBOARD_NARROW_WIDTH } from "./DashboardGrid.js";
import { appendPlacement, movePlacement, orderPlacements, placementAnnouncement, reorderPlacement, resizePlacement, type Placement } from "./dashboard-layout.js";
import type { useDashboard } from "./useDashboard.js";
import "./dashboard.css";

type Instance = DashboardBoard["instances"][number];
type Controller = ReturnType<typeof useDashboard>;
const arrowSteps = new Map<string, readonly [-1 | 0 | 1, -1 | 0 | 1]>([
  ["ArrowLeft", [-1, 0]], ["ArrowRight", [1, 0]], ["ArrowUp", [0, -1]], ["ArrowDown", [0, 1]],
] as const);

function WidgetPlaceholder({ name, message, retry }: { name: string; message: string; retry?: () => void }) {
  return (
    <section className="hu-card-alt">
      <h2>{name}</h2>
      <p {...(retry && { role: "alert" })}>{message}</p>
      {retry && <Button onClick={retry}>重新加载卡片</Button>}
    </section>
  );
}

class WidgetBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <WidgetPlaceholder name={this.props.name} message="卡片显示失败" retry={() => this.setState({ failed: false })} /> : this.props.children;
  }
}

function WidgetContent({
  instance,
  name,
  definition,
  renderWidget,
  unavailableReason,
}: {
  instance: Instance;
  name: string;
  definition: HomeWidgetDefinition | undefined;
  renderWidget: DashboardProps["renderWidget"];
  unavailableReason: DashboardProps["unavailableReason"];
}) {
  if (definition && !homeWidgetConfigSchema(definition).safeParse(instance.config).success) {
    return <WidgetPlaceholder name={name} message="卡片配置待修复" />;
  }
  return renderWidget(instance) ?? <WidgetPlaceholder name={name} message={unavailableReason(instance.widgetType)} />;
}

const repairReasons: Record<DashboardRepairChange["reasons"][number], string> = {
  orphan: "移除未关联卡片的位置记录",
  missing: "为卡片补上位置",
  "size-reset": "恢复推荐尺寸",
  "position-clamped": "移回看板范围",
  collision: "避开其他卡片",
};

interface DashboardProps {
  state: Controller;
  definitions: ReadonlyMap<string, HomeWidgetDefinition>;
  definitionsReady: boolean;
  allowed(type: string): boolean;
  unavailableReason(type: string): string;
  renderWidget(instance: Instance): ReactNode;
  configureWidget?(instance: Instance, onChange: (config: Instance["config"]) => void, disabled: boolean): ReactNode;
}

export function Dashboard({ state, definitions, definitionsReady, allowed, unavailableReason, renderWidget, configureWidget }: DashboardProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [cardSettings, setCardSettings] = useState<string>();
  const backupPicker = useId();
  const layoutHelp = useId();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [feedback, setFeedback] = useState("");
  const { width, mounted: gridReady, containerRef } = useContainerWidth({ measureBeforeMount: true });
  const narrow = width <= DASHBOARD_NARROW_WIDTH;
  const view = state.snapshot.data;
  const editing = state.draft !== undefined;
  const locked = state.busy || state.notice?.action === "verify";
  const board = state.draft?.board ?? view?.board;
  const restoring = state.recovery?.intent.action === "restore";
  const byId = new Map(board?.instances.map((item) => [item.instanceId, item]));
  const layout = orderPlacements(board?.layout ?? []);
  const items = layout.filter((p) => editing || byId.get(p.instanceId)?.hidden === false);
  const settingsCard = cardSettings ? byId.get(cardSettings) : undefined;
  const settingsPlacement = layout.find((item) => item.instanceId === cardSettings);
  const settingsDefinition = settingsCard && definitions.get(settingsCard.widgetType);
  const label = (instance: Instance) => instance.title || definitions.get(instance.widgetType)?.title || instance.widgetType;
  const changeLayout = (next: Placement[] | undefined, id: string) => {
    if (!board || !editing || locked) return;
    if (!next) {
      setFeedback("已到达看板的位置或尺寸边界。");
      return;
    }
    const placed = next.find(({ instanceId }) => instanceId === id);
    const instance = byId.get(id);
    if (placed && instance) setFeedback(placementAnnouncement(label(instance), placed));
    state.update({ ...board, layout: next });
  };
  function adjustCard(event: KeyboardEvent<HTMLButtonElement>, placement: Placement, definition: HomeWidgetDefinition | undefined) {
    const step = arrowSteps.get(event.key);
    if (!board || !step || event.altKey || event.ctrlKey || event.metaKey) return;
    const [dx, dy] = step;
    if (event.shiftKey ? !definition : narrow && !dy) return;
    event.preventDefault();
    const next = event.shiftKey && definition
      ? resizePlacement(board.layout, { ...placement, w: placement.w + dx, h: placement.h + dy }, definition, narrow)
      : narrow && dy
        ? reorderPlacement(board.layout, placement.instanceId, dy)
        : movePlacement(board.layout, { ...placement, x: placement.x + dx, y: placement.y + dy });
    changeLayout(next, placement.instanceId);
    const tile = event.currentTarget.closest(".hu-dashboard-tile");
    if (next && tile) requestAnimationFrame(() => {
      if (tile.contains(tile.ownerDocument.activeElement)) tile.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
  const changeInstance = (id: string, patch: Partial<Instance>) => {
    if (!board) return;
    state.update({ ...board, instances: board.instances.map((item) => (item.instanceId === id ? { ...item, ...patch } : item)) });
  };
  const candidates = [...definitions.values()].filter(
    (definition) => (category === "all" || (category === "system") === (definition.owner === "kernel")) && `${definition.title} ${definition.description} ${definition.owner}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const count = (type: string) => board?.instances.filter((item) => item.widgetType === type).length ?? 0;
  function insert(instance: Instance, size: { w: number; h: number }) {
    if (!board || locked) return;
    const placement = appendPlacement(board.layout, { instanceId: instance.instanceId, w: size.w, h: size.h });
    state.update({ ...board, instances: [...board.instances, instance], layout: [...board.layout, placement] });
    setAddOpen(false);
  }
  function add(definition: HomeWidgetDefinition) {
    const widgetType = homeWidgetType(definition.owner, definition.id);
    if (!allowed(widgetType)) return;
    const instanceId = createRequestId();
    insert({ instanceId, widgetType, config: definition.defaultConfig, hidden: false }, definition.defaultSize);
  }
  function openCatalog() {
    if (!editing) state.start();
    setSearch("");
    setCategory("all");
    setAddOpen(true);
  }
  function resetDraft() {
    if (!state.draft || locked || !definitionsReady) return;
    const defaults = defaultDashboardBoard();
    const instances = defaults.instances.filter((item) => allowed(item.widgetType));
    const ids = new Set(instances.map((item) => item.instanceId));
    state.update({ ...state.draft.board, instances, layout: defaults.layout.filter((item) => ids.has(item.instanceId)) });
    setFeedback("草稿已恢复为默认布局。");
    setResetOpen(false);
  }
  const list = (current: DashboardBoard) => {
    const instances = new Map(current.instances.map((item) => [item.instanceId, item]));
    return (
      <ul>
        {orderPlacements(current.layout).map((item) => (
          <li key={item.instanceId}>
            {label(instances.get(item.instanceId)!)} · 第 {item.x + 1} 列，第 {item.y + 1} 行 · {item.w} × {item.h}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div ref={containerRef} className="hu-dashboard" data-testid="home-dashboard">
      <div className="hu-dashboard-feedback" role="status">
        {state.notice?.text ?? feedback}
        {state.notice?.action ? (
          <Button disabled={state.busy} onClick={() => void state.checkLatest()}>
            {state.notice.action === "compare" ? "对照最新版本" : "核对已提交布局"}
          </Button>
        ) : null}
      </div>
      {state.snapshot.isError ? (
        <p role="alert">
          无法读取首页布局。<Button onClick={() => void state.snapshot.refetch()}>重试</Button>
        </p>
      ) : null}
      {view && !view.writable ? (
        <div className="row">
          <p className="hu-hint-text">
            {view.source === "stored" || view.source === "default"
              ? "当前 Vault 为只读。"
              : view.source === "unrecognized"
                ? "当前版本无法识别布局格式。正在显示默认布局，布局原件已保留。"
                : "无法读取现有布局，正在显示默认布局。布局原件已保留。"}
          </p>
          {view.source === "invalid" ? (
            <Button onClick={() => void state.previewRecovery({ action: "repair" })} disabled={locked || editing}>
              预览布局修复
            </Button>
          ) : null}
        </div>
      ) : null}
      {view && (view.source === "stored" || view.source === "invalid" || view.writable) ? (
        <div className="row hu-dashboard-toolbar">
          {view.source === "stored" ? (
            <Button onClick={() => void state.saveBackup()} disabled={locked}>
              备份布局
            </Button>
          ) : null}
          {view.writable || view.source === "invalid" ? (
            <Button onClick={() => setBackupOpen(true)} disabled={locked || editing}>
              恢复布局备份
            </Button>
          ) : null}
        </div>
      ) : null}
      {editing ? (
        <>
          <div className="row hu-dashboard-toolbar">
            <Button icon={Plus} onClick={openCatalog} disabled={locked}>
              添加卡片
            </Button>
            <Button onClick={() => setResetOpen(true)} disabled={locked || !definitionsReady}>
              恢复默认布局
            </Button>
            <span className="hu-flex-fill" />
            <Button onClick={state.cancel} disabled={locked}>
              取消编辑
            </Button>
            <Button variant="primary" data-testid="home-dashboard-save" onClick={() => void state.save()} disabled={locked || !state.dirty}>
              保存布局
            </Button>
          </div>
          <p id={layoutHelp} className="hu-hint-text hu-dashboard-layout-help">
            {narrow ? "聚焦移动手柄，按上下方向键调整顺序。" : "拖动手柄移动，拖动右下角缩放。聚焦手柄后可按方向键移动。"}
            按 Shift 加方向键调整尺寸。
          </p>
        </>
      ) : null}
      {gridReady && board && (
        <DashboardGrid
          width={width}
          narrow={narrow}
          items={items}
          editable={editing && !locked}
          definitionFor={(id) => {
            const instance = byId.get(id);
            return instance ? definitions.get(instance.widgetType) : undefined;
          }}
          onChange={changeLayout}
          onCancel={() => setFeedback("已取消卡片调整。")}
        >
          {items.map((p) => {
            const instance = byId.get(p.instanceId)!;
            const definition = definitions.get(instance.widgetType);
            const name = label(instance);
            const controls = editing ? (
              <div className="hu-dashboard-card-controls">
                <IconButton
                  icon={Grip}
                  className="hu-dashboard-drag"
                  disabled={locked}
                  label={`移动 ${name}`}
                  aria-describedby={layoutHelp}
                  aria-keyshortcuts={`${narrow ? "" : "ArrowLeft ArrowRight "}ArrowUp ArrowDown${definition ? " Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown" : ""}`}
                  onKeyDown={(event) => adjustCard(event, p, definition)}
                />
                {instance.hidden ? <span className="hu-dashboard-hidden-name">{name}</span> : null}
                <label className="row">
                  <input type="checkbox" checked={instance.hidden} disabled={locked} onChange={(event) => changeInstance(p.instanceId, { hidden: event.target.checked })} />
                  隐藏
                </label>
                <IconButton icon={SlidersHorizontal} disabled={locked} label={`设置 ${name}`} onClick={() => setCardSettings(p.instanceId)} />
              </div>
            ) : null;
            return (
              <div key={p.instanceId} className="hu-dashboard-tile" data-instance-id={p.instanceId}>
                {controls}
                {!instance.hidden ? (
                  <div className="hu-dashboard-widget" inert={editing}>
                    <WidgetBoundary key={instance.widgetType} name={name}>
                      <WidgetContent instance={instance} name={name} definition={definition} renderWidget={renderWidget} unavailableReason={unavailableReason} />
                    </WidgetBoundary>
                  </div>
                ) : null}
              </div>
            );
          })}
        </DashboardGrid>
      )}
      {view && items.length === 0 ? (
        <div className="row">
          <p className="hu-hint-text">首页尚未显示任何卡片。</p>
          {view.writable && !editing ? <Button onClick={openCatalog}>添加首个小组件</Button> : null}
        </div>
      ) : null}
      {settingsCard && settingsPlacement && editing && (
        <Dialog open title={`设置 ${label(settingsCard)}`} onClose={() => setCardSettings(undefined)}>
          <label className="hu-field">
            <span className="hu-field-label">标题</span>
            <input aria-label="卡片标题" placeholder={settingsDefinition?.title ?? "卡片标题"} value={settingsCard.title ?? ""} disabled={locked}
              onChange={(event) => changeInstance(settingsCard.instanceId, { title: event.target.value })} />
          </label>
          {configureWidget?.(settingsCard, (config) => changeInstance(settingsCard.instanceId, { config }), locked)}
          <div className="row hu-dashboard-settings-actions">
            {settingsDefinition && (
              <Button icon={RotateCcw} disabled={locked} onClick={() => {
                const size = settingsDefinition.defaultSize;
                const candidate = { ...settingsPlacement, ...size, x: Math.min(settingsPlacement.x, DASHBOARD_COLUMNS - size.w) };
                if (board) changeLayout(resizePlacement(board.layout, candidate, settingsDefinition, narrow), settingsCard.instanceId);
              }}>恢复推荐尺寸</Button>
            )}
            {settingsDefinition?.maxInstances === null && allowed(settingsCard.widgetType) && (
              <Button icon={Copy} disabled={locked} onClick={() => {
                insert({ ...settingsCard, instanceId: createRequestId(), config: structuredClone(settingsCard.config) }, settingsPlacement);
                setCardSettings(undefined);
              }}>复制卡片</Button>
            )}
            <Button icon={X} variant="danger" disabled={locked} onClick={() => {
              if (board) state.update({ ...board,
                instances: board.instances.filter((item) => item.instanceId !== settingsCard.instanceId),
                layout: board.layout.filter((item) => item.instanceId !== settingsCard.instanceId),
              });
              setCardSettings(undefined);
            }}>移除卡片</Button>
          </div>
        </Dialog>
      )}
      <Dialog open={addOpen && editing} title="添加卡片" onClose={() => setAddOpen(false)}>
        <div className="row">
          <input aria-label="搜索卡片" placeholder="搜索卡片" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="卡片来源" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">全部来源</option>
            <option value="system">工作台</option>
            <option value="plugin">插件</option>
          </select>
        </div>
        {candidates.length ? (
          candidates.map((definition) => {
            const type = homeWidgetType(definition.owner, definition.id);
            const existing = board?.instances.find((item) => item.widgetType === type);
            const canAdd = definition.maxInstances === null || count(type) < definition.maxInstances;
            return (
              <div key={type} className="row">
                <div className="hu-flex-fill">
                  <strong>{definition.title}</strong>
                  <p>
                    {definition.description} · {definition.defaultSize.w} × {definition.defaultSize.h}
                  </p>
                </div>
                {allowed(type) && existing?.hidden && !canAdd ? (
                  <Button
                    onClick={() => {
                      changeInstance(existing.instanceId, { hidden: false });
                      setAddOpen(false);
                    }}
                  >
                    显示已隐藏卡片
                  </Button>
                ) : (
                  <Button aria-label={`添加 ${definition.title}`} disabled={!allowed(type) || !canAdd} onClick={() => add(definition)}>
                    {!allowed(type) ? "当前不可用" : canAdd ? "添加" : "已添加"}
                  </Button>
                )}
              </div>
            );
          })
        ) : (
          <p>没有符合条件的卡片。</p>
        )}
      </Dialog>
      <Dialog open={backupOpen && !editing} title="选择布局备份" onClose={() => setBackupOpen(false)}>
        <label htmlFor={backupPicker}>布局备份文件（JSON）</label>
        <input
          id={backupPicker}
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            setBackupOpen(false);
            void state.previewBackup(file);
          }}
        />
      </Dialog>
      <Dialog
        open={state.recovery !== undefined}
        wide
        title={restoring ? "预览备份布局" : "预览布局修复"}
        onClose={state.closeRecovery}
        actions={
          <>
            <Button autoFocus disabled={state.busy} onClick={state.closeRecovery}>
              保留原样
            </Button>
            <Button variant="primary" loading={state.busy} disabled={!state.recovery?.preview.writable} onClick={state.confirmRecovery}>
              {restoring ? "确认恢复" : "确认修复"}
            </Button>
          </>
        }
      >
        {state.recovery ? (
          <>
            <p>{state.recovery.preview.writable ? (restoring ? "确认后会将这份布局保存到当前 Vault。" : "确认后将另存布局原件，再保存以下调整。") : "当前 Vault 为只读，可以查看预计布局。"}</p>
            {state.recovery.preview.changes.length ? (
              <ul>
                {state.recovery.preview.changes.map((change) => (
                  <li key={change.instanceId}>
                    <strong>{change.instanceId}</strong> · {change.reasons.map((reason) => repairReasons[reason]).join("、")}
                    {change.after ? `（第 ${change.after.x + 1} 列，第 ${change.after.y + 1} 行 · ${change.after.w} × ${change.after.h}）` : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <h3>{restoring ? "备份中的布局" : "修复后的布局"}</h3>
            {list(state.recovery.preview.board)}
          </>
        ) : null}
      </Dialog>
      <Dialog
        open={resetOpen && editing}
        title="恢复默认布局"
        onClose={() => setResetOpen(false)}
        actions={
          <>
            <Button autoFocus onClick={() => setResetOpen(false)}>
              返回草稿
            </Button>
            <Button variant="primary" onClick={resetDraft} disabled={locked || !definitionsReady}>
              恢复草稿默认布局
            </Button>
          </>
        }
      >
        <p>当前草稿中的自定义卡片和布局将被替换。保存布局后才会提交变更。</p>
      </Dialog>
      <Dialog
        open={Boolean(state.latest && state.draft)}
        wide
        title="对照最新布局"
        description="保留草稿后，下一次保存会提交当前草稿的完整布局。"
        onClose={state.closeCompare}
        actions={
          <>
            <Button onClick={state.closeCompare}>返回草稿</Button>
            <Button onClick={() => state.resolveCompare(true)}>采用最新布局</Button>
            <Button variant="primary" disabled={!state.latest?.writable} onClick={() => state.resolveCompare(false)}>
              以此版本为基准保留草稿
            </Button>
          </>
        }
      >
        {state.latest && state.draft ? (
          <div className="hu-dashboard-compare">
            <section>
              <h3>最新布局</h3>
              {list(state.latest.board)}
            </section>
            <section>
              <h3>当前草稿</h3>
              {list(state.draft.board)}
            </section>
          </div>
        ) : null}
      </Dialog>
      <Dialog
        open={Boolean(state.leaving)}
        title={state.leaving?.request.reason === "window" ? "关闭窗口前处理看板草稿" : "离开前处理看板草稿"}
        onClose={() => void state.chooseLeave("stay")}
        actions={
          <>
            <Button disabled={state.busy} onClick={() => void state.chooseLeave("stay")}>
              继续编辑
            </Button>
            <Button disabled={state.busy} onClick={() => void state.chooseLeave("discard")}>
              放弃并离开
            </Button>
            <Button variant="primary" disabled={state.busy} data-testid="home-dashboard-save-leave" onClick={() => void state.chooseLeave("save")}>
              保存并离开
            </Button>
          </>
        }
      >
        <p>{state.busy ? "正在保存布局…" : "当前 Vault 的布局还未保存。"}</p>
      </Dialog>
    </div>
  );
}
