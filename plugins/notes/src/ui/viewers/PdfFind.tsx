import { IconButton } from "@huhu/ui";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { FindState, type EventBus } from "pdfjs-dist/web/pdf_viewer.mjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { v } from "./strings.js";

const FIND_QUERY_MAX = 2048;

type MatchesCount = { current: number; total: number };
type CountEvent = { matchesCount: MatchesCount; rawQuery?: string | null; state?: number };

export function PdfFind({ open, eventBus, inputRef, onClose }: { open: boolean; eventBus: EventBus | null; inputRef: React.RefObject<HTMLInputElement | null>; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; count: MatchesCount } | null>(null);
  const lastRequest = useRef<{ bus: EventBus; query: string } | null>(null);
  const usable = open && query.length > 0 && new TextEncoder().encode(query).length <= FIND_QUERY_MAX ? query : null;

  const dispatchFind = useCallback(
    (type: string, previous = false) => {
      if (!eventBus || !usable) return;
      eventBus.dispatch("find", { source: null, type, query: usable, highlightAll: true, caseSensitive: false, entireWord: false, findPrevious: previous });
    },
    [eventBus, usable],
  );

  useEffect(() => {
    setResult(null);
    if (!eventBus) return;
    if (!usable) {
      eventBus.dispatch("findbarclose", { source: null });
      return;
    }
    const earlierQuery = lastRequest.current?.bus === eventBus ? lastRequest.current.query : undefined;
    const cachedQuery = earlierQuery === usable;
    lastRequest.current = { bus: eventBus, query: usable };
    const subscription = new AbortController();
    let currentSearch = earlierQuery === undefined || cachedQuery;
    const onTextLayerMatches = ({ pageIndex, source }: { pageIndex: number; source: { highlightMatches?: boolean } }) => {
      // PDF.js clears its previous match arrays and resets the total before emitting this event for a new query.
      // Closing the find bar also emits pageIndex -1, with highlights disabled.
      if (pageIndex === -1 && source.highlightMatches) currentSearch = true;
    };
    const onCount = (e: CountEvent) => {
      if (!currentSearch || (e.rawQuery !== undefined && e.rawQuery !== usable)) return;
      // PENDING 在新词搜索开始时可能携带上个词的计数；同词重开时可以立即使用缓存。
      if (e.state === FindState.PENDING && !cachedQuery) return;
      setResult({ query: usable, count: e.matchesCount });
    };
    eventBus.on("updatetextlayermatches", onTextLayerMatches, { signal: subscription.signal });
    eventBus.on("updatefindmatchescount", onCount, { signal: subscription.signal });
    eventBus.on("updatefindcontrolstate", onCount, { signal: subscription.signal });
    // PDF.js 可以在 dispatch 期间同步回报缓存计数。
    dispatchFind("");
    return () => subscription.abort();
  }, [usable, dispatchFind, eventBus]);

  if (!open) return null;
  const count = result && result.query === usable ? result.count : null;
  return (
    <div
      className="notes-pdf-find"
      role="search"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
        else if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) dispatchFind("again", e.shiftKey);
      }}
    >
      <input ref={inputRef} className="notes-pdf-find-input" data-testid="pdf-find-input" autoFocus value={query} placeholder={v.findPlaceholder} aria-label={v.find} onChange={(e) => setQuery(e.target.value)} />
      {query ? (
        <span className="notes-pdf-find-count" data-testid="pdf-find-count">
          {count && count.total > 0 ? `${count.current} / ${count.total}` : v.noMatches}
        </span>
      ) : null}
      <IconButton icon={ChevronUp} label={v.prevMatch} onClick={() => dispatchFind("again", true)} />
      <IconButton icon={ChevronDown} label={v.nextMatch} onClick={() => dispatchFind("again", false)} />
      <IconButton icon={X} label={v.close} onClick={onClose} />
    </div>
  );
}
