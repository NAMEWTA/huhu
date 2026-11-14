import { Banner, Button, EmptyState } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { useState } from "react";
import { t } from "../i18n.js";
import { useCall } from "../useCall.js";

type Choice = "ours" | "theirs" | "both" | { custom: string };
type WholePick = "ours" | "theirs" | "delete";
interface Listing {
  conflict: { id: string; files: { path: string; kind: "blocks" | "whole"; blocks: number; reason?: string }[] } | null;
}
type Seg = { kind: "common"; text: string } | { kind: "conflict"; index: number; base: string; ours: string; theirs: string };
interface Side {
  exists: boolean;
  size?: number;
  binary?: boolean;
  preview?: string;
}
type FileView = { path: string; kind: "blocks"; segments: Seg[] } | { path: string; kind: "whole"; reason: string; ours: Side; theirs: Side };

const CONTEXT = 3;

export function ConflictView({ onBack }: { onBack: () => void }) {
  const call = useCall();
  const list = useCapability<Listing>("conflicts.list", {});
  const [sel, setSel] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Record<string, (Choice | undefined)[]>>({});
  const [whole, setWhole] = useState<Record<string, WholePick | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "stale"; text: string } | null>(null);

  async function resync() {
    setBusy(true);
    setMsg(null);
    await call("sync.run", { mode: "sync" });
    setBusy(false);
    setBlocks({});
    setWhole({});
    setSel(null);
  }

  const conflict = list.data?.conflict ?? null;
  if (list.isError)
    return (
      <div role="alert" className="hu-overdue" data-testid="conflict-load-error">
        {list.error instanceof Error ? list.error.message : String(list.error)}
      </div>
    );
  if (!list.data) return <p>…</p>;
  if (!conflict) {
    return (
      <div data-testid="conflict-view">
        {msg ? (
          <div role={msg.tone === "error" ? "alert" : "status"} data-testid="conflict-message">
            {msg.text}
          </div>
        ) : null}
        <EmptyState
          title={t.conflicts.none}
          action={
            <div className="hu-row">
              {msg?.tone === "stale" ? (
                <Button variant="primary" disabled={busy} onClick={() => void resync()} data-testid="conflict-resync">
                  {t.conflicts.resync}
                </Button>
              ) : null}
              <Button onClick={onBack}>{t.conflicts.back}</Button>
            </div>
          }
        />
      </div>
    );
  }
  const files = conflict.files;
  const current = files.find((f) => f.path === sel) ?? (files[0] as (typeof files)[number]);
  const total = files.reduce((n, f) => n + (f.kind === "blocks" ? f.blocks : 1), 0);
  const done = files.reduce((n, f) => n + (f.kind === "blocks" ? (blocks[f.path] ?? []).filter((c) => c !== undefined).length : whole[f.path] ? 1 : 0), 0);
  const complete = done === total && total > 0;

  async function apply() {
    setBusy(true);
    setMsg(null);
    const resolutions = files.map((f) => (f.kind === "blocks" ? { path: f.path, blocks: Array.from({ length: f.blocks }, (_, i) => (blocks[f.path] ?? [])[i] as Choice) } : { path: f.path, whole: whole[f.path] as WholePick }));
    const r = await call<{ commit: string; pushed: boolean; syncError?: string }>("conflicts.resolve", { sessionId: conflict!.id, resolutions });
    setBusy(false);
    if (r.ok) {
      setBlocks({});
      setWhole({});
      setSel(null);
      setMsg({ tone: "ok", text: `${t.conflicts.resolved}${r.data.pushed ? t.conflicts.pushed : ""}${r.data.syncError ? t.conflicts.syncFailed(r.data.syncError) : ""}` });
    } else if (r.code === "VERSION_CONFLICT") setMsg({ tone: "stale", text: t.conflicts.stale });
    else setMsg({ tone: "error", text: r.message });
  }

  async function cancel() {
    setBusy(true);
    const r = await call("conflicts.cancel", {});
    setBusy(false);
    if (r.ok) {
      setBlocks({});
      setWhole({});
      setSel(null);
      setMsg({ tone: "ok", text: t.conflicts.cancelled });
    }
  }

  return (
    <div data-testid="conflict-view">
      <h1>{t.conflicts.title}</h1>
      {msg ? (
        <Banner
          tone={msg.tone === "ok" ? "blue" : msg.tone === "stale" ? "warning" : "danger"}
          action={
            msg.tone === "stale" ? (
              <Button onClick={() => void resync()} data-testid="conflict-resync">
                {t.conflicts.resync}
              </Button>
            ) : undefined
          }
        >
          <span data-testid="conflict-message">{msg.text}</span>
        </Banner>
      ) : null}
      <div className="hu-row" role="group" aria-label={t.conflicts.files}>
        {files.map((f) => (
          <button key={f.path} type="button" className="hu-nav-item" aria-current={f.path === current.path} data-testid="conflict-file" onClick={() => setSel(f.path)}>
            {f.path}
          </button>
        ))}
      </div>
      <FileBody
        key={`${conflict.id}:${current.path}`}
        path={current.path}
        choices={blocks[current.path] ?? []}
        pick={whole[current.path]}
        onChoice={(i, c) =>
          setBlocks((b) => {
            const next = [...(b[current.path] ?? [])];
            next[i] = c;
            return { ...b, [current.path]: next };
          })
        }
        onPick={(p) => setWhole((w) => ({ ...w, [current.path]: p }))}
      />
      <div className="hu-row">
        <span data-testid="conflict-progress" role="status">
          {t.conflicts.progress(done, total)}
        </span>
        <Button variant="primary" disabled={!complete || busy} loading={busy} onClick={() => void apply()} data-testid="conflict-apply">
          {busy ? t.conflicts.applying : t.conflicts.apply}
        </Button>
        <Button disabled={busy} onClick={() => void cancel()} data-testid="conflict-cancel">
          {t.conflicts.cancel}
        </Button>
        <span>{t.conflicts.cancelNote}</span>
      </div>
    </div>
  );
}

function FileBody({ path, choices, pick, onChoice, onPick }: { path: string; choices: (Choice | undefined)[]; pick: WholePick | undefined; onChoice: (i: number, c: Choice) => void; onPick: (p: WholePick) => void }) {
  const view = useCapability<FileView>("conflicts.read", { path });
  if (view.isError)
    return (
      <div role="alert" className="hu-overdue">
        {view.error instanceof Error ? view.error.message : String(view.error)}
      </div>
    );
  if (!view.data) return <p>…</p>;
  const v = view.data;
  if (v.kind === "whole") {
    const sideText = (s: Side) => (!s.exists ? t.conflicts.absent : s.binary ? `${t.conflicts.binary}（${t.conflicts.size(s.size ?? 0)}）` : (s.preview ?? t.conflicts.size(s.size ?? 0)));
    return (
      <div data-testid="conflict-whole">
        <p>
          {t.conflicts.whole}：{v.reason}
        </p>
        <div className="hu-row" style={{ alignItems: "flex-start" }}>
          <div>
            <strong>{t.conflicts.ours}</strong>
            <pre data-testid="whole-ours">{sideText(v.ours)}</pre>
          </div>
          <div>
            <strong>{t.conflicts.theirs}</strong>
            <pre data-testid="whole-theirs">{sideText(v.theirs)}</pre>
          </div>
        </div>
        <div role="radiogroup" aria-label={path} className="hu-row">
          {(
            [
              ["ours", v.ours.exists ? t.conflicts.keepOursWhole : t.conflicts.delete],
              ["theirs", v.theirs.exists ? t.conflicts.takeTheirs : t.conflicts.delete],
            ] as const
          ).map(([k, label]) => (
            <Button key={k} role="radio" aria-checked={pick === k} variant={pick === k ? "primary" : "secondary"} data-testid={`whole-pick-${k}`} onClick={() => onPick(k)}>
              {label}
            </Button>
          ))}
        </div>
      </div>
    );
  }
  const nBlocks = v.segments.filter((s) => s.kind === "conflict").length;
  return (
    <div data-testid="conflict-blocks">
      {v.segments.map((s, i) =>
        s.kind === "common" ? <Common key={i} text={s.text} first={i === 0} last={i === v.segments.length - 1} /> : <Block key={i} seg={s} n={nBlocks} choice={choices[s.index]} onChoice={(c) => onChoice(s.index, c)} />,
      )}
    </div>
  );
}

function Common({ text, first, last }: { text: string; first: boolean; last: boolean }) {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const head = first ? 0 : CONTEXT;
  const tail = last ? 0 : CONTEXT;
  if (lines.length <= head + tail + 1) return <pre>{text}</pre>;
  const hidden = lines.length - head - tail;
  return (
    <pre>
      {lines.slice(0, head).join("")}
      <em>
        {t.conflicts.unchanged(hidden)}
        {"\n"}
      </em>
      {lines.slice(lines.length - tail).join("")}
    </pre>
  );
}

function Block({ seg, n, choice, onChoice }: { seg: Extract<Seg, { kind: "conflict" }>; n: number; choice: Choice | undefined; onChoice: (c: Choice) => void }) {
  const kind = choice === undefined ? null : typeof choice === "string" ? choice : "custom";
  const [draft, setDraft] = useState(typeof choice === "object" ? choice.custom : seg.ours);
  const label = t.conflicts.block(seg.index + 1, n);
  return (
    <fieldset data-testid="conflict-block" aria-label={label}>
      <legend>{label}</legend>
      <div className="hu-row" style={{ alignItems: "flex-start" }}>
        <div>
          <strong>{t.conflicts.ours}</strong>
          <pre data-testid="block-ours">{seg.ours}</pre>
        </div>
        <div>
          <strong>{t.conflicts.theirs}</strong>
          <pre data-testid="block-theirs">{seg.theirs}</pre>
        </div>
      </div>
      <div role="radiogroup" aria-label={label} className="hu-row">
        {(
          [
            ["ours", t.conflicts.keepOurs],
            ["theirs", t.conflicts.takeTheirs],
            ["both", t.conflicts.both],
          ] as const
        ).map(([k, text]) => (
          <Button key={k} role="radio" aria-checked={kind === k} variant={kind === k ? "primary" : "secondary"} data-testid={`block-pick-${k}`} onClick={() => onChoice(k)}>
            {text}
          </Button>
        ))}
        <Button role="radio" aria-checked={kind === "custom"} variant={kind === "custom" ? "primary" : "secondary"} data-testid="block-pick-custom" onClick={() => onChoice({ custom: draft })}>
          {t.conflicts.edit}
        </Button>
      </div>
      {kind === "custom" ? (
        <textarea
          className="hu-input"
          aria-label={t.conflicts.customLabel}
          data-testid="block-custom-text"
          rows={Math.min(12, Math.max(3, draft.split("\n").length + 1))}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onChoice({ custom: e.target.value });
          }}
        />
      ) : null}
    </fieldset>
  );
}
