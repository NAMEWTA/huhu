import { chromium, expect, test, type Browser } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem } from "../helpers/tree.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";

const fileName = "JSON 保真.json";
const invalidName = "JSON 语法错误.json";
const original = "\ufeff" + String.raw`{"2":9007199254740993,"1":1e+309,"2":-0,"a":[{"s":"  \u0061\t [,}]  "}]}` + "\r\n";
const formatted = [
  "\ufeff{",
  '  "2": 9007199254740993,',
  '  "1": 1e+309,',
  '  "2": -0,',
  '  "a": [',
  "    {",
  String.raw`      "s": "  \u0061\t [,}]  "`,
  "    }",
  "  ]",
  "}",
  "",
].join("\r\n");
const invalid = '{"a": 1,}\n';

for (const surface of ["Linux 桌面", "独立 Web"]) {
  test(`F05 ${surface}：JSON 格式化自动保存、重开和单次撤销保持原字面值`, async () => {
    const desktop = await openApp({}, (vault) => {
      writeFileSync(path.join(vault, fileName), original);
      writeFileSync(path.join(vault, invalidName), invalid);
    });
    let browser: Browser | undefined;
    try {
      await engineReady(desktop.page);
      await call(desktop.page, "settings.update", { patch: { editor: { autosave: true } } });
      let page = desktop.page;
      if (surface === "独立 Web") {
        const { addresses } = await call<{ addresses: { url: string }[] }>(desktop.page, "web.share.start", { mode: "local", port: 0 });
        const { links } = await call<{ links: string[] }>(desktop.page, "web.invitations.create", {});
        const url = new URL(links[0]!);
        expect(url.origin).toBe(new URL(addresses[0]!.url).origin);
        browser = await chromium.launch({ headless: true });
        page = await browser.newPage();
        await page.goto(url.href);
        await expect(page.getByTestId("home-dashboard")).toBeVisible();
      }

      await page.getByRole("button", { name: "知识库", exact: true }).first().click();
      await page.getByTestId("notes-section-all").click();
      await treeItem(page, fileName).click();
      const jsonFormat = page.getByTestId("file-format-json");
      const read = () => readFileSync(path.join(desktop.vault, fileName));
      await jsonFormat.click();
      await expect(page.getByTestId("file-format-note")).toContainText("已格式化");
      await expect.poll(read).toEqual(Buffer.from(formatted));

      const editor = page.getByTestId("plain-text-editor").locator(".cm-content");
      await editor.focus();
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(read).toEqual(Buffer.from(original));

      await jsonFormat.click();
      await expect.poll(read).toEqual(Buffer.from(formatted));
      await page.getByRole("button", { name: `关闭 ${fileName}`, exact: true }).click();
      await treeItem(page, fileName).click();
      await expect.poll(async () => (await editor.locator(".cm-line").allTextContents()).join("\r\n")).toBe(formatted.slice(1));
      expect(read()).toEqual(Buffer.from(formatted));

      await treeItem(page, invalidName).click();
      await expect(page.getByTestId("file-diagnostic")).toContainText("JSON 语法错误");
      await expect(jsonFormat).toBeDisabled();
      expect(readFileSync(path.join(desktop.vault, invalidName))).toEqual(Buffer.from(invalid));
    } finally {
      try {
        await browser?.close();
      } finally {
        await desktop.close();
      }
    }
  });
}
