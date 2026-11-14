export type ShellName = "default" | "bash" | "zsh" | "sh" | "powershell" | "cmd";

/** 终端命令的执行方式：命令作为一个独立参数交给 shell（`-c` / `-Command` / `/c`），所以能拿到退出码，也不做字符串拼接。 */
export function shellCommand(shell: ShellName, command: string, platform: NodeJS.Platform = process.platform): string[] {
  if (shell === "powershell") return [platform === "win32" ? "powershell.exe" : "pwsh", "-NoProfile", "-Command", command];
  if (shell === "cmd") return ["cmd.exe", "/d", "/s", "/c", command];
  if (shell === "bash" || shell === "zsh" || shell === "sh") return [shell, "-c", command];
  return platform === "win32" ? ["cmd.exe", "/d", "/s", "/c", command] : ["/bin/sh", "-c", command];
}

/** 输出会写进 Vault：回显的秘密值先抹掉（长度不足 4 的值不处理，太短会误伤普通文本）。 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  return secrets.filter((s) => s.length >= 4).reduce((t, s) => t.split(s).join("***"), text);
}
