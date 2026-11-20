import { Suspense, lazy, useLayoutEffect, useRef } from "react";
import type { CompactMarkdownReaderProps } from "./reading";
import { readParagraphs, serializeParagraphSlice } from "./paragraphs";
import "./compact-view.css";

const FullView = lazy(() => import("../rich/index").then((module) => ({ default: module.CompactMarkdownView })));

function ParagraphView({ paragraphs }: { paragraphs: readonly string[] }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const body = root.current;
    if (!body) return;
    const copy = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      const selection = body.ownerDocument.getSelection();
      if (!data || !selection?.rangeCount || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      if (!body.contains(range.commonAncestorContainer)) return;

      const document = body.ownerDocument;
      const fragment = document.createElement("div");
      const lines: string[] = [];
      for (const paragraph of body.children) {
        if (!range.intersectsNode(paragraph)) continue;
        const part = document.createRange();
        part.selectNodeContents(paragraph);
        if (paragraph.contains(range.startContainer)) part.setStart(range.startContainer, range.startOffset);
        if (paragraph.contains(range.endContainer)) part.setEnd(range.endContainer, range.endOffset);
        const line = part.toString();
        lines.push(line);
        if (!line) continue;
        const node = document.createElement("p");
        node.textContent = line.trimEnd() || " ";
        if (fragment.firstChild) fragment.append("\n");
        else node.setAttribute("data-pm-slice", "1 1 []");
        fragment.append(node);
      }
      if (!lines.length) return;
      data.setData("text/plain", serializeParagraphSlice(lines));
      data.setData("text/html", fragment.innerHTML);
      event.preventDefault();
    };
    // The event can target the focused button or body after a native drag selection.
    body.ownerDocument.addEventListener("copy", copy, true);
    body.ownerDocument.addEventListener("cut", copy, true);
    return () => {
      body.ownerDocument.removeEventListener("copy", copy, true);
      body.ownerDocument.removeEventListener("cut", copy, true);
    };
  }, []);

  return (
    <div className="ok-root editor-ok-compact-view">
      <div className="editor-ok-compact-scroll">
        <div className="editor-ok-compact-grid">
          <div className="editor-ok-compact-column">
            <div ref={root} className="editor-ok-compact-paragraphs" data-compact-paragraphs translate="no" contentEditable={false}>
              {paragraphs.map((text, index) => (
                <p key={index}>{text}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Synchronous read-only projection with the original OK reader as the fallback. */
export function CompactMarkdownReader({ fallback, ...props }: CompactMarkdownReaderProps) {
  const paragraphs = readParagraphs(props.value);
  // Key both render paths to the record so selection and suspended work cannot be reused across records.
  if (paragraphs) return <ParagraphView key={props.id} paragraphs={paragraphs} />;
  return <Suspense fallback={null}>{fallback ?? <FullView key={props.id} {...props} className="editor-ok-compact-view" />}</Suspense>;
}
