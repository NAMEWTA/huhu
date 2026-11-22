import type { CDPSession, ElectronApplication, Page, Request, TestInfo } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const taskCapabilities = new Set(["tasks.create", "tasks.list", "home.focus.get", "home.summary", "health.run"]);

export async function observeTaskPerformance(page: Page, info: TestInfo) {
  const marks: { name: string; at: number }[] = [];
  const requests: { capability: string; requestId?: string; phase: string; at: number; status?: number }[] = [];
  const engineEvents: { type: string; at: number }[] = [];
  const tracked = new Map<Request, { capability: string; requestId?: string; status?: number }>();
  let scroll: { scrollStart: number; scrollEnd: number; firstTaskId?: string; lastTaskId?: string; scrollTop: number } | undefined;
  const mark = (name: string, at = Date.now()) => marks.push({ name, at });
  const recordRequest = (request: Request, phase: string) => {
    const call = tracked.get(request);
    if (!call) return;
    const event = { ...call, phase, at: Date.now() };
    requests.push(event);
    if (phase !== "sent") tracked.delete(request);
    // Playwright may remain in app.close until the test timeout. Keep the exit-time calls visible as they occur.
    if (marks.some(({ name }) => name === "app.close-start")) console.error("[perf-diagnostics] request", JSON.stringify(event));
  };
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/api/v1/call")) return;
    try {
      const call = request.postDataJSON() as { capability?: unknown; requestId?: unknown } | null;
      if (typeof call?.capability !== "string" || !taskCapabilities.has(call.capability)) return;
      const requestId = typeof call.requestId === "string" ? call.requestId : undefined;
      tracked.set(request, { capability: call.capability, ...(requestId !== undefined ? { requestId } : {}) });
      recordRequest(request, "sent");
    } catch {
      // Ignore requests without a JSON call envelope.
    }
  });
  page.on("response", (response) => {
    const call = tracked.get(response.request());
    if (call) call.status = response.status();
  });
  page.on("requestfinished", (request) => recordRequest(request, "finished"));
  page.on("requestfailed", (request) => recordRequest(request, request.failure()?.errorText === "net::ERR_ABORTED" ? "aborted" : "failed"));
  info.annotations.push({ type: "perf-diagnostics", description: "Task scroll diagnostics enabled" });
  mark("observers-attached");

  let cdp: CDPSession | undefined;
  let profiling = false;
  try {
    cdp = await page.context().newCDPSession(page);
    // This observes the existing connection without opening another subscription or logging payloads.
    cdp.on("Network.webSocketFrameReceived", ({ response }) => {
      if (response.opcode !== 1) return;
      if (!/"type"\s*:\s*"(vault\.fileChanged|engine\.closing)"/.test(response.payloadData)) return;
      let type: string | undefined;
      try {
        ({ type } = JSON.parse(response.payloadData) as { type?: string });
      } catch {
        return;
      }
      if (type !== "vault.fileChanged" && type !== "engine.closing") return;
      const event = { type, at: Date.now() };
      engineEvents.push(event);
      if (type === "engine.closing") console.error("[perf-diagnostics] engine event", JSON.stringify(event));
    });
    await cdp.send("Network.enable");
  } catch {
    mark("network-observer-unavailable");
  }
  if (cdp && process.env["HUHU_PERF_PROFILE"] === "1") {
    try {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.start");
      profiling = true;
      mark("profile-started");
    } catch {
      mark("profile-unavailable");
    }
  }

  const summary = () => {
    const orderedMarks = [...marks].sort((a, b) => a.at - b.at);
    const counts = Object.fromEntries(orderedMarks.map(({ name }) => [name, {} as Record<string, number>]));
    const count = (key: string, at: number) => {
      const phase = orderedMarks.findLast((mark) => mark.at <= at)?.name;
      if (phase === undefined) return;
      const bucket = counts[phase]!;
      bucket[key] = (bucket[key] ?? 0) + 1;
    };
    for (const call of requests) {
      const phase = call.phase === "finished" && (call.status ?? 0) >= 400 ? "http-error" : call.phase;
      count(`${call.capability}.${phase}`, call.at);
    }
    for (const event of engineEvents) count(event.type, event.at);
    return { marks: orderedMarks, counts, pending: [...tracked.values()], scroll };
  };

  return {
    mark,
    recordScroll(result: NonNullable<typeof scroll>) {
      scroll = result;
      mark("scroll-start", result.scrollStart);
      mark("scroll-end", result.scrollEnd);
    },
    async finishProfile() {
      if (!cdp || !profiling) return;
      try {
        const { profile } = await cdp.send("Profiler.stop");
        mark("profile-stopped");
        for (const { callFrame } of profile.nodes) callFrame.url = callFrame.url.split(/[?#]/, 1)[0] ?? "";
        await info.attach("task-scroll-renderer.cpuprofile", { body: JSON.stringify(profile), contentType: "application/json" });
      } catch {
        mark("profile-save-failed");
      }
    },
    async attach(stage: "before-close" | "after-close") {
      const data = summary();
      if (stage === "before-close") console.error("[perf-diagnostics] task scroll", JSON.stringify(data));
      try {
        await info.attach(`task-scroll-${stage}.json`, { body: JSON.stringify({ ...data, requests, engineEvents }, null, 2), contentType: "application/json" });
      } catch {
        console.error("[perf-diagnostics] task scroll attachment unavailable", stage);
      }
    },
  };
}

export async function observeTaskQuit(app: ElectronApplication, vault: string) {
  const prefix = "[huhu-task-quit] ";
  const child = app.process();
  let stderrRemainder = "";
  child?.stderr?.on("data", (chunk: Buffer | string) => {
    const lines = (stderrRemainder + chunk.toString()).split("\n");
    stderrRemainder = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith(prefix)) process.stderr.write(`${line}\n`);
    }
  });
  child?.once("exit", (code, signal) => {
    console.error(prefix + JSON.stringify({ event: "desktop-process-exit", at: Date.now(), code, signal }));
  });

  try {
    // The isolated Vault has one writer. Read only its PID from the descriptor.
    const runtime = path.join(vault, ".huhu", "runtime");
    let engine: { descriptor: string; pid: number } | undefined;
    const entries = existsSync(runtime) ? readdirSync(runtime, { withFileTypes: true }) : [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const descriptor = path.join(runtime, entry.name, "engine.json");
      try {
        const { pid } = JSON.parse(readFileSync(descriptor, "utf8")) as { pid: number };
        if (Number.isSafeInteger(pid) && pid > 0) engine = { descriptor, pid };
      } catch {
        // No usable descriptor in this runtime directory.
      }
    }

    await app.evaluate(
      ({ app, dialog, ipcMain }, { prefix, engine }) => {
        const log = (event: string, details: object = {}) => {
          process.stderr.write(prefix + JSON.stringify({ event, at: Date.now(), ...details }) + "\n");
        };
        const fs = process.getBuiltinModule("node:fs") as typeof import("node:fs");
        let engineRunning = Boolean(engine);
        let descriptorPresent = Boolean(engine);
        let timer: ReturnType<typeof setInterval> | undefined;
        const checkEngine = () => {
          if (!engine || !engineRunning) return;
          if (descriptorPresent && !fs.existsSync(engine.descriptor)) {
            descriptorPresent = false;
            log("engine-descriptor-removed", { pid: engine.pid });
          }
          try {
            process.kill(engine.pid, 0);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") return;
            engineRunning = false;
            clearInterval(timer);
            log("engine-process-exit-observed", { pid: engine.pid, descriptorPresent });
          }
        };
        log("main-observers-attached", { chromium: process.versions["chrome"], enginePid: engine?.pid ?? null });
        app.on("before-quit", (event) => {
          log("before-quit", { defaultPrevented: event.defaultPrevented });
          checkEngine();
          if (engineRunning && !timer) timer = setInterval(checkEngine, 100).unref();
        });
        app.on("will-quit", () => {
          checkEngine();
          log("will-quit", { engineRunning });
        });
        app.on("quit", (_event, exitCode) => {
          checkEngine();
          log("quit", { exitCode, engineRunning });
        });
        ipcMain.on("huhu:exit-progress", (_event, requestId: unknown, status: unknown) => {
          if (typeof requestId !== "number") return;
          log("huhu:exit-progress", { requestId, status: status === "checking" || status === "waiting" || status === "flushing" ? status : "unexpected" });
        });
        ipcMain.on("huhu:flushed", (_event, requestId: unknown, reply: unknown) => {
          if (typeof requestId !== "number") return;
          let status = "unexpected";
          if (reply === "stay") status = "stay";
          else if (reply === false) status = "false";
          else if (reply && typeof reply === "object" && "files" in reply && "drafts" in reply) status = "failed" in reply && reply.failed === true ? "failed" : "saved";
          log("huhu:flushed", { requestId, status });
        });
        const showMessageBox = dialog.showMessageBox.bind(dialog);
        dialog.showMessageBox = (...args: [Electron.MessageBoxOptions] | [Electron.BaseWindow, Electron.MessageBoxOptions]) => {
          const title = (args.length === 1 ? args[0] : args[1]).title;
          const kind = title === "无法确认退出" || title === "无法确认退出前的保存结果" || title === "退出前保存失败" ? title : "other";
          log("dialog-shown", { kind });
          const result = args.length === 1 ? showMessageBox(args[0]) : showMessageBox(args[0], args[1]);
          void result.then(
            ({ response, checkboxChecked }) => log("dialog-resolved", { kind, response, checkboxChecked }),
            () => log("dialog-rejected", { kind }),
          );
          return result;
        };
      },
      { prefix, engine },
    );
  } catch {
    console.error(prefix + JSON.stringify({ event: "main-observers-unavailable", at: Date.now() }));
  }
}
