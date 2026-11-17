// 摘取自 ORCA（MIT，commit 7041ea02）：pdf-js-document-options.ts。改动见 PATCHES.md。
import type { PDFDataRangeTransport } from 'pdfjs-dist'

/** One readChunk-sized range per request instead of pdf.js's 64 KiB default. */
export const PDF_RANGE_CHUNK_SIZE = 256 * 1024

export function buildPdfJsDocumentOptions(
  source: { data: Uint8Array } | { range: PDFDataRangeTransport },
  baseUrl: string
) {
  return {
    ...source,
    ...('range' in source ? { rangeChunkSize: PDF_RANGE_CHUNK_SIZE } : {}),
    cMapUrl: new URL('cmaps/', baseUrl).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', baseUrl).href,
    wasmUrl: new URL('wasm/', baseUrl).href
  }
}
