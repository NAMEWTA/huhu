import { z } from "zod";

/**
 * S1 冻结契约（knowledge-ok-parity）：资源目录 `vault.list` / `vault.readRange`、`hiddenPaths` 偏好、
 * `DocTab`、`EditorPort`、`DocumentSession` 相关类型。改动必须回到 change 计划修订（见 evidence/contracts-freeze.md）。
 */

/** 受保护目录：可列出元信息，不可当作普通资源操作；外部入口不能经 vault.list 读取其内容。 */
export const PROTECTED_KINDS = ["internal", "git", "dependency", "agents"] as const;
export type ProtectedKind = (typeof PROTECTED_KINDS)[number];

export const VAULT_LIST_DEFAULT_LIMIT = 500;
export const VAULT_LIST_MAX_LIMIT = 2000;
/** 单次 readRange 上限（4 MiB）。 */
export const VAULT_READ_RANGE_MAX = 4 * 1024 * 1024;

export const VaultListInput = z.object({
  /** Vault 相对目录；空串 = 根。 */
  dir: z.string().default(""),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(VAULT_LIST_MAX_LIMIT).default(VAULT_LIST_DEFAULT_LIMIT),
  /** 是否包含受保护目录（`.huhu` `.git` `.agents` `node_modules`）；默认不含。 */
  includeProtected: z.boolean().default(false),
});
export type VaultListInput = z.infer<typeof VaultListInput>;

export const VaultListEntry = z.object({
  name: z.string(),
  path: z.string(),
  kind: z.enum(["file", "dir", "symlink"]),
  size: z.number().optional(),
  mtimeMs: z.number().optional(),
  protected: z.enum(PROTECTED_KINDS).optional(),
  /** 链接条目：目标是否仍在 Vault 内。越界 / 失效 / 循环时 kind 保持 'symlink'、inside=false，且不跟随。 */
  linkTarget: z.object({ inside: z.boolean(), cycle: z.literal(true).optional() }).optional(),
});
export type VaultListEntry = z.infer<typeof VaultListEntry>;

export const VaultListOutput = z.object({
  entries: z.array(VaultListEntry),
  nextCursor: z.string().optional(),
  /** 仅当本目录已全部列出（没有 nextCursor）时出现。 */
  total: z.number().optional(),
  /** 同上；文件与目录分开计数。 */
  counts: z.object({ files: z.number(), dirs: z.number() }).optional(),
});
export type VaultListOutput = z.infer<typeof VaultListOutput>;

export const VaultReadRangeInput = z.object({
  path: z.string(),
  offset: z.number().int().min(0),
  length: z.number().int().min(1).max(VAULT_READ_RANGE_MAX),
});
export type VaultReadRangeInput = z.infer<typeof VaultReadRangeInput>;
export const VaultReadRangeOutput = z.object({ path: z.string(), offset: z.number(), length: z.number(), size: z.number(), base64: z.string(), eof: z.boolean() });
export type VaultReadRangeOutput = z.infer<typeof VaultReadRangeOutput>;

/** 每 Vault 的“仅文件树隐藏”偏好。规则为规范相对路径；目录规则作用于整棵子树。 */
export const HiddenPathsPrefs = z.object({ hiddenPaths: z.array(z.string()).default([]) });
export type HiddenPathsPrefs = z.infer<typeof HiddenPathsPrefs>;

/** rel 是否被隐藏规则命中（规则本身或其祖先目录）。 */
export function isHiddenByRules(rel: string, rules: readonly string[]): boolean {
  return rules.some((r) => rel === r || rel.startsWith(`${r}/`));
}

/** 标签：文件 + 三类档案视图（design §7）。 */
export type DocView = "rich" | "source" | "read" | "viewer";
export type DocTab =
  | { kind: "file"; vaultId: string; path: string; view: DocView }
  | { kind: "archives-home"; vaultId: string }
  | { kind: "archive-type"; vaultId: string; type: string }
  | { kind: "archive-record"; vaultId: string; type: string; name: string };
export type SidebarContext = "files" | "archives";

/** 编辑器对外唯一接口（实现见 S2；坐标不得持久化）。 */
export interface EditorPort {
  focus(): void;
  getSelection(): { text: string; from?: number; to?: number } | null;
  execute(command: string, args?: unknown): boolean;
  canExecute(command: string): boolean;
  reveal(target: { line?: number; heading?: string; commentId?: string; propertyKey?: string }): void;
  getDraft(): string;
  flush(): Promise<void>;
  readonly readOnly: boolean;
}

export type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error";
export type DocumentKind = "markdown" | "text" | "json";
export type SetTextOrigin = "editor" | "source" | "plain" | "property" | "external";
