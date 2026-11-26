import { HuhuError } from "@huhu/contracts";
import type { z } from "zod";
import type { MonitorTool, MonitorToolRequest, MonitorToolResult } from "../shared/monitoring.js";
import type { MonitorConnection, SshManager } from "./manager.js";
import { detectPlatform, monitorExec, monitorWithSudo, powershellProbe, SampleError } from "./monitor-sample.js";

// Read-only command subset adapted from Motty remotetools. Process arguments,
// environment, container configuration and logs are outside this response.
export const PROCESS_LIST = "LC_ALL=C ps -e -o pid= -o comm=";
export const CONTAINER_LIST = "docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.State}}'";
export const IMAGE_LIST = "docker images --format '{{.ID}}|{{.Repository}}:{{.Tag}}|{{.Size}}'";
const WIN_PROCESS_LIST = powershellProbe("Get-Process | Sort-Object Id | Select-Object -First 64 | ForEach-Object { '{0} {1}' -f $_.Id,$_.ProcessName }");
const windowsDockerList = (command: string) => powershellProbe(`
if (!(Get-Command docker -ErrorAction SilentlyContinue)) { exit 127 }
${command}
exit $LASTEXITCODE
`);
const linuxCommands = { processes: PROCESS_LIST, containers: CONTAINER_LIST, images: IMAGE_LIST } satisfies Record<MonitorTool, string>;
const windowsCommands = { processes: WIN_PROCESS_LIST, containers: windowsDockerList(CONTAINER_LIST), images: windowsDockerList(IMAGE_LIST) } satisfies Record<MonitorTool, string>;

function processRows(text: string): MonitorToolResult["rows"] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
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
    return { ...base, state: "ready", rows: parseRows[tool](read.stdout) };
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
