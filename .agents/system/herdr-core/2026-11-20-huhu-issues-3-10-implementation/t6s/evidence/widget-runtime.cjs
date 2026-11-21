const assert = require("node:assert/strict");
const path = require("node:path");
const { mkdtemp, writeFile, realpath, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");
const root = process.cwd();
const dependencyRoot = process.env.WIDGET_QA_DEPS ?? root;

const expected = {
  initial: ["disabled", false, false],
  enabled: ["available", true, true],
  revoked: ["unauthorized", false, false],
  disabled: ["disabled", false, false],
  reenabled: ["available", true, true],
  widgetType: "widget:ssh:hosts",
  usesSharedDefinition: true,
  usesSshComponent: true,
  hasPreload: false,
  copiedDefinition: ["rejected", null],
  handwrittenSchema: ["rejected", null],
  nestedMutation: [false, 1, true, false],
};

async function observe(page, runtime) {
  await page.waitForFunction(() => window.widgetCheck);
  const observation = await page.evaluate(() => window.widgetCheck);
  console.log(`${runtime}: ${JSON.stringify(observation)}`);
  return observation;
}

async function main() {
  const temp = await mkdtemp(path.join(tmpdir(), "huhu-t6s-widget-runtime-"));
  const playwright = require(path.join(dependencyRoot, "node_modules", ".pnpm", "node_modules", "playwright-core"));
  const vite = await import(pathToFileURL(path.join(dependencyRoot, "node_modules", ".pnpm", "node_modules", "vite", "dist", "node", "index.js")).href);
  const electronExe = process.env.WIDGET_QA_ELECTRON;
  let server, browser, electron;
  try {
    await writeFile(path.join(temp, "index.html"), '<!doctype html><meta charset="utf-8"><title>Widget contract</title><script type="module" src="/check.ts"></script>');
    await writeFile(path.join(temp, "check.ts"), `
      import { ContributionRegistry } from "widget-registry";
      import { contributions } from "ssh-ui";
      import { sshHostsWidget, sshHostsWidgetConfigSchema } from "ssh-shared";
      import { SshHomeWidget } from "ssh-home-widget";
      const registry = new ContributionRegistry();
      registry.register(contributions);
      const grants = new Set(["ssh.hosts.list"]);
      const entry = (allowed) => registry.getHomeWidgetCatalog(allowed)[0];
      const outcome = ({ status, component, capabilities }) => [status, Boolean(component), capabilities[0].allowed];
      const initial = outcome(entry(grants));
      registry.setEnabledPlugins(["ssh"]);
      const enabled = entry(grants);
      const revoked = outcome(entry(new Set()));
      registry.setEnabledPlugins([]);
      const disabled = outcome(entry(grants));
      registry.setEnabledPlugins(["ssh"]);
      const reenabled = outcome(entry(grants));

      function probeDefinition(definition) {
        const probe = new ContributionRegistry();
        const homeWidgets = [{ ...contributions.homeWidgets[0], definition }];
        try {
          probe.register({ ...contributions, homeWidgets });
        } catch (error) {
          if (!error.message.includes("defineHomeWidget")) throw error;
          if (probe.getSnapshot().modules.length || probe.getSnapshot().homeWidgets.length) {
            throw new Error("rejected widget batch changed the contribution snapshot");
          }
          return ["rejected", null];
        }
        Reflect.set(definition.defaultSize, "w", 4);
        return ["accepted", probe.getHomeWidgetCatalog(grants)[0].definition.defaultSize.w];
      }

      const copiedDefinition = probeDefinition(structuredClone(sshHostsWidget));
      const handwrittenSchema = probeDefinition({ ...sshHostsWidget, configSchema: { type: "object" } });
      const schema = enabled.definition.configSchema;
      const changed = Reflect.set(schema.properties.hostId, "minLength", 2);
      const minLength = entry(grants).definition.configSchema.properties.hostId.minLength;

      window.widgetCheck = {
        initial,
        enabled: outcome(enabled),
        revoked,
        disabled,
        reenabled,
        copiedDefinition,
        handwrittenSchema,
        nestedMutation: [
          changed,
          minLength,
          sshHostsWidgetConfigSchema.safeParse({ hostId: "a" }).success,
          sshHostsWidgetConfigSchema.safeParse({ hostId: "" }).success,
        ],
        widgetType: enabled.widgetType,
        usesSharedDefinition: enabled.definition === sshHostsWidget,
        usesSshComponent: enabled.component === SshHomeWidget,
        hasPreload: "huhuHost" in window,
      };
    `);
    const config = {
      configFile: false,
      root: temp,
      esbuild: { jsx: "automatic" },
      resolve: { alias: {
        "widget-registry": path.join(root, "packages/workbench/src/contributions.ts"),
        "ssh-ui": path.join(root, "plugins/ssh/src/ui/index.tsx"),
        "ssh-home-widget": path.join(root, "plugins/ssh/src/ui/HomeWidget.tsx"),
        "ssh-shared": path.join(root, "plugins/ssh/src/shared/index.ts"),
      } },
      build: { target: "es2023" },
      preview: { host: "127.0.0.1", port: 0 },
      logLevel: "warn",
    };
    await vite.build(config);
    server = await vite.preview(config);
    const { port } = server.httpServer.address();
    const url = "http://127.0.0.1:" + port;
    browser = await playwright.chromium.launch({ channel: "msedge", headless: true });
    const browserPage = await browser.newPage();
    browserPage.on("pageerror", (error) => console.error(error));
    await browserPage.goto(url);
    assert.match(browser.version(), /^157\./);
    const webObservation = await observe(browserPage, "Edge " + browser.version());

    const electronMain = path.join(temp, "main.cjs");
    await writeFile(electronMain, `
      const { app, BrowserWindow } = require("electron");
      app.setPath("userData", process.env.WIDGET_QA_PROFILE);
      app.whenReady().then(() => {
        const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
        void win.loadURL(process.env.WIDGET_QA_URL);
      });
    `);
    electron = await playwright._electron.launch({
      executablePath: electronExe,
      args: [electronMain],
      env: { ...process.env, WIDGET_QA_URL: url, WIDGET_QA_PROFILE: path.join(temp, "profile") },
    });
    const electronPage = await electron.firstWindow();
    electronPage.on("pageerror", (error) => console.error(error));
    const versions = await electron.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
    assert.equal(versions.electron, "44.9.1");
    assert.match(versions.chrome, /^152\./);
    const electronObservation = await observe(electronPage, "Electron " + JSON.stringify(versions));
    assert.deepEqual([webObservation, electronObservation], [expected, expected]);
    console.log("Both runtime projections passed");
  } finally {
    await electron?.close();
    await browser?.close();
    server?.httpServer.close();
    const checkedTemp = await realpath(temp);
    const checkedParent = await realpath(tmpdir());
    if (path.dirname(checkedTemp) === checkedParent && path.basename(checkedTemp).startsWith("huhu-t6s-widget-runtime-")) {
      await rm(checkedTemp, { recursive: true, force: true }).catch((error) => console.warn(error.message));
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
