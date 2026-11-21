import { Banner, Button, Dialog } from "@huhu/ui";
import { CapabilityError, host, useEngine, useEngineEvents } from "@huhu/workbench";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { ReplySeed } from "../engine/prepare-reply.js";
import type { ForwardSeed, NewTopicSeed } from "../engine/prepare-forward.js";
import { MailAiAssistant } from "./MailAiAssistant.js";
import { prepareMailHtml } from "./mail-html.js";

export type MessageSummary = { accountId: string; folder: string; localMessageId: string; subject: string; transport?: "imap" | "gmail"; readState?: "unread" | "local" | "synced" | undefined };
export type RelatedDraft = { kind: "reply"; seed: ReplySeed; suggestion?: string } | { kind: "forward"; seed: ForwardSeed } | { kind: "new-topic"; seed: NewTopicSeed };
const composeActions = [
  { id: "reply", title: "引用回复" },
  { id: "reply-all", title: "回复全部" },
  { id: "forward", title: "转发" },
  { id: "new-topic", title: "新话题" },
] as const;
type ComposeAction = (typeof composeActions)[number]["id"];
type Body = { text: string | null; untrustedHtml: string | null; attachments: { name: string; mediaType: string }[] };
type BodyReply = { state: "ready"; body: Body; sourceDigest: string } | { state: "needs-refresh" };
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

export function MailReader({
  message,
  view,
  readOnly,
  onRead,
  onRefresh,
  onCompose,
  onRevoked,
}: {
  message: MessageSummary;
  view: "conversation" | "mailbox";
  readOnly: boolean;
  onRead(): Promise<{ isError: boolean }>;
  onRefresh(): Promise<void>;
  onCompose(draft: RelatedDraft, quote: string, trigger: HTMLElement | null): void;
  onRevoked?(): void;
}) {
  const engine = useEngine();
  const { accountId, folder, localMessageId } = message;
  const identity = useMemo(() => ({ accountId, folder, localMessageId }), [accountId, folder, localMessageId]);
  const [attempt, setAttempt] = useState(0);
  const [body, setBody] = useState<(Body & { sourceDigest: string }) | null>(null);
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
  const [composeMenu, setComposeMenu] = useState(false);
  const [preparing, setPreparing] = useState<ComposeAction | null>(null);
  const [composeError, setComposeError] = useState("");
  const composeRequest = useRef<AbortController | null>(null);
  const composeButtons = useRef<HTMLDivElement>(null);
  const marked = useRef(false);
  const activeWrite = useRef<AbortController | null>(null);
  const readingArea = useRef<HTMLDivElement>(null);
  const bodyContent = useRef<HTMLDivElement>(null);
  const sourceRequest = useRef<AbortController | null>(null);
  const revoke = useRef(onRevoked);
  revoke.current = onRevoked;
  const contentId = useId();

  useEngineEvents((event) => {
    if (event.type === "entity.changed" && "kind" in event.payload && "id" in event.payload && event.payload.id === accountId && (event.payload.kind === "mail-message" || event.payload.kind === "mail-mailbox"))
      setAttempt((value) => value + 1);
  });

  useEffect(() => {
    const controller = new AbortController();
    const capability = view === "conversation" ? "mail.conversations.loadBody" : "mail.messages.loadBody";
    void engine.call<BodyReply>(capability, identity, { signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (result.state === "ready") {
          setBody({ ...result.body, sourceDigest: result.sourceDigest });
          setStale(false);
        } else {
          setBody(null);
          setStale(true);
          setSource(null);
          revoke.current?.();
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setBodyError(error instanceof CapabilityError ? error.message : "无法读取邮件正文。");
      },
    );
    return () => controller.abort();
  }, [engine, identity, attempt, view]);

  useEffect(
    () => () => {
      activeWrite.current?.abort();
      sourceRequest.current?.abort();
      composeRequest.current?.abort();
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
    if (view !== "mailbox") return;
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
  const canCompose = !!body && !changed && !readOnly;

  async function startCompose(action: ComposeAction, trigger: HTMLElement | null, suggestion?: string) {
    if (!canCompose || composeRequest.current) return;
    setComposeMenu(false);
    setComposeError("");
    const controller = new AbortController();
    composeRequest.current = controller;
    setPreparing(action);
    const { signal } = controller;
    try {
      let draft: RelatedDraft;
      if (action === "forward") {
        const seed = await engine.call<ForwardSeed>("mail.messages.prepareForward", identity, { signal });
        if (signal.aborted) return;
        if (seed.forward.sourceDigest !== body?.sourceDigest) {
          setComposeError("原邮件刚更新，请核对正文后再转发。");
          setAttempt((value) => value + 1);
          return;
        }
        draft = { kind: action, seed };
      } else if (action === "new-topic") draft = { kind: action, seed: await engine.call<NewTopicSeed>("mail.messages.prepareNewTopic", identity, { signal }) };
      else draft = { kind: "reply", seed: await engine.call<ReplySeed>("mail.messages.prepareReply", { ...identity, mode: action }, { signal }), ...(suggestion && { suggestion }) };
      if (!signal.aborted) onCompose(draft, currentText, trigger);
    } catch (err) {
      if (!signal.aborted) setComposeError(err instanceof CapabilityError ? err.message : "无法从当前邮件准备草稿，请重试。");
    } finally {
      if (composeRequest.current === controller) composeRequest.current = null;
      if (!signal.aborted) setPreparing(null);
    }
  }
  let status = readLabels[state ?? "unknown"];
  if (changed) status = readLabels["needs-refresh"];
  else if (marking) status = message.transport === "gmail" ? "正在记录本机已读状态…" : "正在同步已读状态…";
  else if (state === "local" && message.transport === "gmail") status = "仅在本机标为已读";
  else if (readOnly && state !== "local" && state !== "synced") status = "只读 · 不更新已读状态";

  return (
    <section
      className="hu-mail-reader"
      aria-label="邮件阅读"
      onContextMenu={(event) => {
        if (!canCompose || preparing || (event.target instanceof Element && event.target.closest("a,button,input,dialog"))) return;
        event.preventDefault();
        setComposeMenu(true);
      }}
    >
      <div className="hu-mail-row">
        <p role="status">{status}</p>
        {!readOnly && !changed && state !== "synced" && ((state === "local" && message.transport !== "gmail") || markError) && (
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
        {view === "mailbox" && (
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
        )}
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
      {composeError && <Banner tone="danger">{composeError}</Banner>}
      {canCompose && (
        <div className="hu-mail-row" ref={composeButtons}>
          {composeActions.map(({ id, title }) => (
            <Button key={id} type="button" data-mail-compose-action={id} loading={preparing === id} disabled={preparing !== null} onClick={(event) => void startCompose(id, event.currentTarget)}>
              {title}
            </Button>
          ))}
          {body && currentText.trim() && <MailAiAssistant key={`${engine.endpoint.baseUrl}:${body.sourceDigest}`} body={currentText} onAdopt={(text, trigger) => void startCompose("reply", trigger, text)} />}
        </div>
      )}
      {composeMenu && canCompose && (
        <Dialog
          open
          title="邮件操作"
          onClose={() => {
            setComposeMenu(false);
            requestAnimationFrame(() => composeButtons.current?.querySelector("button")?.focus());
          }}
        >
          <div className="hu-mail-row">
            {composeActions.map(({ id, title }) => (
              <Button key={id} type="button" onClick={() => void startCompose(id, composeButtons.current?.querySelector<HTMLElement>(`[data-mail-compose-action="${id}"]`) ?? null)}>
                {title}
              </Button>
            ))}
          </div>
        </Dialog>
      )}
    </section>
  );
}
