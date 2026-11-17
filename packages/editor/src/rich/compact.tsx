// 紧凑变体（S2c）：任务描述 / 评论 / 收件箱等“小块 Markdown”的输入与阅读，用同一个 OK 编辑器（RichMarkdownEditor variant=compact）。
// 每个实例 = 一个 LocalDocProvider + 一个 TiptapEditor（成本见 evidence/s2/compact-cost.md）；阅读实例不写盘、不触发任何保存。
import { useMemo, useRef } from "react";
import { OkRoot } from "./OkRoot";
import { RichMarkdownEditor } from "./RichMarkdownEditor";
import type { ReferenceCandidate } from "./at-reference";
import { coreRoutes } from "../host/routes/core";
import type { HostRoutes } from "../host/host-fetch";

export interface CompactPage {
  /** Vault 相对路径（含扩展名） */
  path: string;
  title?: string;
}

interface CompactBase {
  /** 实例内唯一名（同一页面上不得重复）；也是 editor-cache 的键 */
  id: string;
  /** `[[…]]` 候选与链接解析用的文件清单 */
  pages?: readonly CompactPage[];
  /** 点击 wiki-link / 内部链接：交给宿主（参数是 Vault 相对路径，文件夹以 / 结尾） */
  onOpenPath?(path: string): void;
  className?: string;
}

const MD = /\.(md|mdx)$/i;
const docNameOf = (path: string): string => path.replace(MD, "");

function useCompactHost(pages: readonly CompactPage[] | undefined, onOpenPath: ((p: string) => void) | undefined) {
  const pagesRef = useRef(pages ?? []);
  pagesRef.current = pages ?? [];
  const openRef = useRef(onOpenPath);
  openRef.current = onOpenPath;
  const routes = useMemo<HostRoutes>(
    () =>
      coreRoutes({
        listPages: () =>
          pagesRef.current
            .filter((p) => MD.test(p.path))
            .map((p) => ({ docName: docNameOf(p.path), title: p.title ?? docNameOf(p.path).split("/").at(-1) ?? p.path, size: 0, modified: new Date(0).toISOString(), docExt: (/\.(\w+)$/.exec(p.path)?.[1] ?? "md").toLowerCase() })),
        listDocuments: () => pagesRef.current.map((p) => ({ kind: MD.test(p.path) ? ("document" as const) : ("file" as const), path: p.path, docName: docNameOf(p.path) })),
      }),
    [],
  );
  const documentHost = useMemo(
    () => ({
      openDocument: (docName: string) => {
        const have = new Set(pagesRef.current.map((p) => p.path));
        const direct = MD.test(docName) ? docName : `${docName}.md`;
        const folderNote = `${docName.replace(/\/$/, "")}/index.md`;
        openRef.current?.(have.has(direct) ? direct : have.has(folderNote) ? folderNote : direct);
      },
      openTarget: (t: { kind: string; docName?: string; folderPath?: string; assetPath?: string }) => {
        if ((t.kind === "doc" || t.kind === "folder-index") && t.docName) openRef.current?.(`${t.docName}.md`);
        else if (t.kind === "folder" && t.folderPath) openRef.current?.(`${t.folderPath}/`);
        else if (t.kind === "asset" && t.assetPath) openRef.current?.(t.assetPath);
      },
    }),
    [],
  );
  return { routes, documentHost };
}

export function CompactMarkdownView(props: CompactBase & { value: string }) {
  const { routes, documentHost } = useCompactHost(props.pages, props.onOpenPath);
  return (
    <OkRoot locale="zh-Hans" routes={routes} documentHost={documentHost} {...(props.className ? { className: props.className } : {})}>
      <RichMarkdownEditor docName={`compact-view/${props.id}`} value={props.value} onChange={() => {}} mode="read" readOnly variant="compact" />
    </OkRoot>
  );
}

export function CompactMarkdownInput(props: CompactBase & { value: string; onChange(text: string): void; placeholder?: string; referenceSearch?: (query: string) => readonly ReferenceCandidate[] }) {
  const { routes, documentHost } = useCompactHost(props.pages, props.onOpenPath);
  return (
    <OkRoot locale="zh-Hans" routes={routes} documentHost={documentHost} {...(props.className ? { className: props.className } : {})}>
      <RichMarkdownEditor
        docName={`compact-input/${props.id}`}
        value={props.value}
        onChange={props.onChange}
        variant="compact"
        {...(props.placeholder ? { placeholder: props.placeholder } : {})}
        {...(props.referenceSearch ? { referenceSearch: props.referenceSearch } : {})}
      />
    </OkRoot>
  );
}
