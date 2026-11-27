import { createHash } from "node:crypto";
import { lstatSync, readdirSync, unlinkSync } from "node:fs";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";

type Files = HuhuApi["vault"]["files"];
type Kind = "received" | "search" | "sent" | "sent-search";
const directory = ".huhu/cache/mail-projections";

function projectionPath(source: string, kind: Kind): string {
  return `${directory}/${createHash("sha256").update(source).digest("hex")}.${kind}.json`;
}

/** A projection is valid only for the exact local publication of its source. */
export function mailSourceStamp(files: Files, source: string): string | undefined {
  try {
    const stat = lstatSync(files.abs(source), { bigint: true, throwIfNoEntry: false });
    if (stat?.isFile()) return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
  } catch {
    // Protected or missing sources cannot have a usable projection.
  }
}

export function readMailProjection<T>(files: Files, source: string, kind: Kind, schema: z.ZodType<T>): { stamp: string; value: T } | undefined {
  try {
    const file = files.read(projectionPath(source, kind));
    if (!file) return undefined;
    const parsed = z.strictObject({ format: z.literal(1), stamp: z.string(), value: schema }).parse(JSON.parse(file.bytes.toString("utf8")));
    return { stamp: parsed.stamp, value: parsed.value };
  } catch {
    return undefined;
  }
}

export async function saveMailProjection<T>(files: Files, source: string, kind: Kind, stamp: string, value: T, signal?: AbortSignal): Promise<void> {
  try {
    await files.write(projectionPath(source, kind), Buffer.from(JSON.stringify({ format: 1, stamp, value }) + "\n"), {
      beforeCommit: () => {
        signal?.throwIfAborted();
        if (mailSourceStamp(files, source) !== stamp) throw new Error("Mail projection source changed");
      },
    });
  } catch {
    // Cache loss, read-only Vaults, and a racing source update can rebuild later.
  }
}

export function removeMailProjections(files: Files, source: string, kinds: readonly Kind[]): void {
  for (const kind of kinds) {
    try {
      unlinkSync(files.abs(projectionPath(source, kind)));
    } catch {
      // A remaining projection cannot match a removed or replaced source.
    }
  }
}

export function clearMailSearchProjections(files: Files): void {
  try {
    for (const name of readdirSync(files.abs(directory))) {
      if (!/^[0-9a-f]{64}\.(?:sent-)?search\.json$/.test(name)) continue;
      try {
        unlinkSync(files.abs(`${directory}/${name}`));
      } catch {
        // An individual cache file may already have been cleared.
      }
    }
  } catch {
    // The derived directory may not exist.
  }
}
