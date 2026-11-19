import { isHistoryTransaction } from '@tiptap/pm/history';
import type { Transaction } from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';
import { ySyncPluginKey } from '@tiptap/y-tiptap';

// A closed slice containing just unmarked text cannot introduce or move any
// blocks. Remote sync and history still use the plugins' full update paths.
export function topLevelParagraphInsert(tr: Transaction): ReplaceStep | undefined {
  const step = tr.steps[0];
  if (
    tr.steps.length !== 1 ||
    !(step instanceof ReplaceStep) ||
    step.from !== step.to ||
    step.slice.openStart !== 0 ||
    step.slice.openEnd !== 0 ||
    step.slice.content.childCount !== 1 ||
    !step.slice.content.firstChild?.isText ||
    step.slice.content.firstChild.marks.length !== 0 ||
    tr.getMeta(ySyncPluginKey) ||
    isHistoryTransaction(tr)
  ) {
    return;
  }

  const position = tr.before.resolve(step.from);
  if (position.depth === 1 && position.parent.type.name === 'paragraph') {
    return step;
  }
}
