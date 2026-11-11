import { createTwoFilesPatch, diffLines, diffWordsWithSpace } from "diff";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Copy, Download, FileText, Folder, GitCompareArrows } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "./Dialog.js";
import { Segmented } from "./Segmented.js";
import { Badge, Button } from "./ui.js";

interface SplitRow {
  kind: "same" | "change" | "remove" | "add";
  left?: number | null;
  right?: number | null;
  old?: string | undefined;
  new?: string | undefined;
}
interface UnifiedRow {
  kind: "same" | "remove" | "add";
  left?: number;
  right?: number;
  text: string;
}
export interface DiffResult {
  split: SplitRow[];
  unified: UnifiedRow[];
  added: number;
  removed: number;
}

const lines = (value: string): string[] => {
  const a = value.split("\n");
  if (value.endsWith("\n")) a.pop();
  return a;
};

/** 行级差异（并排 + 统一两种行表）。逻辑取自原型 review-components.jsx。 */
export function buildDiffRows(before: string, after: string, ignoreWhitespace = false): DiffResult {
  const parts = diffLines(before, after, { ignoreWhitespace, maxEditLength: 12000 });
  if (!parts) throw new Error("差异超过计算预算，请导出两个版本后使用本地差异工具查看。");
  const split: SplitRow[] = [];
  const unified: UnifiedRow[] = [];
  let left = 1;
  let right = 1;
  let added = 0;
  let removed = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const rows = lines(part.value);
    if (!part.added && !part.removed) {
      for (const text of rows) {
        split.push({ kind: "same", left, right, old: text, new: text });
        unified.push({ kind: "same", left: left++, right: right++, text });
      }
      continue;
    }
    if (part.removed) {
      const old = rows;
      let next: string[] = [];
      if (parts[i + 1]?.added) next = lines(parts[++i]!.value);
      removed += old.length;
      added += next.length;
      const leftStart = left;
      const rightStart = right;
      old.forEach((text, n) => unified.push({ kind: "remove", left: leftStart + n, text }));
      next.forEach((text, n) => unified.push({ kind: "add", right: rightStart + n, text }));
      for (let n = 0; n < Math.max(old.length, next.length); n++)
        split.push({
          kind: old[n] !== undefined && next[n] !== undefined ? "change" : old[n] !== undefined ? "remove" : "add",
          left: old[n] !== undefined ? left++ : null,
          right: next[n] !== undefined ? right++ : null,
          old: old[n],
          new: next[n],
        });
    } else {
      added += rows.length;
      for (const text of rows) {
        split.push({ kind: "add", right, new: text });
        unified.push({ kind: "add", right: right++, text });
      }
    }
  }
  return { split, unified, added, removed };
}

function Inline({ oldText, newText, side }: { oldText: string | undefined; newText: string | undefined; side: "old" | "new" }) {
  if (oldText === undefined || newText === undefined || oldText.length + newText.length > 2500) return <>{(side === "old" ? oldText : newText) || " "}</>;
  const pieces = diffWordsWithSpace(oldText, newText);
  return (
    <>
      {pieces
        .filter((p) => (side === "old" ? !p.added : !p.removed))
        .map((p, i) => (
          <span key={i} className={p.added ? "review-word-added" : p.removed ? "review-word-removed" : undefined}>
            {p.value}
          </span>
        ))}
    </>
  );
}

const save = (name: string, text: string): void => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

export interface ReviewDiffProps {
  before?: string;
  after?: string;
  path?: string;
  mode?: "split" | "unified";
  onLineSelect?(s: { side: "old" | "new"; line: number; path: string }): void;
}

/** 差异审查（原型 ReviewDiff）：并排 / 统一，忽略空白，折叠未更改上下文，逐处跳转，选择行号，复制 / 导出补丁。 */
export function ReviewDiff({ before = "", after = "", path = "document.md", mode = "split", onLineSelect }: ReviewDiffProps) {
  const [layout, setLayout] = useState<"split" | "unified">(mode);
  const [ignoreWhitespace, setIgnore] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [selected, setSelected] = useState<{ side: "old" | "new"; line: number } | null>(null);
  const [cursor, setCursor] = useState(-1);
  const [copy, setCopy] = useState(false);
  const [copyDialog, setCopyDialog] = useState(false);
  const host = useRef<HTMLElement>(null);
  useEffect(() => setLayout(mode), [mode]);
  useEffect(() => {
    setExpanded({});
    setSelected(null);
    setCursor(-1);
  }, [before, after, path]);
  const result = useMemo<DiffResult | { error: string }>(() => {
    try {
      if (before.length + after.length > 800000) return { error: "文档较大，双版本合计超过 800,000 字符；请下载原文，使用本地差异工具审阅。" };
      return buildDiffRows(before, after, ignoreWhitespace);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [before, after, ignoreWhitespace]);
  const error = "error" in result ? result.error : null;
  const ok = "error" in result ? null : result;
  const rows: (SplitRow | UnifiedRow)[] = ok ? ok[layout] : [];
  const changed = rows.map((r, i) => (r.kind !== "same" ? i : null)).filter((x): x is number => x !== null);
  const visible: ({ row: SplitRow | UnifiedRow; index: number } | { fold: true; start: number; count: number })[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (!showAll && rows[i]!.kind === "same") {
      let end = i;
      while (end < rows.length && rows[end]!.kind === "same") end++;
      if (end - i > 8 && !expanded[i]) {
        for (let j = i; j < i + 3; j++) visible.push({ row: rows[j]!, index: j });
        visible.push({ fold: true, start: i, count: end - i - 6 });
        for (let j = end - 3; j < end; j++) visible.push({ row: rows[j]!, index: j });
        i = end - 1;
        continue;
      }
    }
    visible.push({ row: rows[i]!, index: i });
  }
  const patch = () => createTwoFilesPatch(`a/${path}`, `b/${path}`, before, after);
  const jump = (delta: number) => {
    if (!changed.length) return;
    const next = (cursor + delta + changed.length) % changed.length;
    setCursor(next);
    setShowAll(true);
    setTimeout(() => host.current?.querySelector(`[data-review-row="${changed[next]}"]`)?.scrollIntoView?.({ block: "center", behavior: "smooth" }), 0);
  };
  const choose = (side: "old" | "new", line: number | null | undefined) => {
    if (!line) return;
    setSelected({ side, line });
    onLineSelect?.({ side, line, path });
  };
  const fileName = path.split("/").at(-1) ?? path;
  return (
    <section className="review-diff" aria-label={`差异审查 ${path}`} ref={host}>
      <header className="review-header">
        <div className="review-file">
          <GitCompareArrows size={16} aria-hidden />
          <strong title={path}>{path}</strong>
          <span className="review-count-add">+{ok?.added ?? 0}</span>
          <span className="review-count-remove">−{ok?.removed ?? 0}</span>
          {!error && !changed.length ? <Badge>无差异</Badge> : null}
        </div>
        <Segmented<"split" | "unified">
          label="差异布局"
          value={layout}
          onChange={(v) => {
            setLayout(v);
            setCursor(-1);
          }}
          options={[
            { value: "split", label: "并排" },
            { value: "unified", label: "统一" },
          ]}
        />
      </header>
      <div className="review-toolbar">
        <label className="review-check">
          <input type="checkbox" checked={ignoreWhitespace} onChange={(e) => setIgnore(e.target.checked)} />
          忽略行首尾空白
        </label>
        <label className="review-check">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          显示全部上下文
        </label>
        <div className="grow" />
        <Button variant="ghost" icon={ArrowUp} disabled={!changed.length} onClick={() => jump(-1)} title="上一处更改">
          上一处
        </Button>
        <Button variant="ghost" icon={ArrowDown} disabled={!changed.length} onClick={() => jump(1)}>
          下一处
        </Button>
      </div>
      {error ? (
        <div className="review-large" role="alert">
          <p>{error}</p>
          <Button onClick={() => save(`before-${fileName}`, before)}>下载旧版本</Button>
          <Button onClick={() => save(`after-${fileName}`, after)}>下载新版本</Button>
        </div>
      ) : (
        <div className={`review-body review-${layout}`}>
          <div className="review-column-labels">
            {layout === "split" ? (
              <>
                <span>修改前</span>
                <span>修改后</span>
              </>
            ) : (
              <span>统一差异 · − 删除 / + 新增</span>
            )}
          </div>
          {visible.map((v) => {
            if ("fold" in v)
              return (
                <button key={`f${v.start}`} type="button" className="review-fold" onClick={() => setExpanded({ ...expanded, [v.start]: true })}>
                  展开 {v.count} 行未更改内容
                </button>
              );
            const { row, index } = v;
            if (layout === "split") {
              const r = row as SplitRow;
              return (
                <div className={`review-split-row ${r.kind} ${changed[cursor] === index ? "review-current" : ""}`} key={index} data-review-row={index}>
                  <div className={`review-side ${r.old === undefined ? "review-void" : ""} ${r.kind === "remove" || r.kind === "change" ? "removed" : ""}`}>
                    <button type="button" className={selected?.side === "old" && selected.line === r.left ? "selected" : ""} onClick={() => choose("old", r.left)} disabled={!r.left} aria-label={`旧版本第 ${r.left || 0} 行`}>
                      {r.left || ""}
                    </button>
                    <code>
                      <Inline oldText={r.old} newText={r.new} side="old" />
                    </code>
                  </div>
                  <div className={`review-side ${r.new === undefined ? "review-void" : ""} ${r.kind === "add" || r.kind === "change" ? "added" : ""}`}>
                    <button type="button" className={selected?.side === "new" && selected.line === r.right ? "selected" : ""} onClick={() => choose("new", r.right)} disabled={!r.right} aria-label={`新版本第 ${r.right || 0} 行`}>
                      {r.right || ""}
                    </button>
                    <code>
                      <Inline oldText={r.old} newText={r.new} side="new" />
                    </code>
                  </div>
                </div>
              );
            }
            const r = row as UnifiedRow;
            return (
              <div className={`review-unified-row ${r.kind} ${changed[cursor] === index ? "review-current" : ""}`} data-review-row={index} key={index}>
                <button type="button" onClick={() => choose(r.kind === "remove" ? "old" : "new", r.kind === "remove" ? r.left : r.right)} aria-label={`差异第 ${r.right || r.left} 行`}>
                  <span>{r.left || ""}</span>
                  <span>{r.right || ""}</span>
                </button>
                <i>{r.kind === "add" ? "+" : r.kind === "remove" ? "−" : " "}</i>
                <code>{r.text || " "}</code>
              </div>
            );
          })}
        </div>
      )}
      <footer className="review-footer">
        <span>
          {selected ? `${selected.side === "old" ? "旧" : "新"}版本 · 第 ${selected.line} 行` : "选择行号定位审查位置"}
          {cursor >= 0 && changed.length ? ` · 更改 ${cursor + 1}/${changed.length}` : ""}
        </span>
        <div className="grow" />
        <Button
          icon={copy ? Check : Copy}
          disabled={!!error}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(patch());
              setCopy(true);
              setTimeout(() => setCopy(false), 1800);
            } catch {
              setCopyDialog(true);
            }
          }}
        >
          {copy ? "已复制" : "复制补丁"}
        </Button>
        <Button icon={Download} disabled={!!error} onClick={() => save(`${path.replaceAll("/", "_")}.patch`, patch())}>
          导出补丁
        </Button>
      </footer>
      {copyDialog ? (
        <Dialog open title="复制差异补丁" onClose={() => setCopyDialog(false)} actions={<Button onClick={() => setCopyDialog(false)}>关闭</Button>}>
          <textarea className="review-copy" aria-label="差异补丁文本" readOnly value={patch()} onFocus={(e) => e.target.select()} />
          <p>选择文本后按 Ctrl / ⌘ + C。</p>
        </Dialog>
      ) : null}
    </section>
  );
}

export interface ChangeFile {
  id: string;
  path: string;
  status?: string;
  decision?: string;
}

/** 变更文件导航（原型 ChangeFileTree）：按目录分组的文件列表，带状态标记。 */
export function ChangeFileTree({ files = [], onSelect, selected }: { files?: ChangeFile[]; onSelect?(id: string): void; selected?: string | null }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const m = new Map<string, ChangeFile[]>();
    for (const f of files) {
      const i = f.path.lastIndexOf("/");
      const folder = i < 0 ? "" : f.path.slice(0, i);
      m.set(folder, [...(m.get(folder) ?? []), f]);
    }
    return [...m];
  }, [files]);
  return (
    <div className="change-file-tree" aria-label="变更文件导航">
      <div className="change-tree-title">
        <Folder size={15} aria-hidden />
        <strong>变更文件</strong>
        <Badge>{files.length}</Badge>
      </div>
      {!files.length ? <p className="muted small">没有待审查的文件。</p> : null}
      {groups.map(([folder, list]) => (
        <section key={folder || "/"}>
          {folder ? (
            <button type="button" className="change-tree-folder" aria-expanded={!closed[folder]} onClick={() => setClosed({ ...closed, [folder]: !closed[folder] })}>
              {closed[folder] ? <ChevronRight size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
              <Folder size={14} aria-hidden />
              <span title={folder}>{folder}</span>
              <small>{list.length}</small>
            </button>
          ) : null}
          {!folder || !closed[folder] ? (
            <Fragment>
              {list.map((f) => (
                <button type="button" className={`change-tree-file ${selected === f.id ? "active" : ""}`} key={f.id} onClick={() => onSelect?.(f.id)} aria-current={selected === f.id ? "true" : undefined} title={f.path}>
                  <FileText size={14} aria-hidden />
                  <span>{f.path.split("/").at(-1)}</span>
                  {f.decision === "accepted" ? <Check size={13} className="accepted" aria-hidden /> : <small className={f.status === "added" ? "accepted" : "modified"}>{f.status === "added" ? "A" : "M"}</small>}
                </button>
              ))}
            </Fragment>
          ) : null}
        </section>
      ))}
    </div>
  );
}
