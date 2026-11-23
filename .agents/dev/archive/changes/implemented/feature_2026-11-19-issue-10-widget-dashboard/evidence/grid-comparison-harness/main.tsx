import "../../../packages/ui/src/styles/index.css";
import "./style.css";
import { lazy, Profiler, Suspense, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DashboardBoard } from "../../../packages/contracts/src/home";
import { Dashboard } from "../../../packages/workbench/src/home/Dashboard";
import { packPlacements, reorderPlacement, type Placement } from "../../../packages/workbench/src/home/dashboard-layout";
import { candidates, columns, createBoard, definitions, gap, narrowWidth, rowHeight, sortLayout, verifyLayout, type Candidate } from "./fixture";
import { BodyContent, EditContent, Frame } from "./frame";

const Stack = lazy(() => import("./gridstack").then((module) => ({ default: module.Stack })));
const Homarr = lazy(() => import("./homarr").then((module) => ({ default: module.Homarr })));
const Rgl = lazy(() => import("./rgl").then((module) => ({ default: module.Rgl })));

const requested = new URL(location.href).searchParams.get("candidate");
const candidate: Candidate = candidates.find((option) => option === requested) ?? "huhu";
const storageKey = `huhu-grid-comparison/${candidate}`;
const commits: Array<{ phase: string; durationMs: number; time: number }> = [];
const events: Array<{ kind: string; layout: Placement[]; activeId?: string }> = [];
let geometry = () => createBoard().layout;

function readBoard(): DashboardBoard {
  const json = localStorage.getItem(storageKey);
  return json ? (JSON.parse(json) as DashboardBoard) : createBoard();
}

function inspection() {
  function box(el: Element) {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
  }

  const grid = document.querySelector("[data-fixture-grid], .hu-dashboard-grid");
  const grids = document.querySelectorAll("[data-fixture-grid], .hu-dashboard-grid").length;
  const tiles = [...document.querySelectorAll<HTMLElement>("[data-instance-id]")].map((el) => ({
    id: el.dataset.instanceId!,
    box: box(el),
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    preview: el.dataset.placementPreview === "true",
    style: { row: el.style.gridRow, col: el.style.gridColumn },
  }));
  const stage = document.querySelector<HTMLElement>(".fixture-stage");
  const stageWidth = stage?.clientWidth ?? 0;
  const visualWidth = stage?.getBoundingClientRect().width ?? 0;
  const scale = stageWidth > 0 ? visualWidth / stageWidth : 0;
  return {
    candidate,
    documentWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    stageWidth,
    grid: grid ? box(grid) : null,
    grids,
    tiles,
    layout: geometry(),
    storage: localStorage.getItem(storageKey),
    commits: [...commits],
    events: [...events],
    activePlaceholders: document.querySelectorAll("[data-placement-preview=true], .react-grid-placeholder, .grid-stack-placeholder:not([style*='display: none'])").length,
    pitchY: candidate === "homarr" ? (grid?.getBoundingClientRect().width ?? 0) / columns : (rowHeight + gap) * scale,
    pitchX: (visualWidth + (candidate === "huhu" || candidate === "rgl" ? gap * scale : 0)) / columns,
  };
}

declare global {
  interface Window {
    inspectDashboardGrid: typeof inspection;
  }
}

function App() {
  const [saved, setSaved] = useState(readBoard);
  const [draft, setDraft] = useState<DashboardBoard>();
  const [mounted, setMounted] = useState(true);
  const [width, setWidth] = useState(0);
  const [feedback, setFeedback] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const board = draft ?? saved;
  const layout = sortLayout(board.layout);
  const editing = draft !== undefined;
  const narrow = width <= narrowWidth;
  geometry = () => layout;
  useLayoutEffect(() => {
    const target = stage.current;
    if (!target) return;
    let observing = true;
    const measure = () => {
      if (observing) setWidth(target.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => {
      observing = false;
      observer.disconnect();
    };
  }, []);

  function start() {
    setFeedback("");
    setDraft(saved);
  }
  function cancel() {
    setDraft(undefined);
    setFeedback("已取消编辑");
  }
  function save() {
    if (!draft) return;
    const next = { ...draft, layout: sortLayout(draft.layout), revision: String(Number(saved.revision) + 1) };
    localStorage.setItem(storageKey, JSON.stringify(next));
    setSaved(next);
    setDraft(undefined);
    setFeedback("已保存布局");
  }
  function commit(next: Placement[] | undefined) {
    const issue = next ? verifyLayout(next) : "位置超出画布";
    if (!draft || issue || !next) {
      setDraft((current) => current && { ...current });
      setFeedback(issue ?? "没有草稿");
      return;
    }
    setDraft({ ...draft, layout: sortLayout(next) });
    const changed = next.find((item) => layout.some((p) => p.instanceId === item.instanceId && JSON.stringify(p) !== JSON.stringify(item)));
    setFeedback(changed ? `已调整到第 ${changed.x + 1} 列、第 ${changed.y + 1} 行，${changed.w} × ${changed.h}` : "布局保持原位");
  }

  function reorder(id: string, delta: -1 | 1) {
    commit(reorderPlacement(layout, id, delta));
  }
  const adapterProps = {
    width,
    layout,
    editing,
    commit,
    reorder,
    record(kind: "drag" | "resize", next: Placement[], activeId?: string) {
      if (events.length < 120) events.push({ kind, layout: sortLayout(next), activeId });
    },
  };
  // Keep the production Dashboard controls, CSS, and pointer/keyboard code.
  // The PoC supplies a local fixture in place of useDashboard's Engine bindings.
  const dashboardState = {
    snapshot: { data: { board: saved, writable: true, source: "default" }, isError: false },
    draft: draft && { board: draft, baseRevision: saved.revision },
    busy: false,
    dirty: editing && JSON.stringify(draft) !== JSON.stringify(saved),
    start,
    update: (next: DashboardBoard) => setDraft(next),
    cancel,
    save,
  } as unknown as Parameters<typeof Dashboard>[0]["state"];
  return (
    <main className="fixture-shell">
      <h1>{candidate} 网格对照</h1>
      <div className="fixture-toolbar">
        {mounted && !editing && (
          <button type="button" onClick={start}>
            编辑布局
          </button>
        )}
        {mounted && editing && candidate !== "huhu" && (
          <>
            <button type="button" onClick={cancel}>
              取消编辑
            </button>
            <button type="button" data-testid="home-dashboard-save" onClick={save}>
              保存布局
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            if (mounted) cancel();
            setMounted(!mounted);
          }}
        >
          {mounted ? "卸载画布" : "重新打开画布"}
        </button>
        <p className="fixture-status" data-testid="fixture-status" role="status">
          {feedback}
        </p>
      </div>
      <div ref={stage} className="fixture-stage" data-ready={width > 0}>
        {mounted && width > 0 && (
          <Profiler
            id={candidate}
            onRender={(_id, phase, durationMs, _base, _start, time) => {
              if (commits.length < 250) commits.push({ phase, durationMs, time });
            }}
          >
            {candidate === "huhu" ? (
              <Dashboard
                state={dashboardState}
                definitions={definitions}
                definitionsReady
                allowed={() => true}
                unavailableReason={() => "样本不可用"}
                configureWidget={(item) => <EditContent id={item.instanceId} />}
                renderWidget={(item) => <BodyContent id={item.instanceId} />}
              />
            ) : narrow ? (
              <div className="fixture-narrow" data-fixture-grid>
                {layout.map((item) => (
                  <div className="fixture-tile" key={item.instanceId} data-instance-id={item.instanceId}>
                    <Frame
                      item={item}
                      editing={editing}
                      narrow
                      request={(next) => commit(packPlacements(layout.map((p) => (p.instanceId === next.instanceId ? next : p))))}
                      reorder={reorder}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <Suspense fallback={<p role="status">正在加载网格</p>}>
                {candidate === "rgl" ? <Rgl {...adapterProps} /> : candidate === "gridstack" ? <Stack {...adapterProps} /> : <Homarr {...adapterProps} />}
              </Suspense>
            )}
          </Profiler>
        )}
      </div>
    </main>
  );
}

window.inspectDashboardGrid = inspection;
createRoot(document.getElementById("root")!).render(<App />);
