import { ySyncPluginKey } from '@tiptap/y-tiptap';
import * as Y from 'yjs';

const historyByDocument = new WeakMap<Y.Doc, Y.UndoManager>();

export function documentHistory(doc: Y.Doc): Y.UndoManager {
  const existing = historyByDocument.get(doc);
  // The collaboration plugin destroys its manager when an uncached rich view
  // is destroyed. A later mount on the same pooled document needs a live one.
  if (existing?.trackedOrigins.has(existing)) return existing;
  const history = new Y.UndoManager([doc.getText('source'), doc.getXmlFragment('default')], {
    trackedOrigins: new Set([ySyncPluginKey]),
    captureTransaction: (transaction) => transaction.meta.get('addToHistory') !== false,
    // Preserve the default y-tiptap protection for nonempty text and paragraphs.
    deleteFilter: (item) =>
      !(item.content instanceof Y.ContentType) ||
      !(item.content.type instanceof Y.Text ||
        (item.content.type instanceof Y.XmlElement && item.content.type.nodeName === 'paragraph')) ||
      item.content.type._length === 0,
  });
  historyByDocument.set(doc, history);
  return history;
}
