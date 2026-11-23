// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { DASHBOARD_SCHEMA_VERSION, type CapabilityResult, type DashboardView } from "../../../packages/contracts/src/index.js";
import { EventStream } from "../../../packages/workbench/src/engine-client/client.js";
import { queryKey } from "../../../packages/workbench/src/engine-client/query.js";
import { EngineProvider, useQueryClient } from "../../../packages/workbench/src/engine-client/react.js";
import { useDashboard } from "../../../packages/workbench/src/home/useDashboard.js";
import { createUiStore } from "../../../packages/workbench/src/state/ui-store.js";

const endpoint = { baseUrl: "http://127.0.0.1:1", token: "fixture", vaultId: "vault-a" };
const capability = "home.dashboard.get";
const key = queryKey(endpoint.vaultId, capability);

function view(revision: string, y: number): DashboardView {
  return {
    vaultId: endpoint.vaultId,
    source: "stored",
    writable: true,
    board: {
      schemaVersion: DASHBOARD_SCHEMA_VERSION,
      boardId: "home",
      revision,
      updatedAt: null,
      instances: [],
      layout: [{ instanceId: "default-focus", x: 0, y, w: 1, h: 1 }],
    },
  };
}

const old = view("1", 0);
const saved = view("2", 1);
const ok = (data: DashboardView) => ({ ok: true, data }) as const;

function responseGate() {
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  let resolveBody!: (result: CapabilityResult<DashboardView>) => void;
  const body = new Promise<CapabilityResult<DashboardView>>((resolve) => {
    resolveBody = resolve;
  });
  return {
    started,
    resolve: resolveBody,
    response: Object.assign(new Response(), {
      json() {
        signalStarted();
        return body;
      },
    }),
  };
}

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountDashboard(fetch: typeof globalThis.fetch) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(EventStream.prototype, "start").mockImplementation(() => {});
  const ui = createUiStore({ activeModule: "home", openTabs: ["home"] });
  let current: { dashboard: ReturnType<typeof useDashboard>; query: ReturnType<typeof useQueryClient> } | undefined;
  function Probe() {
    const dashboard = useDashboard(ui);
    const query = useQueryClient();
    current = { dashboard, query };
    return null;
  }
  const mounted = createRoot(document.createElement("div"));
  root = mounted;
  await act(async () => mounted.render(createElement(EngineProvider, { endpoint, children: createElement(Probe) })));
  const state = () => current!;
  await act(async () => {
    await vi.waitFor(() => expect(state().query.getQueryData(key)).toEqual(old));
    // TanStack schedules its React observer notification on the next task.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  expect(state().dashboard.snapshot.data).toEqual(old);
  return { state, ui };
}

async function edit(state: () => { dashboard: ReturnType<typeof useDashboard> }) {
  await act(async () => state().dashboard.start());
  await act(async () => state().dashboard.update(saved.board));
  expect(state().dashboard.dirty).toBe(true);
}

test.each(["已完成待写缓存", "仍在途"] as const)("旧读取%s时仍保留成功保存的首页布局", async (readState) => {
  const readFirst = readState === "已完成待写缓存";
  const oldRead = responseGate();
  const write = responseGate();
  let holdRead = false;
  let readSignal: AbortSignal | null | undefined;
  const { state, ui } = await mountDashboard(async (_url, init) => {
    const { capability: name } = JSON.parse(String(init?.body)) as { capability: string };
    if (name === "home.dashboard.update") return write.response;
    if (name !== capability) throw new Error(`unexpected capability ${name}`);
    if (!holdRead) return Response.json(ok(old));
    readSignal = init?.signal;
    return oldRead.response;
  });
  await edit(state);
  holdRead = true;
  await act(async () => {
    const read = state().dashboard.snapshot.refetch();
    await oldRead.started;
    const save = state().dashboard.save();
    await write.started;
    expect(state().dashboard.save()).toBe(save);
    const leave = ui.getState().openModule("tasks");
    expect(ui.getState().activeModule).toBe("home");
    // Resolve the old JSON first. The retryer resolves before the save handler, while its cache write is still queued.
    if (readFirst) oldRead.resolve(ok(old));
    write.resolve(ok(saved));
    await expect(save).resolves.toBe(true);
    if (!readFirst) oldRead.resolve(ok(old));
    await read;
    await expect(leave).resolves.toBe(true);
  });
  expect(readSignal?.aborted).toBe(!readFirst);
  expect(state().query.getQueryState(key)).toMatchObject({ data: saved, status: "success" });
  expect(state().dashboard.notice).toEqual({ text: "布局已保存。" });
  expect(state().dashboard.draft).toBeUndefined();
  expect(ui.getState().activeModule).toBe("tasks");
});

test("首页真实读取错误仍可通过同一查询重试", async () => {
  let response: CapabilityResult<DashboardView> = ok(old);
  const { state } = await mountDashboard(async () => Response.json(response));
  await act(async () => {
    response = { ok: false, error: { code: "INTERNAL", message: "fixture read failed", retryable: false } };
    const failed = await state().dashboard.snapshot.refetch();
    expect(failed.isError).toBe(true);
    expect(failed.error).toMatchObject({ code: "INTERNAL", message: "fixture read failed" });
    response = ok(saved);
    const retried = await state().dashboard.snapshot.refetch();
    expect(retried).toMatchObject({ isError: false, data: saved });
  });
});

test.each(["其他 Vault", "已卸载"] as const)("首页不发布来自%s的保存回执", async (scope) => {
  const write = responseGate();
  const { state } = await mountDashboard(async (_url, init) => {
    const { capability: name } = JSON.parse(String(init?.body)) as { capability: string };
    return name === "home.dashboard.update" ? write.response : Response.json(ok(old));
  });
  await edit(state);
  const { dashboard, query } = state();
  await act(async () => {
    const save = dashboard.save();
    await write.started;
    if (scope === "已卸载") {
      root?.unmount();
      root = undefined;
    }
    write.resolve(ok(scope === "其他 Vault" ? { ...saved, vaultId: "vault-b" } : saved));
    await expect(save).resolves.toBe(false);
  });
  expect(query.getQueryData(key)).toEqual(old);
  expect(query.getQueryData(queryKey("vault-b", capability))).toBeUndefined();
  if (scope === "其他 Vault") {
    expect(state().dashboard.draft?.board).toEqual(saved.board);
    expect(state().dashboard.notice).toMatchObject({ action: "verify", error: true });
  }
});
