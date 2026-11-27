// @vitest-environment jsdom
import { createRequire } from "node:module";
import { URL as FileURL } from "node:url";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskDto } from "@huhu/contracts";
import type { TaskDispatchView, TaskRunSummary } from "../src/engine/dispatch-store.js";
import { TaskDispatchPanel } from "../src/ui/TaskDispatchPanel.js";

const { createRoot } = createRequire(new FileURL("../../../apps/desktop/package.json", import.meta.url))("react-dom/client") as {
  createRoot(container: Element): { render(node: ReactNode): void; unmount(): void };
};
const fixture = vi.hoisted(() => ({
  call: vi.fn(async (_name: string, _input: unknown) => ({})),
  refetch: vi.fn(),
  queries: { invalidateQueries: vi.fn(async () => {}) },
  resources: undefined as unknown,
  mcpCatalogs: {} as Record<string, unknown>,
}));

vi.mock("@huhu/workbench", () => ({
  useEngine: () => ({ call: fixture.call, vaultId: "fixture", endpoint: { token: "desktop-fixture" } }),
  useQueryClient: () => fixture.queries,
  useCapability: (name: string) => ({ data: name === "tasks.dispatch.resources" ? fixture.resources : fixture.mcpCatalogs[name], refetch: fixture.refetch }),
  createRequestId: () => "intent-fixture",
}));
vi.mock("../src/ui/compact.js", () => ({ TaskRunMarkdownView: () => null }));
vi.mock("../src/ui/references.js", () => ({ useReferenceIndex: () => null }));

const at = "2026-11-26T17:00:00Z";
const task: TaskDto = {
  id: "task-fixture",
  path: "Tasks/fixture.md",
  version: "task-version",
  title: "任务",
  body: "工作内容",
  type: "agent",
  status: "in_progress",
  completedAt: null,
  due: null,
  availableAt: null,
  tags: [],
  project: null,
  readOnly: false,
  origin: { kind: "desktop" },
  execution: { spaceId: "space-fixture", provider: "codex", model: null, effort: null, fast: false },
  inputRevision: 4,
  inputHash: "0123456789abcdef",
  createdAt: at,
  updatedAt: at,
  problems: [],
  reminders: [],
  dispatchBlockers: [],
  comments: [
    { id: "summary", at, source: "human", body: "首轮摘要" },
    { id: "omit", at, source: "human", body: "其他评论" },
  ],
  references: [
    { from: "summary", path: "Notes/产物.txt", kind: "file", exists: true },
    { from: "omit", path: "Notes/其他.txt", kind: "file", exists: true },
  ],
};
const receipt: TaskDispatchView = {
  taskId: task.id,
  dispatchId: "old-dispatch",
  eventId: "old-event",
  runId: "old-run",
  attempt: 1,
  acceptedAt: at,
  state: "running",
  reason: null,
  cancelRequested: false,
  session: null,
};
const run: TaskRunSummary = { id: receipt.runId, state: "succeeded", startedAt: at, finishedAt: at, model: null, questions: 0 };
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal ??= function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function () {
    this.open = false;
  };
  fixture.call.mockReset();
  fixture.refetch.mockReset();
  fixture.resources = undefined;
  fixture.mcpCatalogs = {};
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(runs: TaskRunSummary[] = [run]) {
  return act(() => root.render(<TaskDispatchPanel task={task} zone="UTC" rows={[receipt]} runs={runs} readError={null} onOpenAgent={() => {}} />));
}

const button = (text: string) => Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.trim() === text);
const value = (text: string) => Array.from(container.querySelectorAll("dt")).find((element) => element.textContent === text)?.nextElementSibling;

test("本机派遣资源沿用只读查询，显示原生等待、积压及最早等待时刻", async () => {
  fixture.resources = {
    vault: { active: 0, retained: 1, pending: 2, unknown: 1, waitingNative: 1, oldestPendingAt: at, oldestNativeWaitAt: at, oldestUnknownAt: at },
    device: { active: { occupied: 1, limit: 2 }, retained: { occupied: 1, limit: 3 } },
  };
  await render();
  expect(value("本机活动名额")?.textContent).toBe("1 / 2");
  expect(value("本机保留名额")?.textContent).toBe("1 / 3");
  expect(value("排队积压")?.textContent).toBe("2");
  expect(value("待核实积压")?.textContent).toBe("1");
  expect(value("最早等待原生回答")?.querySelector("time")?.dateTime).toBe(at);
  expect(container.textContent).toContain("保留原会话以接收回答");
  await act(() => button("刷新资源")!.click());
  expect(fixture.refetch).toHaveBeenCalledOnce();
  expect(fixture.call).not.toHaveBeenCalled();
});

test("结束原轮次后显式派遣，仅冻结选中的评论和原产物版本", async () => {
  fixture.call.mockImplementation(async (capability) => (capability === "vault.readFile" ? { version: "artifact-version" } : {}));
  await render([{ ...run, state: "running", finishedAt: null }]);
  expect(button("开始新一轮")).toBeUndefined();
  await render();
  await act(() => button("开始新一轮")!.click());
  expect(container.querySelector('input[value="Notes/产物.txt"]')).toBeNull();
  await act(() => container.querySelector<HTMLInputElement>('input[value="summary"]')!.click());
  expect(container.querySelector('input[value="Notes/其他.txt"]')).toBeNull();
  await act(() => container.querySelector<HTMLInputElement>('input[value="Notes/产物.txt"]')!.click());
  await act(() => button("确认开始新一轮")!.click());
  expect(fixture.call.mock.calls.map(([name, input]) => [name, input])).toMatchObject([
    ["vault.readFile", { path: "Notes/产物.txt" }],
    [
      "tasks.dispatch",
      {
        taskId: task.id,
        inputRevision: task.inputRevision,
        inputHash: task.inputHash,
        newRound: true,
        context: { messageIds: ["summary"], artifacts: [{ path: "Notes/产物.txt", expectedVersion: "artifact-version" }] },
      },
    ],
  ]);
});

test("长外部工具的整行授权标签可勾选，并保存精确来源和修订", async () => {
  fixture.mcpCatalogs = {
    "capabilities.list": [{ name: "vault.info", exposed: true }],
    "mcp.catalog.list": {
      entries: [
        { kind: "tool", sourceId: "allowed-source", upstreamIdentity: "echo", publicKey: "task_allowed__echo", selected: true },
        { kind: "tool", sourceId: "other-source", upstreamIdentity: "echo", publicKey: "task_other__echo", selected: true },
      ],
    },
    "mcp.sources.list": {
      sources: [
        { state: "ready", source: { sourceId: "allowed-source", revision: 2, displayName: "task_allowed" } },
        { state: "ready", source: { sourceId: "other-source", revision: 3, displayName: "task_other" } },
      ],
    },
  };
  await render();
  await act(async () => button("任务 MCP 授权")!.click());

  const labels = [...container.querySelectorAll("label")];
  const allowed = labels.find((label) => label.textContent === "选择 task_allowed__echo（task_allowed）")!;
  const other = labels.find((label) => label.textContent === "选择 task_other__echo（task_other）")!;
  const checkbox = allowed.querySelector<HTMLInputElement>('input[type="checkbox"]');
  expect(checkbox).toBeInstanceOf(HTMLInputElement);
  expect(allowed.control).toBe(checkbox);
  await act(async () => allowed.click());
  expect(checkbox?.checked).toBe(true);
  expect(other.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
  await act(async () => button("保存工具授权")!.click());
  expect(fixture.call).toHaveBeenCalledExactlyOnceWith(
    "tasks.mcp.authorize",
    {
      id: task.id,
      expectedVersion: task.version,
      tools: [{ sourceId: "allowed-source", upstreamIdentity: "echo", sourceRevision: 2 }],
    },
    { write: true },
  );
});
