import { _electron, expect, test } from "@playwright/test";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { rmTree, root } from "../helpers/launch.js";

type ProbeWindow = Window & {
  firstListingProbe: {
    ready?: () => void;
    refresh?: number;
    createReturned?: boolean;
    closeStarted?: boolean;
    closeGate: PromiseWithResolvers<void>;
    rootPaths?: string[];
    firstRootResponse?: string[];
  };
};

function instrumentChunk(assets: string, prefix: string, marker: string, replacement: string): void {
  const matches = readdirSync(assets)
    .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith(".js"))
    .map((name) => path.join(assets, name))
    .map((file) => ({ file, content: readFileSync(file, "utf8") }))
    .filter(({ content }) => content.includes(marker));
  expect(matches, `探针应只在一个 ${prefix} chunk 命中：${marker}`).toHaveLength(1);
  const { file, content } = matches[0]!;
  expect(content.split(marker)).toHaveLength(2);
  writeFileSync(file, content.replace(marker, replacement));
}

test("首次挂载与新建完成同批时，真实根目录列举和树都显示新笔记", async () => {
  const info = test.info();
  const appRoot = info.outputPath("instrumented-app");
  const vault = info.outputPath("vault");
  mkdirSync(appRoot, { recursive: true });
  mkdirSync(vault, { recursive: true });
  try {
    cpSync(path.join(root, "package.json"), path.join(appRoot, "package.json"));
    cpSync(path.join(root, "out"), path.join(appRoot, "out"), { recursive: true });
    for (const dir of ["node_modules", "resources"]) {
      const source = path.join(root, dir);
      if (existsSync(source)) symlinkSync(source, path.join(appRoot, dir), "junction");
    }
    const assets = path.join(appRoot, "out", "renderer", "assets");
    // 只在临时构建副本中控制两个现有提交的时序，真实请求、React effects 与 FileTree 保持原入口。
    instrumentChunk(assets, "explorer", "dynamicActivate(locale).then(() => live && setReady(true));", "dynamicActivate(locale).then(() => { window.firstListingProbe.ready = () => live && setReady(true); });");
    instrumentChunk(assets, "explorer", "if (refreshToken > 0) notifyExplorerChanged();", "if (refreshToken > 0) { window.firstListingProbe.refresh = refreshToken; notifyExplorerChanged(); }");
    const createCompletion = /setDialog\(null\);\s*openNote\(r\.path\);/;
    const completionCode = readdirSync(assets)
      .filter((name) => /^index-.*\.js$/.test(name))
      .flatMap((name) => readFileSync(path.join(assets, name), "utf8").match(createCompletion) ?? []);
    expect(completionCode).toHaveLength(1);
    instrumentChunk(
      assets,
      "index",
      completionCode[0]!,
      `window.firstListingProbe.createReturned = true;
      await window.firstListingProbe.closeGate.promise;
      window.firstListingProbe.closeStarted = true;
      window.firstListingProbe.ready();
      ${completionCode[0]}`,
    );
    // 固定 onHide 在此提交更新，避免依赖后台查询恰好在这个批次重建回调。
    instrumentChunk(assets, "index", "[engine, hiddenQ]);", "[engine, hiddenQ, window.firstListingProbe.closeStarted]);");
    instrumentChunk(assets, "index", "loaded.current.set(dir, state);", 'if (dir === "") window.firstListingProbe.rootPaths = state.entries.map((entry) => entry.path); loaded.current.set(dir, state);');
    const handled = "if (result === PASS_HOST_ROUTE) continue;";
    instrumentChunk(
      assets,
      "host-fetch",
      handled,
      `${handled}
      if (url.pathname === '/api/documents' && url.searchParams.get('showAll') === 'true' && !url.searchParams.get('dir') && Array.isArray(result?.documents)) {
        window.firstListingProbe.firstRootResponse ??= result.documents.map((entry) => entry.docName ?? entry.path);
      }`,
    );

    const app = await _electron.launch({ args: [appRoot, "--no-sandbox", `--user-data-dir=${info.outputPath("profile")}`], env: { ...process.env, HUHU_VAULT: vault } });
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
      await page.evaluate(() => {
        (window as unknown as ProbeWindow).firstListingProbe = { closeGate: Promise.withResolvers<void>() };
      });
      await page.getByRole("button", { name: "知识库", exact: true }).first().press("Enter");
      await expect.poll(() => page.evaluate(() => typeof (window as unknown as ProbeWindow).firstListingProbe.ready)).toBe("function");
      await expect(page.getByTestId("ok-explorer")).toHaveCount(0);
      const beforeCreate = await page.evaluate(() => (window as unknown as ProbeWindow).firstListingProbe.refresh ?? 0);
      await page.getByRole("button", { name: "新建笔记", exact: true }).first().press("Enter");
      const dialog = page.getByTestId("new-note-dialog");
      await dialog.getByLabel("文件名").fill("首次列举");
      await page.keyboard.press("Enter");
      await expect
        .poll(() =>
          page.evaluate((before) => {
            const probe = (window as unknown as ProbeWindow).firstListingProbe;
            return probe.createReturned === true && (probe.refresh ?? 0) > before;
          }, beforeCreate),
        )
        .toBe(true);
      expect(existsSync(path.join(vault, "首次列举.md"))).toBe(true);
      await expect(page.getByTestId("ok-explorer")).toHaveCount(0);
      await page.evaluate(() => (window as unknown as ProbeWindow).firstListingProbe.closeGate.resolve());
      await expect(dialog).toBeHidden();
      await expect(page.getByTestId("document-tab").filter({ hasText: "首次列举" })).toBeVisible();

      const row = page.getByTestId("notes-resource-tree").locator('[data-item-path="首次列举.md"]');
      await expect
        .poll(async () => ({
          ...(await page.evaluate(() => {
            const { firstRootResponse, rootPaths } = (window as unknown as ProbeWindow).firstListingProbe;
            return { firstRootResponse, rootPaths };
          })),
          row: await row.isVisible(),
        }))
        .toEqual({ firstRootResponse: expect.arrayContaining(["首次列举"]), rootPaths: expect.arrayContaining(["首次列举.md"]), row: true });
    } finally {
      await app.close();
    }
  } finally {
    rmTree(appRoot);
    rmTree(vault);
    rmTree(info.outputPath("profile"));
  }
});
