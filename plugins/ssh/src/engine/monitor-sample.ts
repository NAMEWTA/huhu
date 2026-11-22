import { HuhuError } from "@huhu/contracts";
import type { Client } from "ssh2";
import { captureSshCommand, RemoteCommandError } from "./ssh-exec.js";
import { MonitorSample, type MonitorSample as Sample } from "../shared/monitoring.js";

export const PLATFORM_COMMAND = "uname -s";
// Fixed probes. Follow Motty remotestats' procfs counters and Windows CIM split.
export const LINUX_SAMPLE = String.raw`# huhu-monitor-linux-v1
LC_ALL=C; export LC_ALL
if [ ! -r /proc/stat ] && [ ! -r /proc/meminfo ]; then
  if [ -e /proc/stat ]; then printf 'denied\n'; else printf 'unsupported\n'; fi
  exit 0
fi
awk '/^cpu / {for(i=2;i<=9;i++) total+=$i; printf "cpu %.0f %.0f\n",total-$5-$6,total; exit}' /proc/stat 2>/dev/null
awk '/^MemTotal:/ {t=$2} /^MemAvailable:/ {m=$2; found=1} END {if(t>0 && found) printf "memory %.0f %.0f\n",t*1024,m*1024}' /proc/meminfo 2>/dev/null
awk 'NR==1 {print "uptime",$1}' /proc/uptime 2>/dev/null
awk 'NR==1 {print "load",$1}' /proc/loadavg 2>/dev/null
awk -F: 'NR>2 && $1 !~ /^ *lo *$/ {split($2,a," "); rx+=a[1]; tx+=a[9]; n++} END{if(n) printf "net %.0f %.0f\n",rx,tx}' /proc/net/dev 2>/dev/null
df -Pk / 2>/dev/null | awk 'NR==2 && $2>0 {printf "disk %.0f %.0f\n",$2*1024,$4*1024}'
`;

const windowsScript = String.raw`# huhu-monitor-windows-v1
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
function Query($name) { Get-CimInstance -ClassName $name -OperationTimeoutSec 2 -ErrorAction Stop }
$result=@{}
try {
  $os=Query Win32_OperatingSystem
  if ($os.TotalVisibleMemorySize -gt 0 -and $null -ne $os.FreePhysicalMemory) {
    $result.memory=@{total=([double]$os.TotalVisibleMemorySize*1024);available=([double]$os.FreePhysicalMemory*1024)}
  }
  if ($os.LastBootUpTime) { $result.uptimeSec=[Math]::Max(0,([DateTime]::Now-$os.LastBootUpTime).TotalSeconds) }
} catch {
  if ($_.Exception.Message -match '(?i)access.*denied|0x80041003') { [Console]::WriteLine('denied'); exit 0 }
  [Console]::WriteLine('unsupported'); exit 0
}
try {
  $cpu=Query Win32_PerfFormattedData_PerfOS_Processor | Where-Object Name -eq '_Total' | Select-Object -First 1
  if ($null -ne $cpu.PercentProcessorTime) { $result.cpu=[double]$cpu.PercentProcessorTime }
} catch {}
try {
  $disk=Query Win32_LogicalDisk | Where-Object DeviceID -eq $os.SystemDrive | Select-Object -First 1
  if ($disk.Size -gt 0 -and $null -ne $disk.FreeSpace) { $result.disk=@{mount=[string]$disk.DeviceID;total=[double]$disk.Size;available=[double]$disk.FreeSpace} }
} catch {}
try {
  $net=@(Query Win32_PerfFormattedData_Tcpip_NetworkInterface | Where-Object { $_.Name -notmatch '(?i)loopback' -and $null -ne $_.BytesReceivedPersec -and $null -ne $_.BytesSentPersec })
  if ($net.Count) { $result.network=@{received=[double](($net | Measure-Object BytesReceivedPersec -Sum).Sum);sent=[double](($net | Measure-Object BytesSentPersec -Sum).Sum)} }
} catch {}
[Console]::WriteLine((ConvertTo-Json -InputObject $result -Depth 4 -Compress))
`;
export const powershellProbe = (script: string) => `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)\n${script}`, "utf16le").toString("base64")}`;
export const WINDOWS_SAMPLE = powershellProbe(windowsScript);
export type Platform = "linux" | "windows";

export class SampleError extends Error {
  constructor(
    readonly phase: "denied" | "unsupported" | "failed",
    message: string,
  ) {
    super(message);
  }
}

export async function monitorExec(client: Client, command: string, signal: AbortSignal) {
  try {
    return await captureSshCommand(client, command, signal, 32 * 1024);
  } catch (error) {
    if (!(error instanceof RemoteCommandError)) throw error;
    switch (error.reason) {
      case "disconnected":
        throw new HuhuError("SSH_DISCONNECTED", "监控的原连接已关闭");
      case "denied":
        throw new SampleError("denied", "SSH 服务端拒绝监控查询");
      case "cancelled":
        throw new SampleError("failed", "监控查询已取消或超时");
      case "output-limit":
        throw new SampleError("failed", "监控输出超过上限");
      case "interrupted":
        throw new SampleError("failed", "SSH 监控通道中断");
    }
  }
}

const denied = /permission denied|access (?:is )?denied|not permitted/i;
export async function detectPlatform(client: Client, signal: AbortSignal): Promise<Platform> {
  const probe = await monitorExec(client, PLATFORM_COMMAND, signal);
  if (denied.test(probe.stderr)) throw new SampleError("denied", "读取系统类型的权限不足");
  if (probe.stdout === "Linux") return "linux";
  if (probe.code !== 0 || /^(Windows|MSYS|MINGW|CYGWIN)/i.test(probe.stdout)) return "windows";
  throw new SampleError("unsupported", "当前系统没有可用的监控采样器");
}

export type Counters = { at: number; cpu?: [number, number]; net?: [number, number] };
const safe = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

function linux(text: string, at: number, previous?: Counters) {
  const counters: Counters = { at };
  const sample: Sample = {};
  for (const row of text.split(/\r?\n/)) {
    const [field, a, b] = row.split(/\s+/);
    const first = a === undefined ? undefined : Number(a);
    const second = b === undefined ? undefined : Number(b);
    if (!safe(first)) continue;
    if (field === "uptime") sample.uptimeSec = first;
    if (field === "load") sample.load = first;
    if (!safe(second)) continue;
    if (field === "cpu" && first <= second) counters.cpu = [first, second];
    if (field === "net") counters.net = [first, second];
    if (field === "memory" && first > 0 && second <= first) sample.memory = { total: first, available: second };
    if (field === "disk" && first > 0 && second <= first) sample.disk = { mount: "/", total: first, available: second };
  }
  if (previous?.cpu && counters.cpu) {
    const busy = counters.cpu[0] - previous.cpu[0];
    const total = counters.cpu[1] - previous.cpu[1];
    if (total > 0 && busy >= 0 && busy <= total) sample.cpu = (busy / total) * 100;
  }
  if (previous?.net && counters.net && at > previous.at) {
    const received = counters.net[0] - previous.net[0];
    const sent = counters.net[1] - previous.net[1];
    if (received >= 0 && sent >= 0) sample.network = { received: (received * 1000) / (at - previous.at), sent: (sent * 1000) / (at - previous.at) };
  }
  if (!Object.keys(sample).length && !counters.cpu && !counters.net) throw new SampleError("unsupported", "系统未返回可用监控指标");
  return { sample, counters };
}

export async function readSample(client: Client, platform: Platform, signal: AbortSignal, previous?: Counters) {
  const result = await monitorExec(client, platform === "linux" ? LINUX_SAMPLE : WINDOWS_SAMPLE, signal);
  if (result.stdout === "denied" || denied.test(result.stderr)) throw new SampleError("denied", "读取系统指标的权限不足");
  if (result.stdout === "unsupported" || (platform === "windows" && result.code === 127)) throw new SampleError("unsupported", "系统监控工具不可用");
  if (result.code !== 0 && result.code !== undefined) throw new SampleError("failed", "监控查询未正常完成");
  const at = Date.now();
  if (platform === "linux") return { at, ...linux(result.stdout, at, previous) };
  try {
    const parsed = MonitorSample.parse(JSON.parse(result.stdout));
    if (!Object.keys(parsed).length) throw new Error("missing values");
    if ((parsed.memory && parsed.memory.available > parsed.memory.total) || (parsed.disk && parsed.disk.available > parsed.disk.total)) throw new Error("invalid capacity");
    return { at, sample: parsed, counters: undefined };
  } catch {
    throw new SampleError("unsupported", "系统未返回可用的 Windows 监控指标");
  }
}
