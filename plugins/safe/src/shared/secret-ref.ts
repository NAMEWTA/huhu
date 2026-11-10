const REF = /^safe:\/\/(item-[0-9a-z]+)$/;

/** 引用格式只接受 `safe://<itemId>`。 */
export function parseSecretRef(ref: string): string | null {
  return REF.exec(ref)?.[1] ?? null;
}

export function formatSecretRef(itemId: string): string {
  return `safe://${itemId}`;
}
