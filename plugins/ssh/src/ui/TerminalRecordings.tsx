import { Button, EmptyState, PageHead, SearchBox } from "@huhu/ui";
import { host as desktopHost, useCapability, useEngine, useEngineEvents, useQueryClient } from "@huhu/workbench";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { RecordingContent, RecordingSummary } from "../shared/recordings.js";

const recordings = "ssh.recordings.list";
function useRecordings() {
  const engine = useEngine();
  const qc = useQueryClient();
  useEngineEvents((event) => {
    if (event.type === "entity.changed" && "kind" in event.payload && event.payload.kind === "ssh-recording") {
      void qc.invalidateQueries({ predicate: ({ queryKey }) => queryKey[0] === engine.vaultId && queryKey[1] === recordings });
    }
  });
  return useCapability<RecordingSummary[]>(recordings, {}, { enabled: Boolean(desktopHost()) });
}

export function RecordTerminal({ shellId }: { shellId: string }) {
  const engine = useEngine();
  const records = useRecordings();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const live = records.data?.find((entry) => entry.shellId === shellId && !entry.endedAt);
  if (!desktopHost()) return null;
  async function toggle() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await engine.call(live ? "ssh.recordings.stop" : "ssh.recordings.start", { shellId }, { write: true });
      await records.refetch();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "无法更新录制。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button loading={busy} disabled={!records.data} onClick={() => void toggle()}>
        {live ? "停止录制" : "开始录制"}
      </Button>
      {message && <span role="alert">{message}</span>}
    </>
  );
}

function highlighted(text: string, query: string) {
  if (!query) return text;
  const items = [];
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  let start = 0;
  let match: number;
  while ((match = lower.indexOf(needle, start)) !== -1) {
    items.push(
      <Fragment key={start}>
        {text.slice(start, match)}
        <mark>{text.slice(match, match + query.length)}</mark>
      </Fragment>,
    );
    start = match + query.length;
    if (items.length >= 200) break;
  }
  return [...items, text.slice(start)];
}

function playbackTime(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(3).padStart(6, "0");
  return `${minutes}:${seconds}`;
}

function RecordingDetail({ content }: { content: RecordingContent }) {
  const { summary, text, timeline } = content;
  const [query, setQuery] = useState("");
  const [positionMs, setPositionMs] = useState<number | null>(null);
  const [playback, setPlayback] = useState<{ startedAt: number; fromMs: number } | null>(null);
  const durationMs = timeline?.durationMs ?? 0;
  const position = Math.min(positionMs ?? durationMs, durationMs);
  const progressText = `${playbackTime(position)} / ${playbackTime(durationMs)}`;
  const hasPlayback = Boolean(summary.endedAt && timeline?.checkpoints.length);

  useEffect(() => {
    if (!playback) return;
    const timer = window.setInterval(() => {
      const next = Math.min(durationMs, playback.fromMs + Math.floor(performance.now() - playback.startedAt));
      setPositionMs(next);
      if (next === durationMs) setPlayback(null);
    }, 50);
    return () => window.clearInterval(timer);
  }, [durationMs, playback]);

  function togglePlayback() {
    if (playback) {
      setPositionMs(Math.min(durationMs, playback.fromMs + Math.floor(performance.now() - playback.startedAt)));
      setPlayback(null);
      return;
    }
    const fromMs = position === durationMs ? 0 : position;
    setPositionMs(fromMs);
    setPlayback({ fromMs, startedAt: performance.now() });
  }

  const visibleEnd = hasPlayback ? (timeline?.checkpoints.findLast(({ atMs }) => atMs <= position)?.end ?? 0) : text.length;
  const visibleText = text.slice(0, visibleEnd);
  const output = useMemo(() => highlighted(visibleText, query), [visibleText, query]);
  const noMatch = useMemo(() => Boolean(query && !text.toLowerCase().includes(query.toLowerCase())), [text, query]);
  const links = useMemo(() => {
    const complete = new Set<string>();
    for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gu)) {
      if (match.index + match[0].length > visibleEnd) break;
      complete.add(match[0]);
      if (complete.size === 20) break;
    }
    return [...complete];
  }, [text, visibleEnd]);

  return (
    <article className="hu-card-alt hu-stack">
      <h3>录制回放</h3>
      <p>
        {new Date(summary.startedAt).toLocaleString()} – {summary.endedAt ? new Date(summary.endedAt).toLocaleString() : "正在录制"}
      </p>
      <p>录制前的输出未收集。{summary.truncated ? "已达到 256 KiB 上限，后续输出未收录。" : ""}</p>
      {hasPlayback && (
        <div className="ssh-recording-playback">
          <Button onClick={togglePlayback}>{playback ? "暂停回放" : "播放录制"}</Button>
          <label className="hu-field">
            回放进度
            <input
              type="range"
              min={0}
              max={durationMs}
              step={1}
              value={position}
              aria-valuetext={progressText}
              onChange={(event) => {
                setPlayback(null);
                setPositionMs(event.currentTarget.valueAsNumber);
              }}
            />
          </label>
          <span>{progressText}</span>
        </div>
      )}
      {summary.endedAt && !timeline && <p>此录制没有可用的回放时间轴，可以查看原始文本。</p>}
      {timeline && !timeline.checkpoints.length && <p>此录制没有可显示的输出。</p>}
      <SearchBox
        value={query}
        onChange={(next) => {
          setQuery(next);
          setPlayback(null);
          setPositionMs(null);
        }}
        placeholder="在此录制内查找…"
      />
      {noMatch && <p role="status">此录制没有匹配内容。</p>}
      <pre className="ssh-recording-text">{output}</pre>
      {links.length > 0 && (
        <ul aria-label="录制中的链接">
          {links.map((href) => (
            <li key={href}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  const open = desktopHost()?.openExternal;
                  if (open) {
                    event.preventDefault();
                    void open(href);
                  }
                }}
              >
                {href}
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function TerminalRecordingsPanel({ onBack }: { onBack(): void }) {
  const records = useRecordings();
  const [shellId, setShellId] = useState("");
  const [selected, setSelected] = useState("");
  const content = useCapability<RecordingContent>("ssh.recordings.read", { id: selected }, { enabled: Boolean(selected) });
  const refetchContent = content.refetch;
  const recording = content.data?.summary.id === selected ? content.data : undefined;
  const capturing = Boolean(recording && !recording.summary.endedAt);
  useEffect(() => {
    if (!capturing) return;
    const timer = window.setInterval(() => void refetchContent(), 2000);
    return () => window.clearInterval(timer);
  }, [capturing, refetchContent]);
  const entries = records.data?.filter((record) => !shellId || shellId === record.shellId) ?? [];
  const shells = new Map(records.data?.map((record) => [record.shellId, record.label]));
  return (
    <section className="hu-view-content">
      <PageHead title="会话日志" description="查看此设备显式录制的 SSH Shell 输出。" actions={<Button onClick={onBack}>返回主机</Button>} />
      <label className="hu-field">
        Shell 会话
        <select
          value={shellId}
          onChange={(event) => {
            setShellId(event.currentTarget.value);
            setSelected("");
          }}
        >
          <option value="">所有会话</option>
          {[...shells].map(([id, label]) => (
            <option key={id} value={id}>
              {label} · {id}
            </option>
          ))}
        </select>
      </label>
      {(records.error || content.error) && <p role="alert">{(records.error || content.error)?.message}</p>}
      {records.data && entries.length === 0 && <EmptyState title="当前范围没有录制" />}
      <ul className="hu-stack">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Button aria-pressed={selected === entry.id} onClick={() => setSelected(entry.id)}>
              {entry.label} · {new Date(entry.startedAt).toLocaleString()} · {entry.endedAt ? "已停止" : "录制中"}
            </Button>
          </li>
        ))}
      </ul>
      {recording && <RecordingDetail key={recording.summary.id} content={recording} />}
    </section>
  );
}
