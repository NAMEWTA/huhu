import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { ContributionRegistry } from "../contributions.js";
import { EngineClient } from "../engine-client/client.js";
import type { UiState } from "../state/ui-store.js";
import { LatestOnly, rankItems, type PaletteItem } from "./palette-model.js";

export interface CommandPaletteProps {
  registry: ContributionRegistry;
  ui: StoreApi<UiState>;
  /** 用于 vault.search；缺省时只有模块与命令。 */
  client?: EngineClient | null;
  /** 搜索结果被选中时的处理（例如在知识库里打开）。 */
  onOpenResult?(r: { path: string; kind: string; title: string }): void;
}

const RECENTS_KEY = "huhu.palette.recents";
const readRecents = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};

/** 命令面板：`Mod+K` 打开；↑↓ 选择，Enter 执行，Esc 关闭。 */
export function CommandPalette({ registry, ui, client, onOpenResult }: CommandPaletteProps) {
  const { modules, commands } = useSyncExternalStore(registry.subscribe, registry.getSnapshot);
  const s = useStore(ui);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [results, setResults] = useState<PaletteItem[]>([]);
  const [searching, setSearching] = useState(false);
  const latest = useRef(new LatestOnly());
  const input = useRef<HTMLInputElement>(null);
  const [recents, setRecents] = useState<string[]>(readRecents);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQ("");
        setSel(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // 搜索：200ms 去抖；输入已变化的旧请求结果被丢弃
  useEffect(() => {
    if (!open || !client || q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const isLatest = latest.current.next();
    setSearching(true);
    setResults([]); // 查询变了：旧结果不再显示
    const timer = setTimeout(() => {
      client
        .call<{ indexing: boolean; hits: { path: string; kind: string; title: string }[] }>("vault.search", { query: q.trim(), limit: 8 })
        .then((r) => {
          if (!isLatest()) return;
          setResults(r.hits.map((h) => ({ id: `res:${h.path}`, group: "result" as const, title: h.title || h.path, hint: h.path, run: () => onOpenResult?.(h) })));
        })
        .catch(() => {
          if (isLatest()) setResults([]);
        })
        .finally(() => {
          if (isLatest()) setSearching(false);
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [q, open, client, onOpenResult]);

  const base = useMemo<PaletteItem[]>(
    () => [
      ...modules.map((m): PaletteItem => ({ id: `mod:${m.id}`, group: "module", title: m.title, hint: "打开模块", run: () => s.openModule(m.id) })),
      ...commands.map((c): PaletteItem => ({ id: `cmd:${c.id}`, group: "command", title: c.title, hint: "命令", run: c.run })),
    ],
    [modules, commands, s],
  );
  const items = useMemo(() => [...rankItems(base, q, recents), ...results], [base, q, recents, results]);
  useEffect(() => {
    setSel(0);
  }, [q]);

  if (!open) return null;
  const run = (it: PaletteItem) => {
    const next = [it.id, ...recents.filter((r) => r !== it.id)].slice(0, 8);
    setRecents(next);
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式下不可用 */
    }
    setOpen(false);
    it.run();
  };
  return (
    <div className="hu-palette-scrim" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-label="命令面板" className="hu-palette" data-testid="command-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="hu-input"
          role="combobox"
          aria-expanded
          aria-controls="hu-palette-list"
          aria-activedescendant={items[sel] ? `hu-palette-opt-${sel}` : undefined}
          aria-label="搜索模块、命令和内容"
          placeholder="搜索模块、命令和内容…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              setOpen(false);
            } else if (e.key === "Escape" && e.nativeEvent.isComposing) {
              /* 输入法取消组合，不关闭面板 */
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((x) => Math.min(items.length - 1, x + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((x) => Math.max(0, x - 1));
            } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const it = items[sel];
              if (it) run(it);
            } // IME 组合期间 Enter 不执行
          }}
        />
        <ul id="hu-palette-list" role="listbox" className="hu-palette-list">
          {items.map((it, i) => (
            <li key={it.id} id={`hu-palette-opt-${i}`} role="option" aria-selected={i === sel} data-testid="palette-item" data-group={it.group} onMouseEnter={() => setSel(i)} onClick={() => run(it)}>
              <span>{it.title}</span>
              {it.hint ? <span className="hu-meta">{it.hint}</span> : null}
            </li>
          ))}
          {items.length === 0 ? (
            <li role="option" aria-selected={false} aria-disabled>
              {searching ? "搜索中…" : "没有匹配项"}
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
