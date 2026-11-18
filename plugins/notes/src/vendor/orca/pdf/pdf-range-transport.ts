// 摘取自 ORCA（MIT，commit 7041ea02）：pdf-orca-media-range-transport.ts（orca-media IPC 换成注入的 readRange，对应 vault.readRange）。改动见 PATCHES.md。
import { PDFDataRangeTransport } from "pdfjs-dist";

/** Per-call bound of the underlying range read (`vault.readRange` allows up to 4 MiB); pdf.js may merge neighbouring chunks past it. */
export const PDF_RANGE_READ_MAX_BYTES = 4 * 1024 * 1024;

/** Reads up to `length` bytes at `offset`; may return fewer (short read), empty means end of file. */
export type PdfRangeReader = (offset: number, length: number) => Promise<Uint8Array>;

/**
 * pdf.js only fetches ranges over http(s); this reads ranges through an injected reader
 * (here: the engine's `vault.readRange`), so no network, fetch or CORS is involved.
 */
export function createRangeTransport(length: number, read: PdfRangeReader, onFailure: (error: unknown) => void): PDFDataRangeTransport {
  let aborted = false;
  class VaultRangeTransport extends PDFDataRangeTransport {
    override requestDataRange(begin: number, end: number): void {
      void readRange(read, begin, end, () => aborted)
        .then((chunk) => {
          if (!aborted) {
            this.onDataRange(begin, chunk);
          }
        })
        .catch((error: unknown) => {
          // pdf.js has no range-failure callback; without this it would wait forever.
          if (!aborted) {
            onFailure(error);
          }
        });
    }

    override abort(): void {
      aborted = true;
    }
  }
  return new VaultRangeTransport(length, null);
}

export async function readRange(read: PdfRangeReader, begin: number, end: number, isAborted: () => boolean): Promise<Uint8Array> {
  const range = new Uint8Array(end - begin);
  let done = 0;
  while (begin + done < end) {
    // A closed or reloaded viewer schedules no further pieces.
    if (isAborted()) {
      throw new Error("PDF range read cancelled");
    }
    const piece = await read(begin + done, Math.min(PDF_RANGE_READ_MAX_BYTES, end - begin - done));
    if (piece.byteLength === 0) {
      throw new Error("PDF ended before the requested range");
    }
    range.set(piece, done);
    done += piece.byteLength;
  }
  return range;
}
