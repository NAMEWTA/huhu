import type { Settings } from "@huhu/contracts";
import { EmptyState } from "@huhu/ui";
import { requestOpenPath, useCapability, useEngine, WidgetReadStatus, type HomeWidgetContribution } from "@huhu/workbench";
import { ArrowRight, FileText } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";

interface RecentNote {
  path: string;
  title: string;
  folder: string;
  updatedAt: string;
  snippet: string;
}

export function RecentNotesHomeWidget({ onNavigate }: ComponentProps<HomeWidgetContribution["component"]>) {
  const engine = useEngine();
  const recent = useCapability<RecentNote[]>("home.notes.recent");
  const settings = useCapability<Pick<Settings, "dateTime">>("settings.get");
  const opening = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => opening.current?.abort(), []);

  async function open(note: RecentNote) {
    if (opening.current) return;
    const controller = new AbortController();
    opening.current = controller;
    setPending(true);
    setError(null);
    try {
      await engine.call("notes.read", { path: note.path }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      requestOpenPath(note.path, true);
      onNavigate("notes");
    } catch (error) {
      if (!controller.signal.aborted) setError(`无法打开「${note.title}」。${error instanceof Error ? error.message : ""}`);
    } finally {
      if (opening.current === controller) {
        opening.current = null;
        if (!controller.signal.aborted) setPending(false);
      }
    }
  }

  return (
    <div data-testid="card-recent">
      {error ? (
        <div>
          <p role="alert" className="hu-field-error">
            {error}
          </p>
          <button
            type="button"
            className="hu-card-footer-link"
            onClick={() => {
              setError(null);
              void recent.refetch();
            }}
          >
            刷新最近笔记
          </button>
        </div>
      ) : null}
      {recent.isError || !recent.data ? (
        <WidgetReadStatus failed={recent.isError} retry={() => void recent.refetch()} />
      ) : recent.data.length === 0 ? (
        <EmptyState title="还没有笔记" />
      ) : (
        <div className="notes-home-widget-list">
          {recent.data.map((note) => (
            <article className="notes-home-widget-note" key={note.path}>
              <button type="button" className="shell-link-button" disabled={pending} onClick={() => void open(note)}>
                <FileText size={16} aria-hidden /> {note.title}
              </button>
              <p>{note.snippet}</p>
              <div className="row">
                <span>{note.folder}</span>
                <time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleDateString("zh-CN", { timeZone: settings.data?.dateTime.zone })}</time>
              </div>
            </article>
          ))}
        </div>
      )}
      <button type="button" className="hu-card-footer-link" onClick={() => onNavigate("notes")}>
        全部笔记 <ArrowRight size={14} aria-hidden />
      </button>
    </div>
  );
}
