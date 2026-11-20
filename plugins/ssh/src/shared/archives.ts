import { z } from "zod";
import { TransferEndpoint } from "./transfers.js";

const Support = z.object({ zip: z.boolean(), reason: z.string() });
export const ArchiveSupport = z.object({ local: Support, remote: Support, otherFormats: z.string(), nativeSelection: z.string() });
export type ArchiveSupport = z.infer<typeof ArchiveSupport>;
export const ArchiveRequest = z.strictObject({
  directory: TransferEndpoint,
  name: z.string().min(1).max(255),
  operation: z.enum(["compress", "list", "extract"]),
  output: z.string().min(1).max(255).optional(),
  localFileSessionId: z.uuid().optional(),
});
export type ArchiveRequest = z.infer<typeof ArchiveRequest>;
export const ArchiveEntry = z.object({ name: z.string(), directory: z.boolean(), size: z.number(), mtime: z.number(), sha256: z.string().optional() });
export type ArchiveEntry = z.infer<typeof ArchiveEntry>;
export const ArchiveResult = z.object({
  archivePath: z.string(),
  archiveSha256: z.string(),
  extractedPath: z.string().optional(),
  entries: z.array(ArchiveEntry),
});
export type ArchiveResult = z.infer<typeof ArchiveResult>;
