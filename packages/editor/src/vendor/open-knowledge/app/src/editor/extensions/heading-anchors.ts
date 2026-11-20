import { Extension } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { topLevelParagraphInsert } from './top-level-paragraph-insert';
import { getHeadingSlug } from './wiki-link-helpers';

function buildHeadingDecorations(doc: PmNode): DecorationSet {
  const decos: Decoration[] = [];
  const slugCounts = new Map<string, number>();

  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const id = getHeadingSlug(node.textContent, slugCounts);
      if (!id) return;

      decos.push(Decoration.node(pos, pos + node.nodeSize, { id }));
    }
  });

  return DecorationSet.create(doc, decos);
}

export const HeadingAnchors = Extension.create({
  name: 'headingAnchors',

  addProseMirrorPlugins() {
    const plugin: Plugin<DecorationSet> = new Plugin({
      state: {
        init: (_config, state) => buildHeadingDecorations(state.doc),
        apply(tr, previous) {
          if (!tr.docChanged) return previous;
          if (topLevelParagraphInsert(tr)) return previous.map(tr.mapping, tr.doc);
          return buildHeadingDecorations(tr.doc);
        },
      },
      props: {
        decorations: (state) => plugin.getState(state),
      },
    });
    return [plugin];
  },
});
