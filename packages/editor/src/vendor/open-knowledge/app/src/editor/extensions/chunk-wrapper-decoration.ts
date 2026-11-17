/**
 * None supports "wrap N consecutive sibling nodes in a shared parent without touching schema."
 * Slate-based editors like Plate use a structural-node chunking model; PM forbids that without a
 * schema change (precedent #9 add-only).
 */

import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { mark } from '@/lib/perf';

export const chunkWrapperDecorationKey = new PluginKey('chunkWrapperDecoration');

export const OK_CHUNK_WRAPPER_CLASS = 'ok-chunk-wrapper';
/** HUHU P-S3-03：不参与 content-visibility 的顶层块（jsxComponent）。其余顶层块由 CSS 子选择器统一匹配，不再逐块装饰。 */
export const OK_CHUNK_SKIP_CLASS = 'ok-chunk-skip';

const CHUNK_SKIP_ATTRS = { class: OK_CHUNK_SKIP_CLASS };
const SELECTION_BLOCK_ATTRS = { 'data-ok-selection-block': '' };

let firstEmitFired = false;

export function __resetFirstEmitForTesting(): void {
  firstEmitFired = false;
}

function supportsContentVisibilityAuto(): boolean {
  if (typeof globalThis.CSS === 'undefined' || typeof globalThis.CSS.supports !== 'function') {
    return true;
  }
  return globalThis.CSS.supports('content-visibility', 'auto');
}

const cvAutoSupported = supportsContentVisibilityAuto();

export function chunkWrapperDecorationPlugin(): Plugin {
  if (!cvAutoSupported) {
    return new Plugin({ key: chunkWrapperDecorationKey });
  }
  return new Plugin({
    key: chunkWrapperDecorationKey,
    props: {
      // HUHU P-S3-03：上游给每个顶层块都建一个 Decoration.node（5000 段 = 5000 个装饰，每次按键重建树并逐子节点 forChild，
      // 约 90 ms/键）。content-visibility 的类改由 CSS `.ProseMirror > :where(…)` 统一匹配；这里只给例外块和选区所在块加装饰。
      decorations(state) {
        const selectionStartIndex = state.selection.$from.index(0);
        const selectionEndIndex = state.selection.$to.index(0);
        const decos: Decoration[] = [];
        state.doc.forEach((node, pos, index) => {
          if (node.isInline) return;
          if (node.type.name === 'jsxComponent') {
            decos.push(Decoration.node(pos, pos + node.nodeSize, CHUNK_SKIP_ATTRS));
            return;
          }
          if (index === selectionStartIndex || index === selectionEndIndex) {
            decos.push(Decoration.node(pos, pos + node.nodeSize, SELECTION_BLOCK_ATTRS));
          }
        });
        if (!firstEmitFired) {
          firstEmitFired = true;
          mark(
            'ok/render/cv-auto-skip',
            { chunkCount: state.doc.childCount },
            { startTime: performance.now(), duration: 0 },
          );
        }
        return decos.length === 0 ? null : DecorationSet.create(state.doc, decos);
      },
    },
  });
}
