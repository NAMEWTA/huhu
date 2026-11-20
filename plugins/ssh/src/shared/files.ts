import { z } from "zod";

export const FileEntry = z.object({
  name: z.string(),
  type: z.enum(["file", "dir", "link", "other"]),
  size: z.number(),
  mtime: z.number(),
  mode: z.string(),
});
export type FileEntry = z.infer<typeof FileEntry>;
export const RemoteFilePath = z.string().min(1).max(4096).startsWith("/");
export const FileProperties = FileEntry.extend({
  path: RemoteFilePath,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  uid: z.int().nonnegative().nullable(),
  gid: z.int().nonnegative().nullable(),
  atime: z.number().nullable(),
  linkTarget: z.string().nullable(),
});
export type FileProperties = z.infer<typeof FileProperties>;
export const FileAttributes = z.strictObject({
  mode: z.string().regex(/^[0-7]{3}$/).optional(),
  owner: z.strictObject({ uid: z.int().min(0).max(0xfffffffe), gid: z.int().min(0).max(0xfffffffe) }).optional(),
}).refine(({ mode, owner }) => mode !== undefined || owner !== undefined);
export type FileAttributes = z.infer<typeof FileAttributes>;
export const FileDirectory = z.object({ path: z.string(), entries: z.array(FileEntry) });
export type FileDirectory = z.infer<typeof FileDirectory>;

export const FileSessionId = z.strictObject({ fileSessionId: z.uuid() });
export const FileOrigin = z.object({
  connectionId: z.string(),
  hostId: z.string(),
  name: z.string(),
  host: z.string(),
  user: z.string(),
  port: z.number(),
});
export const FileSession = FileSessionId.extend({ ...FileOrigin.shape, shellId: z.string().optional(), state: z.enum(["ready", "disconnected"]) });
export type FileSession = z.infer<typeof FileSession>;

export const FileSearch = z.object({ hits: z.array(z.object({ folder: z.string(), entry: FileEntry })), limited: z.boolean(), skipped: z.number() });
export type FileSearch = z.infer<typeof FileSearch>;

export const EDIT_MAX_BYTES = 1024 * 1024;
export const FileDocumentVersion = z.string().regex(/^[a-f0-9]{64}$/);
export const FileDocumentRevision = z.object({ path: z.string(), version: FileDocumentVersion, mode: z.string() });
export const FileDocument = FileDocumentRevision.extend({ text: z.string() });
export type FileDocument = z.infer<typeof FileDocument>;
