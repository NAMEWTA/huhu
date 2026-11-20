import { ySyncPluginKey } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { OBSERVER_SYNC_ORIGIN } from '../../../server-bridge/observer-origin';

const historyByDocument = new WeakMap<Y.Doc, Y.UndoManager>();

export function documentHistory(doc: Y.Doc): Y.UndoManager {
  const existing = historyByDocument.get(doc);
  // The collaboration plugin destroys its manager when an uncached rich view
  // is destroyed. A later mount on the same pooled document needs a live one.
  if (existing?.trackedOrigins.has(existing)) return existing;
  const source = doc.getText('source');
  const rich = doc.getXmlFragment('default');
  let projectingUserEdit = false;
  let priorGroup: number | undefined;
  const history = new Y.UndoManager([source, rich], {
    trackedOrigins: new Set([ySyncPluginKey, OBSERVER_SYNC_ORIGIN]),
    captureTransaction(transaction) {
      const changedTypes: ReadonlyMap<unknown, unknown> = transaction.changedParentTypes;
      if (!changedTypes.has(source) && !changedTypes.has(rich)) {
        return false;
      }
      if (transaction.origin === OBSERVER_SYNC_ORIGIN) {
        if (!projectingUserEdit || history.undoStack.length === 0) return false;
        projectingUserEdit = false;
        // Projected characters keep their Yjs identity on both sides of a mode flip.
        // Attach the projection to its edit even when bridge settlement was deferred.
        priorGroup = history.lastChange;
        history.lastChange = Date.now();
        return true;
      }
      const capturable = transaction.meta.get('addToHistory') !== false;
      projectingUserEdit = capturable && transaction.origin !== history &&
        history.trackedOrigins.has(transaction.origin);
      return capturable;
    },
    // Preserve the default y-tiptap protection for nonempty text and paragraphs.
    deleteFilter: (item) =>
      !(item.content instanceof Y.ContentType) ||
      !(item.content.type instanceof Y.Text ||
        (item.content.type instanceof Y.XmlElement && item.content.type.nodeName === 'paragraph')) ||
      item.content.type._length === 0,
  });
  history.on('stack-item-updated', ({ origin }) => {
    if (origin === OBSERVER_SYNC_ORIGIN && priorGroup !== undefined) {
      history.lastChange = priorGroup;
      priorGroup = undefined;
    }
  });
  historyByDocument.set(doc, history);
  return history;
}
