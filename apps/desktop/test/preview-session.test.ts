import type { Session } from "electron";
import { expect, test, vi } from "vitest";
import { previewSchemePrivileges, registerPreviewHandlers } from "../src/main/preview-session.js";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  protocol: { handle: vi.fn() },
}));

test("the document preview scheme registers only its reviewed Chromium flags", () => {
  expect(previewSchemePrivileges).toEqual({
    scheme: "huhu-preview",
    privileges: { standard: true, secure: true, corsEnabled: true },
  });
});

test.each([
  ["huhu-preview://fixture/index.html", [], true],
  ["https://example.invalid/file", ["huhu-preview://fixture/index.html", "https://example.invalid/file"], true],
  ["https://example.invalid/file", ["https://example.invalid/file"], false],
] as const)("will-download applies the preview cancellation policy to %s (%j)", (url, chain, canceled) => {
  const on = vi.fn();
  const session = {
    webRequest: { onBeforeRequest: vi.fn() },
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    on,
  } as unknown as Session;
  registerPreviewHandlers({ vaultRoot: () => null, frameAncestors: () => "huhu-app://workbench", assertTrusted: vi.fn() }, session);

  expect(on).toHaveBeenCalledWith("will-download", expect.any(Function));
  const handler = on.mock.calls.find(([event]) => event === "will-download")?.[1];
  const preventDefault = vi.fn();
  handler({ preventDefault }, { getURL: () => url, getURLChain: () => chain });
  expect(preventDefault).toHaveBeenCalledTimes(canceled ? 1 : 0);
});
