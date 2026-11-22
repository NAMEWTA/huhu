import { chromium, expect, test as base, type Browser, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { TaskDto } from "../../../packages/contracts/src/index.js";
import { openCandidateDesktop, withFixtureCleanup, withFixtureDeadline } from "../helpers/candidate-desktop.js";
import { disposeCandidate } from "../helpers/candidate-package.js";
import { call } from "../knowledge/session-slow-bridge.js";

type Candidate = Awaited<ReturnType<typeof openCandidateDesktop>>;
type WebFixture = { desktop: Candidate; web: Page; origin: string; join: () => Promise<void> };
type ShellSession = { id: string; spaceId: string; terminalId: string | null; provider: string; state: string };

const test = base.extend<{ openWebFixture: (identityAttachment: string) => Promise<WebFixture> }>({
  openWebFixture: [
    async ({ browserName }, use) => {
      void browserName;
      let desktopLaunch: Promise<Candidate> | undefined;
      let browserLaunch: Promise<Browser> | undefined;
      let web: Page | undefined;
      let tearingDown = false;
      const requireActive = () => {
        if (tearingDown) throw new Error("Web 候选夹具已开始清理");
      };
      const open = async (identityAttachment: string): Promise<WebFixture> => {
        requireActive();
        desktopLaunch = openCandidateDesktop({ identityAttachment, disableProviderDetection: true });
        const desktop = await desktopLaunch;
        requireActive();
        const share = await call<{ state: string; addresses: { url: string }[] }>(desktop.page, "web.share.start", { mode: "local", port: 0 });
        expect(share).toMatchObject({ state: "running", addresses: [{ url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/u) }] });
        const origin = new URL(share.addresses[0]!.url).origin;
        requireActive();
        const invite = await call<{ links: string[] }>(desktop.page, "web.invitations.create", {});
        requireActive();
        browserLaunch = chromium.launch({ headless: true, env: desktop.env, timeout: 20_000 });
        const browser = await browserLaunch;
        requireActive();
        const context = await browser.newContext();
        const page = await context.newPage();
        requireActive();
        web = page;
        const join = async () => {
          try {
            const target = new URL(invite.links[0]!);
            if (target.origin !== origin || target.username || target.password) throw new Error("邀请来源不符");
            await page.goto(target.href);
          } catch {
            throw new Error("无法打开本夹具的回环 Web 邀请");
          }
          await expect(page.getByTestId("home-dashboard")).toBeVisible();
          expect(new URL(page.url()).hash === "", "加入后应移除邀请片段").toBe(true);
        };
        return { desktop, web: page, origin, join };
      };

      await withFixtureCleanup(
        () => use(open),
        [
          [
            "移除浏览器路由",
            async () => {
              tearingDown = true;
              const page = web;
              if (page) await withFixtureDeadline(3_000, () => page.unrouteAll({ behavior: "ignoreErrors" }));
            },
          ],
          [
            "关闭独立 Chromium",
            () =>
              withFixtureDeadline(25_000, async () => {
                const browser = await browserLaunch?.catch(() => undefined);
                await browser?.close();
              }),
          ],
          [
            "关闭候选桌面并回收本夹具 Core",
            () =>
              withFixtureDeadline(85_000, async () => {
                const desktop = await desktopLaunch?.catch(() => undefined);
                await desktop?.close();
              }),
          ],
        ],
      );
    },
    // The body can time out while resources are open or a launch is pending.
    { timeout: 120_000 },
  ],
});

test.skip(process.env["HUHU_WEB_TERMINAL_WIDGET_ACCEPTANCE"] !== "1", "通过隔离的候选安装包包装器运行");
test.use({ trace: "off", screenshot: "off", video: "off" });
test.afterAll(disposeCandidate);

async function openAgent(page: Page) {
  await page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
  await expect(page.getByTestId("agent-cli-module")).toBeVisible();
}

function sessionTerminal(page: Page, sessionId: string) {
  return page
    .getByTestId("workspace-pane")
    .and(page.locator(`[data-session-id="${sessionId}"]`))
    .getByTestId("terminal-view");
}

async function printShellPid(terminal: Locator, label: string) {
  await terminal.locator(".xterm-helper-textarea").focus();
  await terminal.page().keyboard.type(`printf '${label}:%s\\n' "$$"`);
  await terminal.page().keyboard.press("Enter");
}

type RawObserverSamples = { size: string; intervalMs: number; samplesBeforeSignal: number; samplesAfterSignal: number };

async function probeRawObserver({ desktop, terminal, web, url, pid, controllerTraffic }: { desktop: Candidate; terminal: Locator; web: Page; url: string; pid: number; controllerTraffic: () => number }) {
  const directory = path.join(path.dirname(desktop.vault), "raw-observer");
  mkdirSync(directory, { mode: 0o700 });
  const script = path.join(directory, "sample.sh");
  const baseline = path.join(directory, "baseline");
  const framesSent = path.join(directory, "frames-sent");
  const intervalMs = 50;
  const sampleCount = 20;
  const resize = { type: "resize", cols: 333, rows: 37 };
  const inputMarker = `raw-observer:${pid}`;
  const sizePattern = /^[1-9]\d* [1-9]\d*$/u;
  // A background job reads the same PTY while the interactive shell stays ready for input.
  // Start before attaching the probe, and keep sampling for a full second after both sends.
  // GNU stty touches terminal attributes even for a size query; keep this sampler
  // from being suspended by background-job control without changing the interactive shell.
  writeFileSync(
    script,
    `set -eu
trap '' TTOU
cd "$(dirname "$0")"
size=$(stty size </dev/tty)
printf '%s\\n' "$size" > before-signal
printf '%s\\n' "$size" > baseline
while [ ! -e frames-sent ]; do
  stty size </dev/tty >> before-signal
  sleep ${intervalMs / 1_000}
done
sample=0
while [ "$sample" -lt ${sampleCount} ]; do
  sleep ${intervalMs / 1_000}
  stty size </dev/tty >> after-signal
  sample=$((sample + 1))
done
touch complete
`,
  );
  await terminal.locator(".xterm-helper-textarea").focus();
  await desktop.page.keyboard.type(`timeout 15s sh '${script}' &`);
  await desktop.page.keyboard.press("Enter");
  const readBaseline = () => (existsSync(baseline) ? readFileSync(baseline, "utf8").trim() : "");
  await expect.poll(readBaseline).toMatch(sizePattern);
  const size = readBaseline();
  expect(size).not.toBe(`${resize.rows} ${resize.cols}`);
  const initialControllerTraffic = controllerTraffic();
  expect(initialControllerTraffic, "已记录同一会话的桌面控制帧").toBeGreaterThan(1);

  await web.exposeFunction("verifyRawObserverWindow", async () => {
    writeFileSync(framesSent, "", { flag: "wx" });
    await expect.poll(() => existsSync(path.join(directory, "complete")), { timeout: 5_000, intervals: [50] }).toBe(true);
    const readSizes = (file: string) => readFileSync(path.join(directory, file), "utf8").trimEnd().split("\n");
    const beforeSignal = readSizes("before-signal");
    const afterSignal = readSizes("after-signal");
    expect(afterSignal).toHaveLength(sampleCount);
    expect(
      [...beforeSignal, ...afterSignal].filter((sample) => sample !== size),
      "观察窗口内 PTY 的完整行列值应保持一致",
    ).toEqual([]);
    expect(controllerTraffic(), "采样期间桌面控制连接应保持打开且不发送终端帧").toBe(initialControllerTraffic);
    expect(await terminal.locator(".xterm-rows").textContent({ timeout: 2_000 })).not.toContain(inputMarker);
    return { size, intervalMs, samplesBeforeSignal: beforeSignal.length, samplesAfterSignal: afterSignal.length };
  });

  const probe = await web.evaluate(
    ({ url, inputMarker, resize }) => {
      const { verifyRawObserverWindow } = window as unknown as Window & { verifyRawObserverWindow: () => Promise<RawObserverSamples> };
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      const decoder = new TextDecoder();
      type Observation = RawObserverSamples & { windowMs: number };
      return new Promise<Observation & { observed: boolean; replayed: boolean; wasClean: boolean; closeCode: number }>((resolve, reject) => {
        let observed = false;
        let replayed = false;
        let sentAt: number | undefined;
        let result: Observation | undefined;
        let tail = "";
        const timer = setTimeout(() => fail(new Error("观察者协议探针超时")), 10_000);
        function fail(error: unknown) {
          clearTimeout(timer);
          socket.close();
          reject(error);
        }

        socket.onmessage = ({ data }) => {
          if (typeof data === "string") {
            observed ||= data === JSON.stringify({ type: "mode", mode: "observe" });
            if (data === JSON.stringify({ type: "mode", mode: "control-free" }) || data === JSON.stringify({ type: "mode", mode: "control" })) {
              fail(new Error("探针连接在观察窗口内收到控制权通知"));
              return;
            }
          } else if (data instanceof ArrayBuffer && data.byteLength > 0) {
            replayed = true;
            if (sentAt !== undefined) {
              tail += decoder.decode(data, { stream: true });
              if (tail.includes(inputMarker)) {
                fail(new Error("原始观察者输入到达了 shell"));
                return;
              }
              tail = tail.slice(1 - inputMarker.length);
            }
          }
          // The observe notification and PTY replay establish attachment before either send.
          if (observed && replayed && sentAt === undefined) {
            socket.send(new TextEncoder().encode("printf 'raw-observer:%s\\n' \"$$\"\r"));
            socket.send(JSON.stringify(resize));
            const startedAt = performance.now();
            sentAt = startedAt;
            void verifyRawObserverWindow()
              .then((samples) => {
                if (socket.readyState !== WebSocket.OPEN) throw new Error("完成采样前观察连接已关闭");
                if (socket.bufferedAmount !== 0) throw new Error("采样结束时探针仍有未发送的数据");
                result = { ...samples, windowMs: Math.round(performance.now() - startedAt) };
                socket.close(1000, "observer probe complete");
              })
              .catch(fail);
          }
        };
        socket.onerror = () => fail(new Error("观察者协议探针连接失败"));
        socket.onclose = ({ wasClean, code }) => {
          clearTimeout(timer);
          if (!result || !wasClean || code !== 1000) {
            reject(new Error(`观察者协议探针未正常完成（关闭码 ${code}，正常关闭 ${wasClean}）`));
            return;
          }
          resolve({ ...result, observed, replayed, wasClean, closeCode: code });
        };
      });
    },
    { url, inputMarker, resize },
  );
  expect(controllerTraffic()).toBe(initialControllerTraffic);
  expect(probe.windowMs).toBeGreaterThanOrEqual(intervalMs * sampleCount);
  return { ...probe, requestedSize: { rows: resize.rows, cols: resize.cols } };
}

test("G7.2 同包 Web Agent 观察、接管并刷新原 shell 会话", async ({ openWebFixture }, testInfo) => {
  test.setTimeout(150_000);
  const { desktop, web, origin, join } = await openWebFixture("web-shell-candidate-identity");
  await join();
  const { page } = desktop;
  const desktopSocketEvents = new Map<string, number>();
  page.on("websocket", (socket) => {
    const pathname = new URL(socket.url()).pathname;
    if (!pathname.startsWith("/ws/terminal/")) return;
    const record = () => {
      desktopSocketEvents.set(pathname, (desktopSocketEvents.get(pathname) ?? 0) + 1);
    };
    record();
    socket.on("framesent", record);
    socket.on("close", record);
  });
  await openAgent(page);
  await page.getByTestId("workspace-pane-launch").click();
  await page.getByTestId("launch-shell").click();
  await expect(page.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 20_000 });
  const sessions = () => call<ShellSession[]>(page, "agent.sessions.list", {});
  await expect.poll(sessions).toMatchObject([{ provider: "shell", state: "running", terminalId: expect.any(String) }]);
  const { id, spaceId, terminalId } = (await sessions())[0]!;
  const desktopTerminal = sessionTerminal(page, id);
  const desktopRows = desktopTerminal.locator(".xterm-rows");
  const webTerminal = sessionTerminal(web, id);
  const webRows = webTerminal.locator(".xterm-rows");

  await printShellPid(desktopTerminal, "before-web");
  await expect(desktopRows).toContainText(/before-web:[1-9]\d*/u);
  const pid = Number((await desktopRows.textContent())?.match(/before-web:([1-9]\d*)/u)?.[1]);
  expect(pid).toBeGreaterThan(0);
  const core = await desktop.confirmCore();

  let serverObserverMode = false;
  let serverControlReleased = false;
  const observerModeFrame = JSON.stringify({ type: "mode", mode: "observe" });
  const controlReleasedFrame = JSON.stringify({ type: "mode", mode: "control-free" });
  const terminalSocket = new URL(`/ws/terminal/${encodeURIComponent(id)}`, origin.replace(/^http/u, "ws"));
  web.on("websocket", (socket) => {
    const url = new URL(socket.url());
    if (url.origin !== terminalSocket.origin || url.pathname !== terminalSocket.pathname) return;
    socket.on("framereceived", ({ payload }) => {
      if (payload === observerModeFrame) serverObserverMode = true;
      if (payload === controlReleasedFrame) serverControlReleased = true;
    });
  });
  await openAgent(web);
  await expect(webTerminal).toHaveAttribute("data-state", "open", { timeout: 20_000 });
  await expect(webTerminal.getByTestId("terminal-observer")).toBeVisible();
  await expect.poll(() => serverObserverMode, { message: "候选 Engine 应向同一会话的 Web socket 发送观察态通知" }).toBe(true);
  await printShellPid(webTerminal, "observer-input");
  await printShellPid(desktopTerminal, "desktop-control");
  await expect(webRows).toContainText(`desktop-control:${pid}`);
  await expect(desktopRows).not.toContainText(`observer-input:${pid}`);

  const directObserver = await probeRawObserver({
    desktop,
    terminal: desktopTerminal,
    web,
    url: terminalSocket.href,
    pid,
    controllerTraffic: () => desktopSocketEvents.get(terminalSocket.pathname) ?? 0,
  });

  await page.getByRole("button", { name: "工作台", exact: true }).first().click();
  await expect(desktopTerminal).toHaveCount(0);
  await expect.poll(() => serverControlReleased, { message: "候选 Engine 应通知观察者接管同一会话" }).toBe(true);
  await expect(webTerminal.getByTestId("terminal-observer")).toHaveCount(0);
  await expect(webRows).toContainText(`desktop-control:${pid}`);
  await printShellPid(webTerminal, "web-control");
  await expect(webRows).toContainText(`web-control:${pid}`);

  await web.reload();
  await expect(web.getByTestId("home-dashboard")).toBeVisible();
  await openAgent(web);
  await expect(webTerminal).toHaveAttribute("data-state", "open", { timeout: 20_000 });
  await expect(webRows).toContainText(`web-control:${pid}`);
  await printShellPid(webTerminal, "web-reloaded");
  await expect(webRows).toContainText(`web-reloaded:${pid}`);
  await expect(webRows).not.toContainText(`observer-input:${pid}`);
  await expect(webRows).not.toContainText(`raw-observer:${pid}`);
  await expect.poll(sessions).toMatchObject([{ id, spaceId, terminalId, provider: "shell", state: "running" }]);
  expect((await desktop.confirmCore()).pid).toBe(core.pid);
  await testInfo.attach("web-shell-session", {
    body: JSON.stringify({ origin, corePid: core.pid, sessionId: id, spaceId, terminalId, shellPid: pid, serverObserverMode, serverControlReleased, directObserver }),
    contentType: "application/json",
  });
});

function observeWebCalls(web: Page, origin: string) {
  const capabilities: string[] = [];
  web.on("request", (request) => {
    if (request.url() !== `${origin}/api/v1/call` || request.method() !== "POST") return;
    const { capability } = request.postDataJSON() as { capability: string };
    capabilities.push(capability);
  });
  return capabilities;
}

// A real invitation has workbench permissions. Filter the authenticated browser's
// discovery response to exercise UI degradation while leaving business calls live.
async function hideDiscoveredCapability(web: Page, origin: string, hidden: string) {
  let presentInOriginal = false;
  await web.route(
    (url) => url.origin === origin && url.pathname === "/api/v1/capabilities",
    async (route) => {
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const capabilities = (await response.json()) as { name: string }[];
      presentInOriginal ||= capabilities.some(({ name }) => name === hidden);
      await route.fulfill({ response, json: capabilities.filter(({ name }) => name !== hidden) });
    },
  );
  return () => presentInOriginal;
}

test("W05-W06 浏览器卡片退化：缺少读取能力时仅停用该卡片", async ({ openWebFixture }) => {
  test.setTimeout(120_000);
  const { desktop, web, origin, join } = await openWebFixture("web-widget-read-candidate-identity");
  const title = "另一张卡片仍可完成的任务";
  const { id } = await call<TaskDto>(desktop.page, "tasks.create", { title });
  const calls = observeWebCalls(web, origin);
  const read = "home.notes.recent";
  const removed = await hideDiscoveredCapability(web, origin, read);
  await join();

  const notesTile = web.getByTestId("home-dashboard").locator('[data-instance-id="default-notes"]');
  await expect(notesTile).toContainText("当前连接没有卡片所需的读取权限");
  expect(removed(), "已过滤真实能力目录中的最近笔记读取项").toBe(true);
  await expect(notesTile.getByTestId("card-recent")).toHaveCount(0);
  const tasks = web.getByTestId("card-tasks");
  await expect(tasks.getByText(title, { exact: true })).toBeVisible();
  await tasks.getByRole("button", { name: `完成任务 ${title}`, exact: true }).click();
  await expect(tasks.getByText(title, { exact: true })).toHaveCount(0);
  expect(await call<TaskDto>(desktop.page, "tasks.read", { id })).toMatchObject({ id, status: "completed" });
  expect(calls).toEqual(expect.arrayContaining(["tasks.list", "tasks.setStatus"]));
  expect(calls).not.toContain(read);
});

test("W05-W06 浏览器卡片退化：撤回写能力后仍可读取且不发写请求", async ({ openWebFixture }) => {
  test.setTimeout(120_000);
  const { desktop, web, origin, join } = await openWebFixture("web-widget-write-candidate-identity");
  const title = "撤回写能力后仍可读的任务";
  const { id } = await call<TaskDto>(desktop.page, "tasks.create", { title });
  const original = await call<TaskDto>(desktop.page, "tasks.read", { id });
  await join();
  const tasks = web.getByTestId("card-tasks");
  const complete = tasks.getByRole("button", { name: `完成任务 ${title}`, exact: true });
  await expect(complete).toBeEnabled();

  const calls = observeWebCalls(web, origin);
  const write = "tasks.setStatus";
  const removed = await hideDiscoveredCapability(web, origin, write);
  await web.reload();
  await expect(tasks.getByText(title, { exact: true })).toBeVisible();
  await expect(complete).toBeDisabled();
  expect(removed(), "已过滤真实能力目录中的任务状态写入项").toBe(true);
  await complete.click({ force: true });
  await tasks.getByRole("button", { name: `打开任务 ${title}`, exact: true }).click();
  await expect(web.getByTestId("detail-title")).toHaveText(title);
  expect(calls).toContain("tasks.list");
  expect(calls).not.toContain(write);
  expect(await call<TaskDto>(desktop.page, "tasks.read", { id })).toMatchObject({ id, status: original.status, version: original.version });
});
