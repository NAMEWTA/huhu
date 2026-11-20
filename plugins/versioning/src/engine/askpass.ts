import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { authenticationFailed, type GitLogin } from "./remote-auth.js";

const WINDOWS_ASKPASS = String.raw`param([string]$prompt)
$ErrorActionPreference = 'Stop'
try {
  if ($prompt -cnotmatch "^(Username|Password) for '((?:https?)://)([^/']+)(/[^']*)':\s*$") { exit 1 }
  $field = $Matches[1].ToLowerInvariant()
  $scheme = $Matches[2]
  $authority = $Matches[3]
  $repository = $Matches[4]
  $i = $authority.LastIndexOf('@')
  $address = $authority.Substring($i + 1)
  $uri = [Uri]($scheme + $address + $repository)
  $actual = $uri.GetLeftPart([UriPartial]::Authority) + $uri.AbsolutePath.TrimEnd('/')
  if ($actual -cne $env:HUHU_GIT_ASKPASS_TARGET -or $uri.Query -or $uri.Fragment) { exit 1 }
  if ($field -eq 'password') {
    if ($i -lt 0) { exit 1 }
    $name = [Uri]::UnescapeDataString($authority.Substring(0, $i))
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $digest = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($name))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
    if ($digest -cne $env:HUHU_GIT_ASKPASS_USER_DIGEST) { exit 1 }
  } elseif ($i -ge 0) { exit 1 }

  $pipe = New-Object IO.Pipes.NamedPipeClientStream('.', $env:HUHU_GIT_ASKPASS_PIPE, [IO.Pipes.PipeDirection]::InOut)
  try {
    $pipe.Connect(3000)
    $bytes = [Text.Encoding]::ASCII.GetBytes($env:HUHU_GIT_ASKPASS_NONCE + ' ' + $field + [char]10)
    $pipe.Write($bytes, 0, $bytes.Length)
    $pipe.Flush()
    $reader = New-Object IO.StreamReader($pipe, [Text.Encoding]::UTF8)
    $value = $reader.ReadToEnd()
    if (!$value) { exit 1 }
    [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
    [Console]::Out.Write($value)
  } finally { $pipe.Dispose() }
} catch { exit 1 }
`;

export function scrubEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.keys(process.env)
      .filter((key) => /^(?:GIT_TRACE|GIT_CURL_VERBOSE$|GIT_CONFIG_(?:COUNT$|KEY_|VALUE_|PARAMETERS$)|GIT_SSL_NO_VERIFY$|NODE_OPTIONS$|(?:HTTPS?|ALL|NO)_PROXY$|HUHU_GIT_)/i.test(key))
      .map((key) => [key, undefined]),
  );
}

export interface Askpass {
  env: NodeJS.ProcessEnv;
  args: string[];
  close(): void;
}

/** One Windows Git invocation owns the pipe, challenge nonce and static launcher. */
export async function openAskpass(target: string, login: GitLogin): Promise<Askpass> {
  if (process.platform !== "win32") throw authenticationFailed("local-protection-unavailable");
  const pipe = `huhu-git-${randomUUID()}`;
  const nonce = randomBytes(32).toString("hex");
  const expected = Buffer.from(nonce);
  const directory = mkdtempSync(path.join(tmpdir(), "huhu-askpass-"));
  const launcher = path.join(directory, "askpass.cmd");
  const sockets = new Set<Socket>();
  let count = 0;
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    socket.setTimeout(3000, () => socket.destroy());
    let request = "";
    socket.on("data", (bytes: Buffer) => {
      request += bytes.toString("ascii");
      if (request.length > 80) return void socket.destroy();
      if (!request.endsWith("\n")) return;
      const match = /^([\da-f]{64}) (username|password)\n$/.exec(request);
      if (!match || !timingSafeEqual(expected, Buffer.from(match[1]!)) || ++count > 8) return void socket.destroy();
      socket.end(match[2] === "username" ? login.username : login.token, "utf8");
    });
  });
  const close = () => {
    for (const socket of sockets) socket.destroy();
    if (server.listening) server.close();
    expected.fill(0);
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Only static launchers live in this directory.
    }
  };
  try {
    writeFileSync(path.join(directory, "askpass.ps1"), WINDOWS_ASKPASS);
    writeFileSync(launcher, '@echo off\r\n"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0askpass.ps1" "%~1"\r\n');
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(`\\\\.\\pipe\\${pipe}`, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
    server.on("error", close);
    return {
      env: {
        ...scrubEnvironment(),
        LC_ALL: "C",
        GIT_TRACE2: "0",
        GIT_TRACE2_EVENT: "0",
        GIT_TRACE2_PERF: "0",
        GIT_ALLOW_PROTOCOL: new URL(target).protocol.slice(0, -1),
        GIT_ASKPASS: launcher,
        HUHU_GIT_ASKPASS_PIPE: pipe,
        HUHU_GIT_ASKPASS_NONCE: nonce,
        HUHU_GIT_ASKPASS_TARGET: target,
        HUHU_GIT_ASKPASS_USER_DIGEST: createHash("sha256").update(login.username).digest("hex"),
      },
      args: ["-c", `core.hooksPath=${directory}`, "-c", "core.fsmonitor=false", "-c", "maintenance.auto=false", "-c", "gc.auto=0", "-c", "fetch.recurseSubmodules=false", "-c", "push.recurseSubmodules=no"],
      close,
    };
  } catch {
    close();
    throw authenticationFailed("askpass-unavailable");
  }
}
