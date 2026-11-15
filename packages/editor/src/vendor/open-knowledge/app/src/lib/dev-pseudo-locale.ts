// P-S2a-04：pseudo 伪本地化不随 Huhu 发布；保留同名导出，永远返回 false。
export function isPseudoLocaleRequested(): boolean {
  return false;
}

export async function activatePseudoLocale(): Promise<void> {}
