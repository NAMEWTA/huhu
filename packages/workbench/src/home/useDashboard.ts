import type { DashboardBoard, DashboardView } from "@huhu/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import { CapabilityError, createRequestId } from "../engine-client/client.js";
import { queryKey } from "../engine-client/query.js";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { registerExitParticipant, type ExitRequest } from "../state/exit-participants.js";
import { registerModuleLeaveGuard, type UiState } from "../state/ui-store.js";

const capability = "home.dashboard.get";
const editable = (board: DashboardBoard) => ({ instances: board.instances, layout: board.layout });
const matchLayout = (a: DashboardBoard, b: DashboardBoard) => JSON.stringify(editable(a)) === JSON.stringify(editable(b));

interface Draft {
  base: DashboardBoard;
  board: DashboardBoard;
  requestId: string;
}

interface LeaveChoice {
  request: ExitRequest;
  finish(allowed: boolean): void;
}

interface Notice {
  text: string;
  action?: "compare" | "verify";
  error?: boolean;
}

export function useDashboard(ui: StoreApi<UiState>) {
  const engine = useEngine();
  const qc = useQueryClient();
  const snapshot = useCapability<DashboardView>(capability);
  const [draft, setDraft] = useState<Draft>();
  const [notice, setNotice] = useState<Notice>();
  const [latest, setLatest] = useState<DashboardView>();
  const [leaving, setLeaving] = useState<LeaveChoice>();
  const [busy, setBusy] = useState(false);
  const pending = useRef<LeaveChoice | undefined>(undefined);
  const inFlight = useRef<Promise<boolean> | undefined>(undefined);
  const unverified = useRef(false);
  const liveDraft = useRef<Draft | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current?.finish(false);
    };
  }, [engine.vaultId]);

  const changeDraft = useCallback((next: Draft | undefined) => {
    liveDraft.current = next;
    setDraft(next);
  }, []);

  const leave = useCallback((request: ExitRequest): boolean | Promise<boolean> => {
    const current = liveDraft.current;
    if (pending.current || unverified.current || request.signal.aborted) return false;
    if (inFlight.current) return request.waitForUser(inFlight.current);
    if (!current || matchLayout(current.base, current.board)) return true;
    const decision = new Promise<boolean>((resolve) => {
      const abort = () => choice.finish(false);
      const choice: LeaveChoice = {
        request,
        finish(allowed) {
          request.signal.removeEventListener("abort", abort);
          if (pending.current === choice) {
            pending.current = undefined;
            if (alive.current) setLeaving(undefined);
          }
          resolve(allowed);
        },
      };
      pending.current = choice;
      setLeaving(choice);
      request.signal.addEventListener("abort", abort, { once: true });
    });
    return request.waitForUser(decision);
  }, []);

  useEffect(() => {
    const offExit = registerExitParticipant(leave);
    const offNavigation = registerModuleLeaveGuard(ui, "home", leave);
    return () => {
      offExit();
      offNavigation();
    };
  }, [leave, ui]);

  const dirty = draft !== undefined && !matchLayout(draft.base, draft.board);
  useEffect(() => {
    if (!dirty || engine.endpoint.token) return;
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty, engine.endpoint.token]);

  function start() {
    if (!snapshot.data?.writable || liveDraft.current) return;
    const board = snapshot.data.board;
    changeDraft({ base: board, board, requestId: createRequestId() });
    setNotice(undefined);
  }

  function update(board: DashboardBoard) {
    const current = liveDraft.current;
    if (!current || inFlight.current || unverified.current) return;
    changeDraft({ ...current, board, requestId: createRequestId() });
  }

  function cancel() {
    if (inFlight.current || unverified.current) return;
    changeDraft(undefined);
    setNotice(undefined);
    setLatest(undefined);
  }

  function wrote(view: DashboardView) {
    unverified.current = false;
    const key = queryKey(engine.vaultId, capability);
    void qc.cancelQueries({ queryKey: key, exact: true }, { revert: false });
    qc.setQueryData(key, view);
    changeDraft(undefined);
    setLatest(undefined);
    setNotice({ text: "布局已保存。" });
  }

  function save(): Promise<boolean> {
    if (inFlight.current) return inFlight.current;
    if (unverified.current) return Promise.resolve(false);
    const current = liveDraft.current;
    if (!current) return Promise.resolve(true);
    if (matchLayout(current.base, current.board)) {
      cancel();
      return Promise.resolve(true);
    }
    setBusy(true);
    setNotice({ text: "正在保存布局…" });
    const operation = engine
      .call<DashboardView>("home.dashboard.update", { ...editable(current.board), baseRevision: current.base.revision }, { write: true, idempotencyKey: current.requestId })
      .then((view) => {
        if (alive.current) wrote(view);
        return true;
      })
      .catch((error: unknown) => {
        if (!alive.current) return false;
        if (error instanceof CapabilityError && error.code === "VERSION_CONFLICT") {
          setNotice({ text: "其他会话已保存新版本。你的草稿仍在。", action: "compare", error: true });
        } else if (error instanceof CapabilityError && error.code !== "INTERNAL") {
          setNotice({ text: `布局保存失败。草稿仍在。 ${error.message}`, error: true });
        } else {
          unverified.current = true;
          setNotice({ text: "无法确认保存结果。请先核对已提交布局。", action: "verify", error: true });
        }
        return false;
      })
      .finally(() => {
        inFlight.current = undefined;
        if (alive.current) setBusy(false);
      });
    inFlight.current = operation;
    return operation;
  }

  async function checkLatest() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const view = await engine.call<DashboardView>(capability);
      if (!alive.current || view.vaultId !== engine.vaultId) return;
      if (view.source !== "stored" && view.source !== "default") {
        setNotice({ ...notice, text: "无法读取当前布局原件。草稿仍在。", error: true });
        return;
      }
      if (notice?.action === "verify" && view.board.revision !== draft.base.revision && matchLayout(view.board, draft.board)) {
        wrote(view);
      } else if (notice?.action === "verify" && view.board.revision === draft.base.revision) {
        unverified.current = false;
        setNotice({ text: "已核对，尚未保存布局。草稿仍在，可以重试。", error: true });
      } else {
        setLatest(view);
      }
    } catch {
      if (alive.current) setNotice({ ...notice, text: "未能读取已提交布局。草稿仍在。", error: true });
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  function resolveCompare(useLatest: boolean) {
    if (!latest || !draft) return;
    unverified.current = false;
    qc.setQueryData(queryKey(engine.vaultId, capability), latest);
    changeDraft(useLatest ? undefined : { ...draft, base: latest.board, requestId: createRequestId() });
    setLatest(undefined);
    setNotice(undefined);
  }

  async function chooseLeave(choice: "stay" | "discard" | "save") {
    const decision = pending.current;
    if (!decision || busy) return;
    if (choice === "discard") cancel();
    const allowed = choice === "discard" || (choice === "save" && (await save()));
    decision.finish(allowed && !decision.request.signal.aborted);
  }

  return { snapshot, draft, dirty, notice, latest, leaving, busy, start, update, cancel, save, checkLatest, resolveCompare, closeCompare: () => setLatest(undefined), chooseLeave };
}
