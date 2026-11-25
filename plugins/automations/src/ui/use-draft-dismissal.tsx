import { Button, Dialog } from "@huhu/ui";
import { registerExitParticipant, type ExitParticipant, type ModuleProps } from "@huhu/workbench";
import { useCallback, useEffect, useRef, useState } from "react";

export function useDraftDismissal({ dirty, locked, close, registerLeaveGuard, enabled = true }: {
  dirty: boolean;
  enabled?: boolean;
  locked: boolean;
  close(): void;
  registerLeaveGuard: ModuleProps["registerLeaveGuard"];
}) {
  const [confirming, setConfirming] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  const decision = useRef<{ promise: Promise<boolean>; resolve(value: boolean): void } | null>(null);

  const finish = useCallback((discard: boolean) => {
    const pending = decision.current;
    decision.current = null;
    pending?.resolve(discard);
    setConfirming(false);
    if (discard) close();
  }, [close]);

  const confirm = useCallback((): Promise<boolean> => {
    if (decision.current) return decision.current.promise;
    let resolveDecision: (value: boolean) => void = () => {};
    const promise = new Promise<boolean>((resolve) => { resolveDecision = resolve; });
    decision.current = { promise, resolve: resolveDecision };
    setConfirming(true);
    return promise;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const guard: ExitParticipant = (request) => {
      if (locked || request.signal.aborted) return false;
      if (!dirty) return true;
      const abort = () => finish(false);
      request.signal.addEventListener("abort", abort, { once: true });
      return request.waitForUser(confirm()).finally(() => request.signal.removeEventListener("abort", abort));
    };
    const unregisterLeave = registerLeaveGuard?.(guard);
    const unregisterExit = registerExitParticipant(guard);
    return () => {
      unregisterLeave?.();
      unregisterExit();
    };
  }, [confirm, dirty, enabled, finish, locked, registerLeaveGuard]);

  useEffect(() => () => {
    decision.current?.resolve(false);
    decision.current = null;
  }, []);

  return {
    dismiss() {
      if (locked) return;
      if (dirty) void confirm();
      else close();
    },
    confirmation: confirming ? <Dialog open title="放弃未保存的更改？" initialFocusRef={keep} onClose={() => finish(false)}
      actions={<><Button ref={keep} onClick={() => finish(false)}>继续编辑</Button>
        <Button variant="danger" onClick={() => finish(true)}>放弃更改</Button></>}>
      <p>放弃后将清除当前表单中的更改。</p>
    </Dialog> : null,
  };
}
