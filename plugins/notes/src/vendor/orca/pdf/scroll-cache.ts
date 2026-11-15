// 摘取自 ORCA（MIT，commit 7041ea02）：lib/scroll-cache.ts（只保留 PDF 位置缓存与 LRU）。改动见 PATCHES.md。

const CACHE_MAX_ENTRIES = 20

/** Bound module-scoped maps with insertion-order LRU, evicting one oldest entry after each set. */
export function setWithLRU<K, V>(map: Map<K, V>, key: K, value: V, maxEntries: number = CACHE_MAX_ENTRIES): void {
  map.delete(key)
  map.set(key, value)
  if (map.size > maxEntries) {
    // Use iterator.done: undefined can be a valid generic Map key and must still be evicted.
    const first = map.keys().next()
    if (!first.done) {
      map.delete(first.value)
    }
  }
}

// Store pdf.js user-space locations; pixel offsets drift when pane width/zoom rebuilds page layout.
export type PdfViewPosition = { pageNumber: number; top: number; left: number }
export const pdfViewPositionCache = new Map<string, PdfViewPosition>()
