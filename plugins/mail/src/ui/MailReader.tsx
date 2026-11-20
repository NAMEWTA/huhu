import { Banner, Button } from "@huhu/ui";
import { CapabilityError, host, useEngine } from "@huhu/workbench";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { prepareMailHtml } from "./mail-html.js";

export type MessageSummary = { accountId: string; folder: string; localMessageId: string; subject: string; readState?: "unread" | "local" | "synced" };
type Body = { text: string | null; untrustedHtml: string | null; attachments: { name: string; mediaType: string }[] };
type BodyReply = { state: "ready"; body: Body } | { state: "needs-refresh" };
type ReadState = "local" | "synced" | "needs-refresh";
const readLabels = { unknown: "已读状态尚未核实", unread: "未读", local: "本机已读 · 待同步", synced: "已读 · 服务器已确认", "needs-refresh": "邮件定位已变化" };

function PlainBody({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const quoted = lines.findIndex((line, index) => index > 0 && /^\s*(?:>|--\s*$)/.test(line));
  if (quoted === -1) return <div className="hu-mail-plain">{text}</div>;
  return (
    <>
      <div className="hu-mail-plain">{lines.slice(0, quoted).join("\n").trimEnd()}</div>
      <details>
        <summary>展开引用与签名</summary>
        <div className="hu-mail-plain">{lines.slice(quoted).join("\n")}</div>
      </details>
    </>
  );
}

export function MailReader({ message, readOnly, onRead, onRefresh }: { message: MessageSummary; readOnly: boolean; onRead(): Promise<{ isError: boolean }>; onRefresh(): Promise<void> }) {
  const engine = useEngine();
  const { accountId, folder, localMessageId } = message;
  const identity = useMemo(() => ({ accountId, folder, localMessageId }), [accountId, folder, localMessageId]);
  const [attempt, setAttempt] = useState(0);
  const [body, setBody] = useState<Body | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [plain, setPlain] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [readResult, setReadResult] = useState<ReadState | null>(null);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState(false);
  const [linkFeedback, setLinkFeedback] = useState("");
  const marked = useRef(false);
  const activeWrite = useRef<AbortController | null>(null);
  const readingArea = useRef<HTMLDivElement>(null);
  const bodyContent = useRef<HTMLDivElement>(null);
  const sourceRequest = useRef<AbortController | null>(null);
  const contentId = useId();

  useEffect(() => {
    const controller = new AbortController();
    void engine.call<BodyReply>("mail.messages.loadBody", identity, { signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (result.state === "ready") setBody(result.body);
        else setStale(true);
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setBodyError(error instanceof CapabilityError ? error.message : "无法读取邮件正文。");
      },
    );
    return () => controller.abort();
  }, [engine, identity, attempt]);

  useEffect(
    () => () => {
      activeWrite.current?.abort();
      sourceRequest.current?.abort();
    },
    [engine, identity],
  );

  const markRead = useCallback(async () => {
    if (readOnly || activeWrite.current) return;
    const controller = new AbortController();
    activeWrite.current = controller;
    setMarking(true);
    setMarkError(false);
    try {
      const response = await engine.call<{ state: ReadState }>("mail.messages.markRead", identity, { write: true, signal: controller.signal });
      if (!controller.signal.aborted) {
        setReadResult(response.state);
        const latest = await onRead();
        if (!controller.signal.aborted && !latest.isError && response.state !== "needs-refresh") setReadResult(null);
      }
    } catch {
      if (!controller.signal.aborted) {
        setMarkError(true);
        await onRead();
      }
    } finally {
      if (activeWrite.current === controller) activeWrite.current = null;
      if (!controller.signal.aborted) setMarking(false);
    }
  }, [engine, identity, onRead, readOnly]);

  useEffect(() => {
    const element = readingArea.current;
    if (!body || !element || readOnly || marked.current || message.readState === "synced" || message.readState === "local") return;
    let visible = false;
    const tryMark = () => {
      if (!visible || document.visibilityState !== "visible" || marked.current) return;
      marked.current = true;
      observer.disconnect();
      void markRead();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
      tryMark();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", tryMark);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", tryMark);
    };
  }, [body, markRead, message.readState, readOnly]);

  useEffect(() => {
    if (!bodyContent.current) return;
    const element = bodyContent.current;
    const measure = () => setOverflowing(element.getBoundingClientRect().height > 280);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [body]);

  async function viewSource() {
    setShowSource(true);
    if (source !== null || sourceRequest.current) return;
    const controller = new AbortController();
    sourceRequest.current = controller;
    setSourceError(false);
    setLoadingSource(true);
    try {
      const response = await engine.call<{ state: "ready"; source: string } | { state: "needs-refresh" }>("mail.messages.loadSource", identity, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (response.state === "needs-refresh") setStale(true);
      else setSource(new TextDecoder().decode(Uint8Array.from(atob(response.source), (character) => character.charCodeAt(0))));
    } catch {
      if (!controller.signal.aborted) setSourceError(true);
    } finally {
      if (sourceRequest.current === controller) sourceRequest.current = null;
      if (!controller.signal.aborted) setLoadingSource(false);
    }
  }

  const link = useCallback((href: string, children: ReactNode) => {
    const desktop = host();
    if (!desktop)
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    return (
      <button
        type="button"
        className="hu-mail-copy-link"
        title={href}
        onClick={() =>
          void desktop.copyText(href).then(
            () => setLinkFeedback("已复制链接。"),
            () => setLinkFeedback(href),
          )
        }
      >
        {children}
      </button>
    );
  }, []);
  const prepared = useMemo(() => (body?.untrustedHtml ? prepareMailHtml(body.untrustedHtml, link) : null), [body?.untrustedHtml, link]);
  const state = readResult ?? message.readState;
  const changed = stale || state === "needs-refresh";
  const currentText = body?.text ?? prepared?.text ?? "";
  let status = readLabels[state ?? "unknown"];
  if (changed) status = readLabels["needs-refresh"];
  else if (marking) status = "正在同步已读状态…";
  else if (readOnly && state !== "local" && state !== "synced") status = "只读 · 不更新已读状态";

  return (
    <section className="hu-mail-reader" aria-label="邮件阅读">
      <div className="hu-mail-row">
        <p role="status">{status}</p>
        {!readOnly && !changed && state !== "synced" && (state === "local" || markError) && (
          <Button loading={marking} onClick={() => void markRead()}>
            重试同步已读
          </Button>
        )}
      </div>
      {markError && state !== "synced" && <Banner tone="danger">无法确认已读同步结果，请重试。</Banner>}
      {changed && (
        <Banner
          action={
            <Button disabled={readOnly} onClick={() => void onRefresh()}>
              重新同步目录
            </Button>
          }
        >
          该邮件已不在当前缓存代，请重新同步目录。
        </Banner>
      )}
      {bodyError && (
        <Banner
          tone="danger"
          action={
            <Button
              onClick={() => {
                setBodyError(null);
                setAttempt((value) => value + 1);
              }}
            >
              重试加载正文
            </Button>
          }
        >
          {bodyError}
        </Banner>
      )}
      {!body && !bodyError && !changed && <p>正在读取邮件正文…</p>}
      <div className="hu-mail-row">
        <Button
          aria-pressed={showSource}
          loading={loadingSource}
          onClick={() => {
            if (showSource) setShowSource(false);
            else void viewSource();
          }}
        >
          {showSource ? "收起原文" : "查看原文"}
        </Button>
        {prepared && (
          <Button aria-pressed={plain} onClick={() => setPlain(!plain)}>
            {plain ? "HTML 显示" : "纯文本显示"}
          </Button>
        )}
      </div>
      {showSource && sourceError && (
        <Banner tone="danger" action={<Button onClick={() => void viewSource()}>重试读取原文</Button>}>
          无法读取邮件原文。
        </Banner>
      )}
      {showSource && source !== null && <pre className="hu-mail-source">{source}</pre>}
      {body && (
        <div>
          {prepared?.blockedImages && !plain && <p className="hu-mail-help">邮件中的外部图片已屏蔽。</p>}
          <div id={contentId} ref={readingArea} className="hu-mail-body-viewport" data-expanded={expanded}>
            <div ref={bodyContent} className="hu-mail-body-content" aria-label="正文" role="region">
              {prepared && !plain ? prepared.content : currentText ? <PlainBody text={currentText} /> : <p>没有可显示的正文。</p>}
            </div>
          </div>
          {overflowing && (
            <Button variant="ghost" aria-controls={contentId} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {expanded ? "收起正文" : "展开全文"}
            </Button>
          )}
          {linkFeedback && <p role="status">{linkFeedback}</p>}
          {!!body.attachments.length && (
            <ul aria-label="邮件附件">
              {body.attachments.map(({ name, mediaType }, index) => (
                <li key={index}>
                  {name} · {mediaType} · 仅有元数据
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
