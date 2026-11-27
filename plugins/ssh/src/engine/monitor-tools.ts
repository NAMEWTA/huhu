import { HuhuError } from "@huhu/contracts";
import type { z } from "zod";
import type { MonitorContainerTarget, MonitorProcessTarget, MonitorTool, MonitorToolRequest, MonitorToolResult } from "../shared/monitoring.js";
import type { MonitorConnection, SshManager } from "./manager.js";
import { detectPlatform, monitorExec, monitorWithSudo, powershellProbe, SampleError } from "./monitor-sample.js";

// /proc stat field 22 follows the last ") " because comm may contain parentheses.
const readProcessStat = `read_process_stat() {
  IFS= read -r stat 2>/dev/null < "$1" || return 1
  fields=\${stat##*) }
  [ "$fields" != "$stat" ] || return 1
  name=\${stat%"$fields"}
  name=\${name#*(}
  name=\${name%') '}
  set -f
  set -- $fields
  start=\${20}
  case "$start" in ''|*[!0-9]*) return 1 ;; esac
}`;
export const PROCESS_LIST = `${readProcessStat}
[ -r /proc/self/stat ] || exit 127
count=0
for path in /proc/[0-9]*/stat; do
  pid=\${path#/proc/}; pid=\${pid%/stat}
  read_process_stat "$path" || continue
  printf '%s\\t%s\\t%s\\n' "$pid" "$start" "$name"
  count=$((count+1))
  [ "$count" -lt 64 ] || break
done`;
export const CONTAINER_LIST = "docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.State}}'";
export const IMAGE_LIST = "docker images --format '{{.ID}}|{{.Repository}}:{{.Tag}}|{{.Size}}'";
const WIN_PROCESS_LIST = powershellProbe("Get-Process | Sort-Object Id | Select-Object -First 64 | ForEach-Object { '{0} {1}' -f $_.Id,$_.ProcessName }");
const windowsDockerList = (command: string) =>
  powershellProbe(`
if (!(Get-Command docker -ErrorAction SilentlyContinue)) { exit 127 }
${command}
exit $LASTEXITCODE
`);
const linuxCommands = { processes: PROCESS_LIST, containers: CONTAINER_LIST, images: IMAGE_LIST } satisfies Record<MonitorTool, string>;
const windowsCommands = { processes: WIN_PROCESS_LIST, containers: windowsDockerList(CONTAINER_LIST), images: windowsDockerList(IMAGE_LIST) } satisfies Record<MonitorTool, string>;

function processRows(text: string, linux: boolean): MonitorToolResult["rows"] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      if (linux) {
        const match = /^([1-9]\d{0,9})\t(\d{1,20})\t([^\p{Cc}]{1,120})$/u.exec(line);
        return match ? [{ id: match[1]!, startTicks: match[2]!, name: match[3]! }] : [];
      }
      const match = /^\s*([1-9]\d{0,9})\s+([^\p{Cc}]{1,120})$/u.exec(line.trimEnd());
      return match ? [{ id: match[1]!, name: match[2]! }] : [];
    })
    .slice(0, 64);
}

function containerRows(text: string): MonitorToolResult["rows"] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      const [id, name, image, state, extra] = line.split("|");
      if (!id || !/^[a-f0-9]{6,64}$/i.test(id) || !name || !image || !state || extra !== undefined) return [];
      return [{ id, name: name.slice(0, 100), detail: `${image.slice(0, 128)} · ${state.slice(0, 40)}` }];
    })
    .slice(0, 64);
}

function imageRows(text: string): MonitorToolResult["rows"] {
  const images = new Map<string, MonitorToolResult["rows"][number]>();
  for (const line of text.split(/\r?\n/)) {
    const [id, name, size, extra] = line.split("|");
    if (!id || !/^[a-f0-9]{6,64}$/i.test(id) || !name || !size || extra !== undefined) continue;
    const label = name.slice(0, 240);
    images.set(`${id}:${label}`, { id, name: label, detail: size.slice(0, 40) });
    if (images.size === 64) break;
  }
  return [...images.values()];
}

const parseRows = { processes: processRows, containers: containerRows, images: imageRows };

export async function readMonitorTool(manager: SshManager, input: z.infer<typeof MonitorToolRequest>, request: AbortSignal): Promise<MonitorToolResult> {
  return readMonitorConnection(manager.monitorPane(input.hostId, input.shellId), input.tool, request, input.sudo);
}

export async function readMonitorConnection(connection: MonitorConnection, tool: z.infer<typeof MonitorToolRequest>["tool"], request: AbortSignal, elevated = false): Promise<MonitorToolResult> {
  const close = new AbortController();
  const off = connection.onClose(() => close.abort());
  const signal = AbortSignal.any([request, close.signal, AbortSignal.timeout(12_000)]);
  const base = { connectionId: connection.id, tool };
  const status = (state: "unsupported" | "denied" | "failed", message: string) => ({ ...base, state, message, rows: [] });
  try {
    const platform = await detectPlatform(connection.client, signal);
    const isProcess = tool === "processes";
    const command = (platform === "linux" ? linuxCommands : windowsCommands)[tool];
    const read = await (elevated ? monitorWithSudo(connection.client, platform, command, signal) : monitorExec(connection.client, command, signal));
    if (read.code === 127 || /(?:docker|ps): (?:command )?not found/i.test(read.stderr)) return status("unsupported", isProcess ? "系统未提供进程列表工具" : "当前主机缺少 Docker 命令");
    if (/permission denied|access (?:is )?denied|not permitted/i.test(read.stderr)) return status("denied", "当前账户没有读取权限");
    if (read.code !== 0 && read.code !== undefined) return status("failed", isProcess ? "进程查询失败" : "无法读取 Docker 状态，服务可能不可用");
    return { ...base, state: "ready", rows: parseRows[tool](read.stdout, platform === "linux") };
  } catch (cause) {
    if (close.signal.aborted) throw new HuhuError("SSH_DISCONNECTED", "服务器工具的原分栏已关闭");
    request.throwIfAborted();
    if (cause instanceof HuhuError) throw cause;
    if (cause instanceof SampleError) return status(cause.phase, cause.message);
    return status("failed", "只读状态查询失败");
  } finally {
    off();
    connection.release();
  }
}

async function withLinuxTool<T>(
  manager: SshManager,
  input: { hostId: string; shellId: string; sudo?: boolean | undefined },
  request: AbortSignal,
  action: (run: (command: string) => ReturnType<typeof monitorExec>, connectionId: string, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const connection = manager.monitorPane(input.hostId, input.shellId);
  const close = new AbortController();
  const off = connection.onClose(() => close.abort());
  const signal = AbortSignal.any([request, close.signal, AbortSignal.timeout(12_000)]);
  try {
    if ((await detectPlatform(connection.client, signal)) !== "linux") throw new SampleError("unsupported", "此服务器工具操作仅支持 Linux");
    return await action((command) => (input.sudo ? monitorWithSudo(connection.client, "linux", command, signal) : monitorExec(connection.client, command, signal)), connection.id, signal);
  } catch (error) {
    if (close.signal.aborted) throw new HuhuError("SSH_DISCONNECTED", "服务器工具的原分栏已关闭");
    request.throwIfAborted();
    if (error instanceof SampleError) throw new HuhuError(error.phase === "denied" ? "PERMISSION_DENIED" : "INVALID_INPUT", error.message);
    throw error;
  } finally {
    off();
    connection.release();
  }
}

export function terminateMonitorProcess(manager: SshManager, input: z.infer<typeof MonitorProcessTarget>, signal: AbortSignal) {
  return withLinuxTool(manager, input, signal, async (run) => {
    const name = "'" + input.name.replaceAll("'", "'\\''") + "'";
    const response = await run(`${readProcessStat}
read_process_stat /proc/${input.pid}/stat || exit 3
[ "$name" = ${name} ] && [ "$start" = '${input.startTicks}' ] || exit 3
kill -TERM ${input.pid}`);
    if (response.code === 3) throw new HuhuError("VERSION_CONFLICT", "无法确认原进程，进程可能已退出或 PID 已被复用，请刷新查询");
    if (response.code !== 0) throw new HuhuError("PERMISSION_DENIED", "远端未能向进程发送终止信号");
    return { ok: true as const };
  });
}

export function readContainerLogs(manager: SshManager, input: z.infer<typeof MonitorContainerTarget>, signal: AbortSignal) {
  return withLinuxTool(manager, input, signal, async (run) => {
    const result = await run(`docker logs --tail 100 -- ${input.containerId}`);
    if (result.code !== 0) throw new HuhuError("INVALID_INPUT", "无法读取指定容器日志，请确认容器和 Docker 权限");
    return { stdout: result.stdout, stderr: result.stderr };
  });
}

export function openContainerShell(manager: SshManager, input: z.infer<typeof MonitorContainerTarget>, signal: AbortSignal) {
  return withLinuxTool(manager, input, signal, async (run, connectionId, current) => {
    const command = `docker exec -it ${input.containerId} sh`;
    const probe = await run(`docker exec ${input.containerId} sh -c :`);
    if (probe.code !== 0) throw new HuhuError("INVALID_INPUT", "容器须正在运行并提供 sh，且当前账户须有执行权限");
    return manager.openToolShell(input.hostId, input.shellId, connectionId, input.sudo ? `sudo -n -- ${command}` : command, current);
  });
}
