import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { DocumentSession } from "./DocumentSession.js";

/** A late save result belongs to the requesting view and session. */
export function useFlushedMode<Mode>(initial: Mode, session: DocumentSession | null, { flushTarget, prepare }: { flushTarget?: Mode; prepare?(next: Mode): void } = {}) {
  const [mode, setMode] = useState(initial);
  const request = useRef(0);
  useLayoutEffect(
    () => () => {
      request.current++;
    },
    [session],
  );

  const changeMode = useCallback(
    (next: Mode) => {
      const id = ++request.current;
      if (next === mode) return;
      if (!session || (flushTarget !== undefined && next !== flushTarget)) {
        setMode(next);
        return;
      }
      void session.flush().then((saved) => {
        if (!saved || request.current !== id) return;
        prepare?.(next);
        setMode(next);
      });
    },
    [flushTarget, mode, prepare, session],
  );
  return { mode, setMode, changeMode };
}
