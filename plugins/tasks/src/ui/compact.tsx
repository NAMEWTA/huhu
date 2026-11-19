import type { ReferenceCandidate, RichEditorPort } from "@huhu/editor/rich";
import { Suspense, lazy } from "react";
import type { ReferenceIndex } from "./references.js";

// 紧凑 OK 编辑器（S2c）按需加载：任务模块的首屏不带编辑器闭包
const View = lazy(() => import("@huhu/editor/rich").then((m) => ({ default: m.CompactMarkdownView })));
const Input = lazy(() => import("@huhu/editor/rich").then((m) => ({ default: m.CompactMarkdownInput })));

export function TaskMarkdownView({ id, value, refs, onOpen }: { id: string; value: string; refs: ReferenceIndex; onOpen?(path: string): void }) {
  return (
    <Suspense fallback={null}>
      <View id={id} value={value} pages={refs.pages} {...(onOpen ? { onOpenPath: onOpen } : {})} />
    </Suspense>
  );
}

export function TaskMarkdownInput({ id, value, onChange, onPort, refs, placeholder }: { id: string; value: string; onChange(text: string): void; onPort?(port: RichEditorPort | null): void; refs: ReferenceIndex; placeholder?: string }) {
  return (
    <Suspense fallback={null}>
      <Input id={id} value={value} onChange={onChange} {...(onPort ? { onPort } : {})} pages={refs.pages} referenceSearch={refs.search as (q: string) => readonly ReferenceCandidate[]} {...(placeholder ? { placeholder } : {})} />
    </Suspense>
  );
}
