import { Button, Dialog } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useEffect, useId, useRef, useState } from "react";
import type { MailLocationTarget, MailSearchPage } from "../engine/conversations.js";
import type { MailAccount } from "./mail-types.js";

const searchLimit = 8;
const emptyQuery = { text: "", offset: 0 };
const missingMessage = "此邮件已不在本地可见缓存中，请重新搜索。";

function highlight(value: string, query: string) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const chunks = value.split(new RegExp(`(${escaped})`, "gi"));
  return chunks.map((chunk, index) => (index % 2 ? <mark key={index}>{chunk}</mark> : chunk));
}

export function MailSearch({
  open,
  zone,
  accounts,
  sourceRevision,
  onClose,
  onLocate,
}: {
  open: boolean;
  zone: string;
  accounts: MailAccount[];
  sourceRevision: string;
  onClose(located: boolean): void;
  onLocate(target: MailLocationTarget, signal: AbortSignal): Promise<boolean>;
}) {
  const engine = useEngine();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const locate = useRef<AbortController | null>(null);
  const [query, setQuery] = useState(emptyQuery);
  const [selection, setSelection] = useState(0);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [response, setResponse] = useState<{ query: typeof emptyQuery; sourceRevision: string; page: MailSearchPage | null }>();
  const current = response?.query === query && response.sourceRevision === sourceRevision ? response : undefined;
  const { text, offset } = query;
  const match = text.trim().replace(/\s+/g, " ");
  const page = current?.page;
  const hits = page?.hits ?? [];
  const waiting = !!match && !current;

  useEffect(() => {
    if (!open || !match) return;
    const request = new AbortController();
    const timer = setTimeout(
      () => {
        engine
          .call<MailSearchPage>("mail.conversations.search", { text: match, offset, limit: searchLimit }, { signal: request.signal })
          .then((page) => {
            if (!request.signal.aborted) setResponse({ query, sourceRevision, page });
          })
          .catch(() => {
            if (!request.signal.aborted) setResponse({ query, sourceRevision, page: null });
          });
      },
      offset ? 0 : 250,
    );
    return () => {
      clearTimeout(timer);
      request.abort();
    };
  }, [engine, match, offset, open, query, sourceRevision]);
  useEffect(() => {
    locate.current?.abort();
    locate.current = null;
    setLocationError("");
    setLoadingTarget(false);
    setSelection(0);
    setQuery((previous) => (previous.offset ? { ...previous, offset: 0 } : previous));
  }, [sourceRevision]);
  useEffect(() => () => locate.current?.abort(), [engine]);

  function close(located = false) {
    locate.current?.abort();
    locate.current = null;
    setLoadingTarget(false);
    setLocationError("");
    setSelection(0);
    setResponse(undefined);
    setQuery(emptyQuery);
    onClose(located);
  }

  async function choose(target: MailLocationTarget) {
    if (locate.current) return;
    const request = new AbortController();
    locate.current = request;
    setLoadingTarget(true);
    setLocationError("");
    try {
      if (await onLocate(target, request.signal)) {
        if (!request.signal.aborted) close(true);
      } else if (!request.signal.aborted) setLocationError(missingMessage);
    } catch {
      if (!request.signal.aborted) setLocationError("无法定位原邮件，请重试。");
    } finally {
      if (locate.current === request) {
        locate.current = null;
        setLoadingTarget(false);
      }
    }
  }

  function newPage(offset: number) {
    setSelection(0);
    setLocationError("");
    setQuery({ text, offset });
    input.current?.focus();
  }

  return (
    <Dialog open={open} title="搜索已缓存邮件" description="跨所有邮箱搜索当前 Vault 已同步的本地邮件。" onClose={() => close()} error={locationError} wide>
      <div className="hu-mail-search">
        <label htmlFor={id}>主题、联系人或正文</label>
        <input
          id={id}
          ref={input}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          role="combobox"
          aria-controls={`${id}-results`}
          aria-autocomplete="list"
          aria-expanded={hits.length > 0}
          aria-activedescendant={hits[selection] && `${id}-hit-${selection}`}
          readOnly={loadingTarget}
          maxLength={200}
          value={text}
          onChange={(event) => {
            setQuery({ text: event.target.value, offset: 0 });
            setSelection(0);
            setLocationError("");
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !hits.length || loadingTarget) return;
            if (event.key === "Enter") {
              event.preventDefault();
              if (hits[selection]) void choose(hits[selection].target);
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const next = (selection + (event.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length;
              setSelection(next);
              document.getElementById(`${id}-hit-${next}`)?.scrollIntoView({ block: "nearest" });
            }
          }}
        />
        <p className="hu-mail-help" role="status">
          {loadingTarget
            ? "正在定位原邮件…"
            : waiting
              ? "正在搜索…"
              : current && !page
                ? "无法搜索本地邮件。"
                : page
                  ? page.cachedMessages === 0
                    ? "还没有可搜索的邮件缓存。"
                    : page.total === 0
                      ? "本地缓存中没有匹配邮件。"
                      : `找到 ${page.total} 封邮件`
                  : "搜索范围取决于各邮箱已同步的历史。"}
        </p>
        <ul id={`${id}-results`} role="listbox" aria-label="邮件搜索结果" className="hu-mail-search-results" hidden={!hits.length}>
          {hits.map((hit, index) => {
            const owner = accounts.find(({ accountId }) => accountId === hit.target.accountId);
            const identity = hit.target.source === "sent" ? hit.target.operationId : hit.target.localMessageId;
            return (
              <li id={`${id}-hit-${index}`} key={identity} role="option" aria-selected={index === selection} onClick={() => void choose(hit.target)}>
                <strong>{highlight(hit.subject || "无主题", match)}</strong>
                <span>
                  {owner?.definition.settings.label || owner?.definition.settings.email || hit.target.accountId}
                  {hit.date ? ` · ${new Date(hit.date).toLocaleDateString(undefined, { timeZone: zone })}` : ""}
                </span>
                {hit.participants.length > 0 && <span>{highlight(hit.participants.join("、"), match)}</span>}
                {hit.senderNames.length > 0 && <span>{highlight(hit.senderNames.join("、"), match)}</span>}
                {hit.excerpt && <span>{highlight(hit.excerpt, match)}</span>}
              </li>
            );
          })}
        </ul>
        {page && (offset > 0 || page.nextOffset !== null) && (
          <nav className="hu-mail-row" aria-label="邮件搜索分页">
            <Button disabled={offset === 0 || loadingTarget} onClick={() => newPage(Math.max(0, offset - searchLimit))}>
              上一页
            </Button>
            <Button
              disabled={page.nextOffset === null || loadingTarget}
              onClick={() => {
                if (page.nextOffset !== null) newPage(page.nextOffset);
              }}
            >
              下一页
            </Button>
          </nav>
        )}
        {current && !page && <Button onClick={() => newPage(offset)}>重试搜索</Button>}
      </div>
    </Dialog>
  );
}
