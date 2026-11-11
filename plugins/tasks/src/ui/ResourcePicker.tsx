import { Check, FileText, Folder, FolderOpen, Search, X } from "lucide-react";
import { useCapability } from "@huhu/workbench";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DraftResource } from "../shared/draft.js";
import { buildCandidates, searchCandidates, type ResourceCandidate } from "../shared/resources.js";
import { t } from "./i18n.js";

const key = (r: { kind: string; path: string }): string => `${r.kind}:${r.path}`;

function ResourceIcon({ kind, size }: { kind: string; size: number }) {
  return kind === "file" ? <FileText size={size} aria-hidden /> : kind === "root" ? <FolderOpen size={size} aria-hidden /> : <Folder size={size} aria-hidden />;
}

/** 关联资料（原型 vault-resource-picker）：只能从当前 Vault 里真实存在的文件 / 文件夹 / 根目录里选；输入的文字只用于搜索。 */
export function ResourcePicker({ value, onChange }: { value: DraftResource[]; onChange(v: DraftResource[]): void }) {
  const tree = useCapability<{ path: string; type: "file" | "dir"; mtimeMs?: number }[]>("vault.tree", {});
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState<React.CSSProperties>({});
  const listId = useId();
  const candidates = useMemo(() => buildCandidates(tree.data ?? []), [tree.data]);
  const known = useMemo(() => new Set(candidates.map(key)), [candidates]);
  const results = useMemo(() => searchCandidates(candidates, query), [candidates, query]);
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));
  const selected = new Set(value.map(key));
  const refetch = tree.refetch;
  useEffect(() => {
    if (open) {
      void refetch(); // 索引是异步建立的：打开时再取一次，避免只看到根目录
      input.current?.focus();
    }
  }, [open, refetch]);
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex, listId]);

  const change = (c: ResourceCandidate) => {
    onChange(selected.has(key(c)) ? value.filter((r) => key(r) !== key(c)) : [...value, { kind: c.kind, path: c.path, id: null }]);
    input.current?.focus();
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      if (e.key === "Home") setActive(0);
      else if (e.key === "End") setActive(Math.max(0, results.length - 1));
      else if (results.length) setActive((activeIndex + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = results[activeIndex];
      if (c) change(c);
    } else if (e.key === "Backspace" && query === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === "Escape") {
      e.preventDefault(); // 只关闭选择器：不能让 Esc 继续关掉外面的对话框（会丢草稿）
      e.stopPropagation();
      close();
    }
  };
  return (
    <div className="vault-resource-picker" data-testid="resource-picker">
      {value.length > 0 ? (
        <div className="vrp-selected" aria-label={t.picker.selected}>
          {value.map((r) => {
            const missing = tree.data !== undefined && !known.has(key(r));
            return (
              <div key={key(r)} className={`vrp-chip${missing ? " is-missing" : ""}`}>
                <ResourceIcon kind={r.kind} size={14} />
                <span title={r.path}>{r.kind === "root" ? t.picker.kind["root"] : r.path}</span>
                <small>{missing ? t.picker.stale : t.picker.kind[r.kind]}</small>
                <button type="button" aria-label={t.picker.remove(r.path)} onClick={() => onChange(value.filter((x) => key(x) !== key(r)))}>
                  <X size={13} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      <button
        ref={trigger}
        type="button"
        className="vrp-trigger"
        aria-label={t.picker.trigger}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          const r = trigger.current?.getBoundingClientRect();
          if (r) {
            // 浮层固定定位（不被对话框的滚动区裁切）：下方放不下就向上展开
            const below = window.innerHeight - r.bottom;
            setPlace({
              position: "fixed",
              left: Math.max(12, Math.min(r.left, window.innerWidth - 452)),
              ...(below >= 440 || below >= r.top ? { top: r.bottom + 6, maxHeight: Math.max(240, below - 18) } : { bottom: window.innerHeight - r.top + 6, maxHeight: Math.max(240, r.top - 18) }),
            });
          }
          setOpen((o) => !o);
          setQuery("");
          setActive(0);
        }}
      >
        <Search size={14} aria-hidden />
        <span>{value.length ? t.picker.more : t.picker.first}</span>
        <small>{value.length ? t.picker.count(value.length) : t.picker.multi}</small>
      </button>
      {open ? (
        <div className="vrp-popover" role="dialog" aria-label={t.picker.trigger} style={place}>
          <div className="vrp-search">
            <Search size={15} aria-hidden />
            <input
              ref={input}
              role="combobox"
              aria-label={t.picker.searchLabel}
              aria-expanded
              aria-autocomplete="list"
              aria-controls={listId}
              aria-activedescendant={results.length ? `${listId}-${activeIndex}` : undefined}
              placeholder={t.picker.placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
            <kbd>Esc</kbd>
          </div>
          <div id={listId} role="listbox" aria-label={t.picker.results} aria-multiselectable="true" className="vrp-options">
            {results.map((c, i) => (
              <button
                key={key(c)}
                type="button"
                role="option"
                tabIndex={-1}
                id={`${listId}-${i}`}
                aria-selected={selected.has(key(c))}
                className={`vrp-option${i === activeIndex ? " is-active" : ""}`}
                onPointerMove={() => setActive(i)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => change(c)}
              >
                <ResourceIcon kind={c.kind} size={16} />
                <span>
                  <strong>{c.kind === "root" ? t.picker.kind["root"] : c.label}</strong>
                  <small>{c.kind === "root" ? "/" : c.path}</small>
                </span>
                <small>{t.picker.kind[c.kind]}</small>
                {selected.has(key(c)) ? <Check size={14} aria-hidden /> : null}
              </button>
            ))}
            {results.length === 0 ? (
              <div className="vrp-empty" role="status">
                {t.picker.none}
                <br />
                <small>{t.picker.noCreate}</small>
              </div>
            ) : null}
          </div>
          <div className="vrp-footer">
            <span>{t.picker.footer(value.length)}</span>
            <button type="button" onClick={close}>
              {t.picker.close}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
