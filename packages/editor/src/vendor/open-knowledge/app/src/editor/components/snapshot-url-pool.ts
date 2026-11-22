import { LIVE_DOC_POOL_MAX } from './live-doc-pool.ts';

export const MAX_LIVE_SNAPSHOT_URLS = LIVE_DOC_POOL_MAX;

const liveSnapshotUrls = new Map<string, HTMLElement | undefined>();
const parkedRoots = new WeakSet<Element>();
let removalObserver: MutationObserver | null = null;

function parkedRootOf(owner: HTMLElement | undefined): Element | null {
  for (let node: Element | null = owner ?? null; node; node = node.parentElement) {
    if (parkedRoots.has(node)) return node;
  }
  return null;
}

function releaseRemovedSnapshotUrls(
  records: MutationRecord[],
  parkingEnded = false,
): void {
  const removedUrls = new Set<string>();
  let removedElements = false;
  for (const record of records) {
    if (record.type === 'attributes' && record.target instanceof HTMLImageElement) {
      const url = record.oldValue;
      if (url && liveSnapshotUrls.has(url)) removedUrls.add(url);
    }
    for (const node of record.removedNodes) {
      if (!(node instanceof Element)) continue;
      removedElements = true;
      const images = node.matches('img') ? [node] : node.querySelectorAll('img');
      for (const image of images) {
        const url = image.getAttribute('src');
        if (url && liveSnapshotUrls.has(url)) removedUrls.add(url);
      }
    }
  }
  // An embed can disappear while its snapshot is still waiting for its first commit.
  if (parkingEnded || removedElements) {
    for (const [url, owner] of liveSnapshotUrls) {
      if (owner && !owner.isConnected && !parkedRootOf(owner)) removedUrls.add(url);
    }
  }
  for (const url of removedUrls) releaseSnapshotUrl(url);
}

function observeSnapshotRemovals(target: Node): MutationObserver {
  const observer = new MutationObserver((records) => releaseRemovedSnapshotUrls(records));
  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
    attributeOldValue: true,
  });
  return observer;
}

export function observeParkedSnapshotImages(root: HTMLElement): () => void {
  parkedRoots.add(root);
  const observer = observeSnapshotRemovals(root);
  return () => {
    const records = observer.takeRecords();
    observer.disconnect();
    parkedRoots.delete(root);
    // The portal target can be reinserted by a later layout effect in the same commit.
    queueMicrotask(() => releaseRemovedSnapshotUrls(records, true));
  };
}

function isDomBound(url: string, owner: HTMLElement | undefined): boolean {
  if (typeof document === 'undefined') return false;
  for (const img of document.images) {
    if (img.getAttribute('src') === url) return true;
  }
  // Only the inline consumer travels with the embed owner. The lightbox portals to the document.
  const root = parkedRootOf(owner);
  if (root) {
    for (const img of root.querySelectorAll('img')) {
      if (img.getAttribute('src') === url) return true;
    }
  }
  return false;
}

export function retainSnapshotUrl(url: string, owner?: HTMLElement): void {
  if (!removalObserver && typeof document !== 'undefined') {
    removalObserver = observeSnapshotRemovals(document);
  }
  liveSnapshotUrls.set(url, owner);
  for (const [candidate, candidateOwner] of liveSnapshotUrls) {
    if (liveSnapshotUrls.size <= MAX_LIVE_SNAPSHOT_URLS) break;
    // An embed in a live or parked editor may still be waiting for its image to commit.
    if (!candidateOwner?.isConnected && !parkedRootOf(candidateOwner)) releaseSnapshotUrl(candidate);
  }
}

export function releaseSnapshotUrl(url: string): void {
  if (!liveSnapshotUrls.has(url) || isDomBound(url, liveSnapshotUrls.get(url))) return;
  liveSnapshotUrls.delete(url);
  URL.revokeObjectURL(url);
  if (liveSnapshotUrls.size === 0) {
    removalObserver?.disconnect();
    removalObserver = null;
  }
}

export function __liveSnapshotUrlCount(): number {
  return liveSnapshotUrls.size;
}

export function __resetSnapshotUrlPoolForTests(): void {
  removalObserver?.disconnect();
  removalObserver = null;
  for (const url of liveSnapshotUrls.keys()) URL.revokeObjectURL(url);
  liveSnapshotUrls.clear();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    __resetSnapshotUrlPoolForTests();
  });
}
