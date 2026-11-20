import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { EngineSupervisor } from "../src/main/engine-supervisor.js";

const { app, fork, openExternal } = vi.hoisted(() => ({ app: { isPackaged: false, getPath: () => "fixture-user-data" }, fork: vi.fn(), openExternal: vi.fn() }));
vi.mock("electron", async () => {
  const { MessageChannel } = await import("node:worker_threads");
  return { app, utilityProcess: { fork }, MessageChannelMain: MessageChannel, shell: { openExternal } };
});

class Child extends EventEmitter {
  postMessage = vi.fn();
  kill = vi.fn();
}

afterEach(() => {
  app.isPackaged = false;
  fork.mockReset();
  openExternal.mockReset();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test("邮箱授权只由在线 Engine 请求，并只打开预期的提供商及本机回调", async () => {
  vi.stubEnv("HUHU_HERDR_BIN", "fixture-herdr");
  const child = new Child();
  fork.mockReturnValueOnce(child);
  openExternal.mockResolvedValue(undefined);
  const engine = new EngineSupervisor("fixture-vault", {}, () => undefined, "fixture-engine.js");
  engine.start();
  const authorize = (provider: string, callback: string) => {
    const u = new URL(provider);
    u.search = new URLSearchParams({ response_type: "code", redirect_uri: callback, code_challenge_method: "S256" }).toString();
    return u.href;
  };
  const google = "https://accounts.google.com/o/oauth2/v2/auth";
  const microsoft = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
  const callback = "http://127.0.0.1:12345/mail/oauth/callback";
  const request = (id: string, url: string) => child.emit("message", { type: "mail-oauth:open", id, url });
  request("not-ready", authorize(google, callback));
  child.emit("message", { type: "ready", port: 1234, rendererToken: "fixture", vaultId: "v" });
  request("offsite", authorize(google, "https://example.test/callback"));
  request("custom-port", authorize("https://accounts.google.com:8080/o/oauth2/v2/auth", callback));
  request("credentials", authorize("https://user@accounts.google.com/o/oauth2/v2/auth", callback));
  request("google", authorize(google, callback));
  request("microsoft", authorize(microsoft, "http://localhost:12345/mail/oauth/callback"));
  await vi.waitFor(() => expect(child.postMessage.mock.calls).toHaveLength(6));
  expect(openExternal.mock.calls.map(([url]) => url)).toEqual([authorize(google, callback), authorize(microsoft, "http://localhost:12345/mail/oauth/callback")]);
  expect(Object.fromEntries(child.postMessage.mock.calls.map(([result]) => [result.id, result.opened]))).toEqual({
    "not-ready": false,
    offsite: false,
    "custom-port": false,
    credentials: false,
    google: true,
    microsoft: true,
  });
});

test("安装资源缺失时不向 Engine 传递开发用受保护宿主", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-packaged-resource-"));
  const previous = Object.getOwnPropertyDescriptor(process, "resourcesPath");
  Object.defineProperty(process, "resourcesPath", { value: fixture, configurable: true });
  try {
    app.isPackaged = true;
    vi.stubEnv("huhu_agent_pty_host", path.join(fixture, "developer-host.exe"));
    vi.stubEnv("HUHU_HERDR_BIN", "fixture-herdr");
    fork.mockReturnValueOnce(new Child());
    new EngineSupervisor("fixture-vault", {}, () => undefined, "fixture-engine.js").start();
    expect(Object.keys(fork.mock.calls[0]?.[2].env).map((name) => name.toUpperCase())).not.toContain("HUHU_AGENT_PTY_HOST");
  } finally {
    if (previous) Object.defineProperty(process, "resourcesPath", previous);
    else Reflect.deleteProperty(process, "resourcesPath");
    rmSync(fixture, { recursive: true, force: true });
  }
});

async function stoppedAtDeadline() {
  vi.useFakeTimers();
  vi.stubEnv("HUHU_HERDR_BIN", "fixture-herdr");
  const child = new Child();
  fork.mockReturnValueOnce(child).mockReturnValueOnce(new Child());
  const engine = new EngineSupervisor("fixture-vault", {}, () => undefined, "fixture-engine.js");
  engine.start();
  const stopping = engine.stop(5);
  await vi.advanceTimersByTimeAsync(5);
  const generation = await stopping;
  expect(child.kill).toHaveBeenCalledOnce();
  expect(fork).toHaveBeenCalledOnce();
  return { engine, child, generation };
}

test("退出取消后等旧子进程退出，再恢复原 Engine", async () => {
  const { engine, child, generation } = await stoppedAtDeadline();
  engine.restartAfterStop(generation);
  expect(fork).toHaveBeenCalledOnce();
  child.emit("exit");
  expect(fork).toHaveBeenCalledTimes(2);
  expect(engine.current).toBe("starting");
});

test("第二次确认退出撤销上次取消所请求的延迟恢复", async () => {
  const { engine, child, generation } = await stoppedAtDeadline();
  engine.restartAfterStop(generation);
  const quitting = engine.stop(50);
  child.emit("exit");
  await quitting;
  expect(child.postMessage).toHaveBeenCalledTimes(2);
  expect(fork).toHaveBeenCalledOnce();
  expect(engine.current).toBe("stopped");
});

test("切 Vault 开始停止后，较早的退出不能再登记旧 Engine 恢复", async () => {
  const { engine, child, generation } = await stoppedAtDeadline();
  const switching = engine.stop(50);
  engine.restartAfterStop(generation);
  child.emit("exit");
  await switching;
  expect(child.postMessage).toHaveBeenCalledTimes(2);
  expect(fork).toHaveBeenCalledOnce();
  expect(engine.current).toBe("stopped");
});

test("切 Vault 开始停止时关闭旧 Engine 的邮件附件端口", async () => {
  vi.stubEnv("HUHU_HERDR_BIN", "fixture-herdr");
  const child = new Child();
  const replacement = new Child();
  fork.mockReturnValueOnce(child).mockReturnValueOnce(replacement);
  const engine = new EngineSupervisor("fixture-vault", {}, () => undefined, "fixture-engine.js");
  engine.start();
  child.emit("message", { type: "ready", port: 1, rendererToken: "fixture", vaultId: "fixture-vault" });
  const input = { type: "mail-attachment:add", vaultId: "fixture-vault", draftId: "draft", expectedRevision: "rev", file: { path: "fixture", name: "fixture", size: 1, fingerprint: "fixture" } } as const;
  const selection = engine.addMailDraftAttachment(input, new AbortController().signal);
  const [, ports] = child.postMessage.mock.calls[0]!;
  const remoteClosed = new Promise<void>((resolve) => ports[0].once("close", resolve));
  ports[0].start();

  const stopping = engine.stop();
  expect(child.postMessage).toHaveBeenLastCalledWith({ type: "shutdown" });
  await expect(selection).resolves.toEqual({ status: "cancelled" });
  await remoteClosed;
  expect(engine.mailAttachmentEndpoint(input.vaultId)).toBeNull();
  expect(fork).toHaveBeenCalledTimes(1);
  child.emit("exit");
  await stopping;
  engine.restart();
  replacement.emit("message", { type: "ready", port: 2, rendererToken: "fixture", vaultId: "fixture-vault" });
  expect(engine.mailAttachmentEndpoint(input.vaultId)?.baseUrl).toContain(":2");
  expect(replacement.postMessage).not.toHaveBeenCalled();
});
