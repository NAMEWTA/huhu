import { Button, EmptyState, PageHead, SearchBox } from "@huhu/ui";
import { host as desktopHost, useCapability, useEngine, useEngineEvents, useQueryClient } from "@huhu/workbench";
import { Fragment, useEffect, useState } from "react";
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

export function TerminalRecordingsPanel({ onBack }: { onBack(): void }) {
  const records = useRecordings();
  const [shellId, setShellId] = useState("");
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const content = useCapability<RecordingContent>("ssh.recordings.read", { id: selected }, { enabled: Boolean(selected) });
  const refetchContent = content.refetch;
  const playing = Boolean(content.data && !content.data.summary.endedAt);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => void refetchContent(), 2000);
    return () => window.clearInterval(timer);
  }, [playing, refetchContent]);
  const entries = records.data?.filter((record) => !shellId || shellId === record.shellId) ?? [];
  const shells = new Map(records.data?.map((record) => [record.shellId, record.label]));
  const text = content.data?.text;
  const links = text ? [...new Set(text.match(/https?:\/\/[^\s<>"']+/gu) ?? [])].slice(0, 20) : [];
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
            setQuery("");
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
            <Button
              aria-pressed={selected === entry.id}
              onClick={() => {
                setSelected(entry.id);
                setQuery("");
              }}
            >
              {entry.label} · {new Date(entry.startedAt).toLocaleString()} · {entry.endedAt ? "已停止" : "录制中"}
            </Button>
          </li>
        ))}
      </ul>
      {content.data && (
        <article className="hu-card-alt hu-stack">
          <h3>录制回放</h3>
          <p>
            {new Date(content.data.summary.startedAt).toLocaleString()} – {content.data.summary.endedAt ? new Date(content.data.summary.endedAt).toLocaleString() : "正在录制"}
          </p>
          <p>录制前的输出未收集。{content.data.summary.truncated ? "已达到 256 KiB 上限，后续输出未收录。" : ""}</p>
          <SearchBox value={query} onChange={setQuery} placeholder="在此录制内查找…" />
          {query && !text?.toLowerCase().includes(query.toLowerCase()) && <p role="status">此录制没有匹配内容。</p>}
          <pre className="ssh-recording-text">{highlighted(text ?? "", query)}</pre>
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
      )}
    </section>
  );
}
