/** 输出会写进 Vault（并可能被同步、被 Agent 读到），所以回显的秘密值必须先抹掉。长度不足 4 的值不处理（太短会误伤普通文本）。 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  return secrets.filter((s) => s.length >= 4).reduce((t, s) => t.split(s).join("***"), text);
}
