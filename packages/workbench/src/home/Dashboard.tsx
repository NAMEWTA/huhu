import { DASHBOARD_COLUMNS, defaultDashboardBoard, homeWidgetConfigSchema, homeWidgetType, type DashboardBoard, type DashboardRepairChange, type HomeWidgetDefinition } from "@huhu/contracts";
import { Button, Dialog, IconButton } from "@huhu/ui";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Grip, MoveDiagonal2, Plus, RotateCcw, X } from "lucide-react";
import { Component, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { createRequestId } from "../engine-client/client.js";
import { appendPlacement, movePlacement, orderPlacements, packPlacements, reorderPlacement, type Placement } from "./dashboard-layout.js";
import type { useDashboard } from "./useDashboard.js";
import "./dashboard.css";

type Instance = DashboardBoard["instances"][number];
type Controller = ReturnType<typeof useDashboard>;

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

interface Gesture {
  pointerId: number;
  placement: Placement;
  kind: "move" | "resize";
  originX: number;
  originY: number;
  column: number;
  row: number;
  min: { w: number; h: number };
  max: { w: number; h: number };
}

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
  const backupPicker = useId();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [preview, setPreview] = useState<{ id: string; layout: Placement[] }>();
  const gesture = useRef<Gesture | undefined>(undefined);
  const grid = useRef<HTMLDivElement>(null);
  const view = state.snapshot.data;
  const editing = state.draft !== undefined;
  const locked = state.busy || state.notice?.action === "verify";
  const board = state.draft?.board ?? view?.board;
  const restoring = state.recovery?.intent.action === "restore";
  const byId = new Map(board?.instances.map((item) => [item.instanceId, item]));
  const layout = orderPlacements(board?.layout ?? []);
  const items = (preview?.layout ?? layout).filter((p) => editing || byId.get(p.instanceId)?.hidden === false);
  const label = (instance: Instance) => instance.title || definitions.get(instance.widgetType)?.title || instance.widgetType;
  const changeLayout = (next: Placement[] | undefined) => {
    if (!board || !next) {
      setFeedback("该位置超出看板的边界。");
      return;
    }
    setFeedback("");
    state.update({ ...board, layout: next });
  };
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
  function beginGesture(event: PointerEvent<HTMLButtonElement>, placement: Placement, kind: Gesture["kind"], definition?: HomeWidgetDefinition) {
    const target = grid.current;
    if (!target || gesture.current || locked || event.button !== 0 || (kind === "resize" && !definition)) return;
    const style = getComputedStyle(target);
    if (style.display !== "grid") return;
    const bounds = target.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    target.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      placement,
      kind,
      originX: event.clientX - bounds.left,
      originY: event.clientY - bounds.top,
      column: (bounds.width + Number.parseFloat(style.columnGap)) / DASHBOARD_COLUMNS,
      row: Number.parseFloat(style.gridAutoRows) + Number.parseFloat(style.rowGap),
      min: definition?.minSize ?? placement,
      max: definition?.maxSize ?? placement,
    };
  }

  function gesturePlacement(event: PointerEvent<HTMLDivElement>, current: Gesture): Placement {
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = Math.round((event.clientX - bounds.left - current.originX) / current.column);
    const dy = Math.round((event.clientY - bounds.top - current.originY) / current.row);
    const p = current.placement;
    if (current.kind === "move") return { ...p, x: p.x + dx, y: p.y + dy };
    return {
      ...p,
      w: Math.max(current.min.w, Math.min(current.max.w, DASHBOARD_COLUMNS - p.x, p.w + dx)),
      h: Math.max(current.min.h, Math.min(current.max.h, p.h + dy)),
    };
  }

  function moveGesture(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || !board) return;
    const candidate = gesturePlacement(event, current);
    const displayed = preview?.layout.find((item) => item.instanceId === candidate.instanceId) ?? current.placement;
    if (candidate.x === displayed.x && candidate.y === displayed.y && candidate.w === displayed.w && candidate.h === displayed.h) return;
    const next = movePlacement(board.layout, candidate);
    setPreview(next ? { id: candidate.instanceId, layout: next } : undefined);
  }

  function endGesture() {
    gesture.current = undefined;
    setPreview(undefined);
  }

  function commitGesture(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || !board) return;
    endGesture();
    if (locked || getComputedStyle(event.currentTarget).display !== "grid") return;
    const candidate = gesturePlacement(event, current);
    const p = current.placement;
    if (candidate.x !== p.x || candidate.y !== p.y || candidate.w !== p.w || candidate.h !== p.h) {
      const next = movePlacement(board.layout, candidate);
      changeLayout(next);
      if (next) setFeedback(`第 ${candidate.x + 1} 列，第 ${candidate.y + 1} 行，${candidate.w} × ${candidate.h}。`);
    }
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
    <div className="hu-dashboard" data-testid="home-dashboard">
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
      ) : null}
      <div
        ref={grid}
        className="hu-dashboard-grid"
        onPointerMove={moveGesture}
        onPointerUp={commitGesture}
        onLostPointerCapture={endGesture}
        onPointerCancel={endGesture}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !gesture.current) return;
          event.preventDefault();
          if (event.currentTarget.hasPointerCapture(gesture.current.pointerId)) event.currentTarget.releasePointerCapture(gesture.current.pointerId);
          endGesture();
        }}
      >
        {board
          ? items.map((p) => {
              const instance = byId.get(p.instanceId)!;
              const definition = definitions.get(instance.widgetType);
              const name = label(instance);
              const move = (x: number, y: number) => changeLayout(movePlacement(board.layout, { ...p, x: p.x + x, y: p.y + y }));
              const resize = (dimension: "w" | "h", value: number) => {
                const candidate = { ...p, [dimension]: value };
                const narrow = (grid.current?.getBoundingClientRect().width ?? Infinity) <= 620;
                changeLayout(narrow ? packPlacements(layout.map((item) => (item.instanceId === candidate.instanceId ? candidate : item))) : movePlacement(board.layout, candidate));
              };
              const controls = editing ? (
                <div className="hu-dashboard-card-controls">
                  <div className="row">
                    <button type="button" className="hu-dashboard-drag hu-btn" disabled={locked} aria-label={`移动 ${name}`} onPointerDown={(event) => beginGesture(event, p, "move")}>
                      <Grip size={16} aria-hidden />
                    </button>
                    <strong>{name}</strong>
                    <label className="row">
                      <input type="checkbox" checked={instance.hidden} disabled={locked} onChange={(event) => changeInstance(p.instanceId, { hidden: event.target.checked })} />
                      隐藏
                    </label>
                    <IconButton
                      icon={X}
                      disabled={locked}
                      label={`移除 ${name}`}
                      onClick={() => state.update({ ...board, instances: board.instances.filter((item) => item.instanceId !== p.instanceId), layout: board.layout.filter((item) => item.instanceId !== p.instanceId) })}
                    />
                  </div>
                  <label className="row">
                    标题
                    <input aria-label={`${name}标题`} placeholder={definition?.title ?? "卡片标题"} value={instance.title ?? ""} disabled={locked} onChange={(event) => changeInstance(p.instanceId, { title: event.target.value })} />
                  </label>
                  <div className="row">
                    {definition ? (
                      <button type="button" className="hu-dashboard-size-handle hu-btn" disabled={locked} aria-label={`拖动调整 ${name} 尺寸`} onPointerDown={(event) => beginGesture(event, p, "resize", definition)}>
                        <MoveDiagonal2 size={16} aria-hidden />
                      </button>
                    ) : null}
                    <div className="row hu-dashboard-coordinate">
                      <IconButton icon={ArrowLeft} disabled={locked || p.x === 0} label={`向左移动 ${name}`} onClick={() => move(-1, 0)} />
                      <IconButton icon={ArrowRight} disabled={locked || p.x + p.w === DASHBOARD_COLUMNS} label={`向右移动 ${name}`} onClick={() => move(1, 0)} />
                      <IconButton icon={ArrowUp} disabled={locked || p.y === 0} label={`向上移动 ${name}`} onClick={() => move(0, -1)} />
                      <IconButton icon={ArrowDown} disabled={locked} label={`向下移动 ${name}`} onClick={() => move(0, 1)} />
                    </div>
                    <div className="row hu-dashboard-order">
                      <IconButton icon={ArrowUp} disabled={locked || layout[0]?.instanceId === p.instanceId} label={`前移 ${name}`} onClick={() => changeLayout(reorderPlacement(board.layout, p.instanceId, -1))} />
                      <IconButton icon={ArrowDown} disabled={locked || layout.at(-1)?.instanceId === p.instanceId} label={`后移 ${name}`} onClick={() => changeLayout(reorderPlacement(board.layout, p.instanceId, 1))} />
                    </div>
                    {definition
                      ? (["w", "h"] as const).map((dimension) => {
                          const title = dimension === "w" ? "宽度" : "高度";
                          const min = definition.minSize[dimension];
                          const max = definition.maxSize[dimension];
                          return (
                            <label key={dimension} className="row">
                              {title}
                              <select aria-label={`${name} ${title}`} disabled={locked} value={p[dimension]} onChange={(event) => resize(dimension, Number(event.target.value))}>
                                {Array.from({ length: max - min + 1 }, (_, index) => (
                                  <option key={index + min}>{index + min}</option>
                                ))}
                              </select>
                            </label>
                          );
                        })
                      : null}
                    {definition ? (
                      <IconButton
                        icon={RotateCcw}
                        disabled={locked}
                        label={`恢复 ${name} 推荐尺寸`}
                        onClick={() => changeLayout(movePlacement(board.layout, { ...p, ...definition.defaultSize, x: Math.min(p.x, DASHBOARD_COLUMNS - definition.defaultSize.w) }))}
                      />
                    ) : null}
                    {definition?.maxInstances === null && allowed(instance.widgetType) ? (
                      <IconButton icon={Copy} disabled={locked} label={`复制 ${name}`} onClick={() => insert({ ...instance, instanceId: createRequestId(), config: structuredClone(instance.config) }, p)} />
                    ) : null}
                  </div>
                  {instance.widgetType === "widget:kernel:tasks" ? (
                    <label className="row">
                      显示任务
                      <select aria-label={`${name}任务范围`} disabled={locked} value={instance.config["filter"] === "today" ? "today" : "all"} onChange={(event) => changeInstance(p.instanceId, { config: { filter: event.target.value } })}>
                        <option value="all">全部待办</option>
                        <option value="today">今日</option>
                      </select>
                    </label>
                  ) : null}
                  {configureWidget?.(instance, (config) => changeInstance(p.instanceId, { config }), locked)}
                </div>
              ) : null;
              return (
                <div
                  key={p.instanceId}
                  className="hu-dashboard-tile"
                  data-instance-id={p.instanceId}
                  data-placement-preview={preview?.id === p.instanceId ? "true" : undefined}
                  style={{ gridColumn: `${p.x + 1} / span ${p.w}`, gridRow: `${p.y + 1} / span ${p.h}` } satisfies CSSProperties}
                >
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
            })
          : null}
      </div>
      {view && items.length === 0 ? (
        <div className="row">
          <p className="hu-hint-text">首页尚未显示任何卡片。</p>
          {view.writable && !editing ? <Button onClick={openCatalog}>添加首个小组件</Button> : null}
        </div>
      ) : null}
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
