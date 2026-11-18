// Diagnostic only. Copy the built app so production startup and the timing benchmark remain untouched.
import { _electron as electron } from "@playwright/test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const [desktop, output = desktop && path.join(desktop, "out")] = args.filter((arg) => arg !== "--profile-reload");
if (!desktop || !output) throw new Error("Usage: node scripts/trace-notes-startup.mjs <desktop path> [out path]");
const root = mkdtempSync(path.join(tmpdir(), "huhu-cold-trace-"));
const vault = path.join(root, "vault");
try {
  mkdirSync(vault);
  for (let i = 0; i < 40; i++) {
    const folder = path.join(vault, `文件夹${i}`);
    mkdirSync(folder);
    for (let j = 0; j < 50; j++) writeFileSync(path.join(folder, `笔记${j}.md`), "启动测量样本\n");
  }
  cpSync(output, path.join(root, "out"), { recursive: true });
  symlinkSync(path.resolve(desktop, "node_modules"), path.join(root, "node_modules"), "junction");
  symlinkSync(path.resolve(desktop, "resources"), path.join(root, "resources"), "junction");
  const html = path.join(root, "out/renderer/index.html");
  writeFileSync(html, readFileSync(html, "utf8").replace("</head>", '<script src="./cold-trace.js"></script></head>'));
  writeFileSync(
    path.join(root, "out/renderer/cold-trace.js"),
    `
    performance.mark("trace-head");
    const markHome = new MutationObserver(() => {
      if (!document.querySelector('[data-testid="home-module"]')) return;
      performance.mark("trace-home");
      markHome.disconnect();
    });
    markHome.observe(document.documentElement, { childList: true, subtree: true });
  `,
  );
  const metadata = JSON.parse(readFileSync(path.resolve(desktop, "package.json"), "utf8"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ ...metadata, main: "./trace-main.mjs" }));
  writeFileSync(
    path.join(root, "trace-main.mjs"),
    `
    import { app } from "electron";
    const stages = { probeStartedMs: performance.now() };
    const mark = (name) => { stages[name] ??= performance.now(); };
    app.whenReady().then(() => mark("appReadyMs"));
    app.on("browser-window-created", (_e, win) => {
      mark("windowCreatedMs");
      win.once("ready-to-show", () => mark("readyToShowMs"));
      win.webContents.once("did-start-navigation", () => mark("navigationCallMs"));
      win.webContents.once("did-finish-load", () => mark("didFinishLoadMs"));
    });
    globalThis.readStartupTrace = () => ({ stages, timeOrigin: performance.timeOrigin });
    await import("./out/main/index.js");
  `,
  );

  const app = await electron.launch({ args: [root, "--no-sandbox", `--user-data-dir=${path.join(root, "profile")}`], env: { ...process.env, HUHU_VAULT: vault } });
  try {
    app.process().stderr?.on("data", (data) => process.stderr.write(data));
    const page = await app.firstWindow();
    const waitForHome = async () => {
      await page.getByTestId("home-module").waitFor();
      await page.waitForFunction(() => document.querySelector('[data-testid="engine-state"]')?.textContent === "引擎就绪");
    };
    await waitForHome();

    const renderer = await page.evaluate(() => ({
      timeOrigin: performance.timeOrigin,
      entries: performance
        .getEntriesByType("mark")
        .concat(performance.getEntriesByType("paint"))
        .map(({ name, startTime }) => ({ name, startTime })),
      navigation: performance.getEntriesByType("navigation")[0]?.toJSON(),
    }));
    const startup = await app.evaluate(() => globalThis.readStartupTrace());
    const cdp = await page.context().newCDPSession(page);
    const parsed = new Set();
    cdp.on("Debugger.scriptParsed", ({ url }) => {
      if (url.includes("/assets/")) parsed.add(path.basename(new URL(url).pathname));
    });
    await cdp.send("Debugger.enable");
    await cdp.send("Debugger.disable");
    const styles = await page.evaluate(() => [...document.styleSheets].flatMap(({ href }) => (href?.includes("/assets/") ? [new URL(href).pathname.split("/").at(-1)] : [])));
    const assetBytes = Object.fromEntries([...new Set([...parsed, ...styles])].map((name) => [name, statSync(path.join(output, "renderer/assets", name)).size]));
    let reloadCpuByAssetMs;
    if (args.includes("--profile-reload")) {
      // Separate estimation of renderer script CPU. Navigation cache is disabled,
      // but the running Electron and engine processes stay warm.
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.start");
      await page.reload();
      await waitForHome();
      const { profile } = await cdp.send("Profiler.stop");
      const urls = new Map(profile.nodes.map(({ id, callFrame }) => [id, callFrame.url]));
      reloadCpuByAssetMs = {};
      for (const [index, id] of profile.samples.entries()) {
        const url = urls.get(id);
        if (!url?.includes("/assets/")) continue;
        const name = path.basename(new URL(url).pathname);
        reloadCpuByAssetMs[name] = (reloadCpuByAssetMs[name] ?? 0) + profile.timeDeltas[index] / 1000;
      }
    }
    console.log(JSON.stringify({ desktop, output, ...startup, renderer, assetBytes, reloadCpuByAssetMs }));
  } finally {
    await app.close();
  }
} finally {
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
