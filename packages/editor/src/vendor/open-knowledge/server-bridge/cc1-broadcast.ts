// HUHU STUB（P-S2a-srv）：上游 cc1-broadcast 是 Hocuspocus 系统文档广播；本地只需要两个判定函数。
import { CONFIG_DOC_NAMES, SYSTEM_DOC_NAME } from '@inkeep/open-knowledge-core/constants/cc1';

const CONFIG = new Set<string>(CONFIG_DOC_NAMES);
export function isSystemDoc(documentName: string): boolean {
  return documentName === SYSTEM_DOC_NAME;
}
export function isConfigDoc(documentName: string): boolean {
  return CONFIG.has(documentName);
}
