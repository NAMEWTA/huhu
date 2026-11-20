import { chromium, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

const edge = process.platform === "win32" ? path.join(process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe") : "";
export const browserBinary = [chromium.executablePath(), edge].find((file) => file && existsSync(file));

export async function localWebLink(page: Page) {
  await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
  await page.getByRole("tab", { name: "服务端" }).click();
  const share = page.getByTestId("web-share-panel");
  await expect(share.getByRole("combobox", { name: "分享范围" })).toHaveValue("local");
  await share.getByRole("button", { name: "启动分享" }).click();
  await expect(share.getByText("运行中", { exact: true })).toBeVisible();
  await share.getByRole("button", { name: "创建邀请" }).click();
  const invite = page.getByRole("dialog", { name: "Web 邀请链接" });
  const link = await invite.getByRole("textbox", { name: /^邀请链接 127.0.0.1:/ }).inputValue();
  if (new URL(link).hostname !== "127.0.0.1") throw new Error("Web 测试需要回环地址");
  await invite.getByRole("button", { name: "完成" }).click();
  return link;
}

export async function desktopCall<T>(page: Page, capability: string, input: unknown = {}): Promise<T> {
  const response = await page.evaluate(
    async ({ capability, input }) => {
      const { baseUrl, token } = await (window as unknown as { huhuHost: { engine(): Promise<{ baseUrl: string; token: string }> } }).huhuHost.engine();
      const res = await fetch(`${baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
      });
      return res.json() as Promise<{ ok: true; data: unknown } | { ok: false; error: { code: string } }>;
    },
    { capability, input },
  );
  if (!response.ok) throw new Error(`${capability}: ${response.error.code}`);
  return response.data as T;
}
