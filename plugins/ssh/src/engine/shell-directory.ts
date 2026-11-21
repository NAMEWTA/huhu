import { randomBytes } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import type { DirectoryFollowState } from "../shared/files.js";

const marker = "\x1b]633;Huhu;";
// The terminal protocol frames use literal ESC and BEL bytes.
// eslint-disable-next-line no-control-regex
const frames = /\x1b\]633;Huhu;([^\x07\x1b]*)(?:\x07|\x1b\\)|\x1b\[\?(47|1047|1049)([hl])/g;
const maxFrame = 8192;
const safeDirectory = (path: string) => path.startsWith("/") && Buffer.byteLength(path) <= 4096 && !/[\p{Cc}\p{Cf}\uFFFD]/u.test(path);
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

export const shellDirectoryProbe = 'case "${SHELL##*/}" in bash|zsh) printf "%s\\n" "${SHELL##*/}";; esac';
export type IntegratedShell = "bash" | "zsh";

export class ShellDirectory {
  private readonly token = randomBytes(24).toString("hex");
  private readonly decoder = new StringDecoder("utf8");
  private carry = "";
  private revision = 0;
  private reportedPrompt = false;
  private cwd: string | undefined;
  private pending = 0;
  private partial = false;
  private ambiguous = false;
  private readonly alternate = new Set<string>();
  private idle = false;

  launch(shell: IntegratedShell): string {
    const start = `\\033]633;Huhu;${this.token};B\\007`;
    const report = `__huhu_directory() {
  local huhu_status=$?
  local huhu_cwd
  huhu_cwd=$(builtin pwd -P | command base64 | command tr -d '\\r\\n')
  builtin printf '\\033]633;Huhu;${this.token};P;%s\\007' "$huhu_cwd"
  return "$huhu_status"
}`;
    const bashRc = `[[ -r /etc/profile ]] && source /etc/profile
for huhu_profile in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
  if [[ -r "$huhu_profile" ]]; then source "$huhu_profile"; break; fi
done
unset huhu_profile
if (( BASH_VERSINFO[0] > 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4) )); then
${report}
  __huhu_directory_active=1
  export -n __huhu_directory_active
  HISTIGNORE=\${HISTIGNORE:+$HISTIGNORE:}' builtin cd -- *'
  case $(declare -p PROMPT_COMMAND 2>/dev/null) in
    'declare -a '*) PROMPT_COMMAND+=('\${__huhu_directory_active:+__huhu_directory}');;
    *) PROMPT_COMMAND=\${PROMPT_COMMAND:+$PROMPT_COMMAND$'\\n'}'\${__huhu_directory_active:+__huhu_directory}';;
  esac
  PS0=$'${start}'\${PS0-}
fi`;
    const zshEnv = `huhu_private=$ZDOTDIR
ZDOTDIR=$HUHU_USER_ZDOTDIR
unset HUHU_USER_ZDOTDIR
[[ -r "$ZDOTDIR/.zshenv" ]] && source "$ZDOTDIR/.zshenv"
huhu_user=\${ZDOTDIR-$HOME}
ZDOTDIR=$huhu_private`;
    const zshRc = (file: string) => `ZDOTDIR=$huhu_user
[[ -r "$ZDOTDIR/${file}" ]] && source "$ZDOTDIR/${file}"
huhu_user=\${ZDOTDIR-$HOME}
ZDOTDIR=$huhu_private`;
    const zshLogin = `${zshRc(".zlogin")}
ZDOTDIR=$huhu_user
unset huhu_user huhu_private
${report}
__huhu_command_start() { builtin printf '${start}'; }
__huhu_directory_history() {
  [[ $1 == ' builtin cd -- '* ]] && return 1
  return 0
}
autoload -Uz add-zsh-hook
add-zsh-hook preexec __huhu_command_start
add-zsh-hook zshaddhistory __huhu_directory_history
add-zsh-hook precmd __huhu_directory`;
    const scripts =
      shell === "bash"
        ? `printf '%s\\n' ${quote(bashRc)} > "$d/bashrc" || exit 1
umask "$saved_umask"
"$SHELL" --rcfile "$d/bashrc" -i`
        : `printf '%s\\n' ${quote(zshEnv)} > "$d/.zshenv" &&
printf '%s\\n' ${quote(zshRc(".zprofile"))} > "$d/.zprofile" &&
printf '%s\\n' ${quote(zshRc(".zshrc"))} > "$d/.zshrc" &&
printf '%s\\n' ${quote(zshLogin)} > "$d/.zlogin" || exit 1
umask "$saved_umask"
HUHU_USER_ZDOTDIR="\${ZDOTDIR-$HOME}" ZDOTDIR="$d" "$SHELL" -li`;
    const script = `saved_umask=$(umask)
umask 077
d=$(mktemp -d "\${TMPDIR:-/tmp}/huhu-shell.XXXXXXXX") || { umask "$saved_umask"; exec "$SHELL" -l; }
trap 'rm -f -- "$d/bashrc" "$d/.zshenv" "$d/.zprofile" "$d/.zshrc" "$d/.zlogin"; rmdir -- "$d"' 0
trap 'exit 129' HUP
trap 'exit 143' TERM
${scripts}`;
    return `sh -c ${quote(script)}`;
  }

  state(): DirectoryFollowState {
    if (this.alternate.size) return { state: "fullscreen", revision: this.revision };
    if (this.idle) return { state: "ready", revision: this.revision, ...(this.cwd ? { cwd: this.cwd } : {}) };
    return { state: this.reportedPrompt ? "busy" : "unsupported", revision: this.revision };
  }

  input(data: Buffer): void {
    const previousIdle = this.idle;
    this.idle = false;
    this.revision++;
    const text = data.toString("utf8");
    const submissions = text.match(/[\r\n]/g)?.length ?? 0;
    if (submissions > 1 || data.some((byte) => byte === 127 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13))) this.ambiguous = true;
    if (submissions) {
      const emptyEnter = previousIdle && !this.partial && /^[\r\n]$/.test(text);
      if (!emptyEnter) this.pending += submissions;
      this.partial = !/[\r\n]$/.test(text);
    } else {
      this.partial = true;
    }
  }

  output(data: Buffer): void {
    const text = this.carry + this.decoder.write(data);
    let processed = 0;
    for (const match of text.matchAll(frames)) {
      processed = match.index + match[0].length;
      if (match[2]) {
        if (match[3] === "h") this.alternate.add(match[2]);
        else this.alternate.delete(match[2]);
        this.idle = false;
        this.revision++;
        continue;
      }
      const frame = match[1];
      if (!frame?.startsWith(this.token + ";")) continue;
      const event = frame.slice(this.token.length + 1);
      if (event === "B") {
        if (this.pending > 0) this.pending--;
        this.idle = false;
        this.revision++;
      } else if (event.startsWith("P;") && event.length <= maxFrame) {
        const encoded = event.slice(2);
        const bytes = Buffer.from(encoded, "base64");
        const cwd = bytes.subarray(0, -1).toString("utf8");
        this.cwd = bytes.at(-1) === 10 && bytes.toString("base64") === encoded && safeDirectory(cwd) ? cwd : undefined;
        this.reportedPrompt ||= this.cwd !== undefined;
        this.idle = this.cwd !== undefined && !this.partial && !this.pending && !this.ambiguous && !this.alternate.size;
        this.revision++;
      }
    }
    const tail = text.slice(processed);
    const esc = tail.lastIndexOf("\x1b");
    const start = esc < 0 ? "" : tail.slice(esc);
    if (start === "\x1b\\" && tail.includes(marker) && tail.length <= maxFrame) this.carry = tail;
    else if (start.length <= maxFrame && (marker.startsWith(start) || start.startsWith(marker) || (start.startsWith("\x1b[?") && /^[0-9]*$/.test(start.slice(3))) || start === "\x1b[")) this.carry = start;
    else this.carry = "";
  }

  command(revision: number, path: string): Buffer | undefined {
    if (!this.idle || this.alternate.size || revision !== this.revision || path === this.cwd || !safeDirectory(path)) return undefined;
    const command = Buffer.from(` builtin cd -- ${quote(path)}\r`);
    this.input(command);
    return command;
  }
}
