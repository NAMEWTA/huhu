import { IconButton } from "@huhu/ui";
import { ArrowUpRight, Command, FileText, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { ContributionRegistry } from "../contributions.js";
import { EngineClient } from "../engine-client/client.js";
import type { UiState } from "../state/ui-store.js";
import { runExternalCommand, type ExternalCommandRef } from "../plugins/run-command.js";
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
  const open = s.paletteOpen;
  const setOpen = s.setPaletteOpen;
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
        setOpen(!ui.getState().paletteOpen);
        setQ("");
        setSel(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) {
      input.current?.focus();
      setQ(""); // 每次打开从空白开始（侧栏按钮、标签条“+”等入口也是）
      setSel(0);
    }
  }, [open]);

  // 外部扩展注册的命令：打开面板时读取（扩展启停后下次打开即更新）
  const [pluginCommands, setPluginCommands] = useState<ExternalCommandRef[]>([]);
  useEffect(() => {
    if (!open || !client) return;
    let alive = true;
    client
      .call<ExternalCommandRef[]>("plugins.commands.list", {})
      .then((r) => alive && setPluginCommands(r))
      .catch(() => alive && setPluginCommands([]));
    return () => {
      alive = false;
    };
  }, [open, client]);

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
          setResults(r.hits.map((h) => ({ id: `res:${h.path}`, group: "result" as const, title: h.title || h.path, hint: h.path, icon: <FileText size={18} aria-hidden />, run: () => onOpenResult?.(h) })));
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
      ...modules.map((m): PaletteItem => ({ id: `mod:${m.id}`, group: "module", title: m.title, hint: "打开模块", icon: m.icon, run: () => s.openModule(m.id) })),
      ...commands.map((c): PaletteItem => ({ id: `cmd:${c.id}`, group: "command", title: c.title, hint: "命令", icon: <Command size={18} aria-hidden />, run: c.run })),
      ...pluginCommands.map((c): PaletteItem => ({
        id: `ext:${c.pluginId}:${c.id}`,
        group: "command",
        title: c.title,
        hint: `扩展 · ${c.pluginId}`,
        icon: <Command size={18} aria-hidden />,
        run: () => void (client && runExternalCommand(client, c).catch(() => undefined)),
      })),
    ],
    [modules, commands, pluginCommands, client, s],
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
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="命令面板" className="modal modal-wide" data-testid="command-palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>搜索与命令</h2>
          </div>
          <IconButton icon={X} label="关闭" onClick={() => setOpen(false)} />
        </div>
        <div className="palette-search">
          <Search size={20} aria-hidden />
          <input
            ref={input}
            role="combobox"
            aria-expanded
            aria-autocomplete="list"
            aria-controls="hu-palette-list"
            aria-activedescendant={items[sel] ? `hu-palette-opt-${sel}` : undefined}
            aria-label="搜索模块、命令和内容"
            placeholder="搜索笔记、任务、功能，或输入命令…"
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
              } else if (e.key === "Home" || e.key === "End") {
                e.preventDefault();
                setSel(e.key === "Home" ? 0 : Math.max(0, items.length - 1));
              } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                const it = items[sel];
                if (it) run(it);
              } // IME 组合期间 Enter 不执行
            }}
          />
          <kbd>ESC</kbd>
        </div>
        <div id="hu-palette-list" className="command-results" role="listbox" aria-label="搜索结果">
          {items.map((it, i) => (
            <button
              key={it.id}
              id={`hu-palette-opt-${i}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={i === sel}
              className={i === sel ? "selected" : ""}
              data-testid="palette-item"
              data-group={it.group}
              onPointerMove={() => setSel(i)}
              onClick={() => run(it)}
            >
              <span className="command-icon">{it.icon ?? <Command size={18} aria-hidden />}</span>
              <span className="grow">
                <strong>{it.title}</strong>
                {it.hint ? <small>{it.hint}</small> : null}
              </span>
              <ArrowUpRight size={15} aria-hidden />
            </button>
          ))}
          {items.length === 0 ? <p className="tw-empty-group">{searching ? "搜索中…" : "没有找到结果"}</p> : null}
        </div>
        <div className="palette-foot">
          <span>↑ ↓ 选择 · Enter 打开</span>
          <span>ESC 关闭</span>
          <span>所有结果遵循当前插件状态</span>
        </div>
      </div>
    </div>
  );
}
