import { beforeEach, expect, test, vi } from "vitest";
import { externalHttpUrl, confirmExternalLink } from "../src/main/external-link";

const electron = vi.hoisted(() => ({
  dialog: { showMessageBox: vi.fn() },
  shell: { openExternal: vi.fn() },
}));
vi.mock("electron", () => electron);

beforeEach(() => {
  vi.resetAllMocks();
  electron.shell.openExternal.mockResolvedValue(undefined);
});

test.each([
  ["https://Example.com:443/help", "https://example.com/help"],
  ["http://example.com:8080", "http://example.com:8080/"],
  ["https://user:token@example.com", null],
  ["http:example.com", null],
  ["file:///note", null],
  ["/a-link", null],
  ["https://example.com/\na", null],
  [42, null],
])("external HTTP link accepts and normalizes %s as %s", (input, want) => {
  expect(externalHttpUrl(input)).toBe(want);
});

test.each([
  { choice: 0, stillCurrent: true, opens: false },
  { choice: 1, stillCurrent: false, opens: false },
  { choice: 1, stillCurrent: true, opens: true },
  { choice: 1, stillCurrent: true, opens: true, shellFails: true },
])("native external-link confirmation only opens a current, confirmed request", async ({ choice, stillCurrent, opens, shellFails }) => {
  const url = "https://example.com/preview";
  const win = { isDestroyed: () => false } as Parameters<typeof confirmExternalLink>[0];
  let current = true;
  electron.dialog.showMessageBox.mockImplementationOnce(async () => {
    current = stillCurrent;
    return { response: choice };
  });
  if (shellFails) electron.shell.openExternal.mockRejectedValueOnce(new Error("No browser handler"));
  await expect(confirmExternalLink(win, url, () => current)).resolves.toBe(opens && !shellFails);
  expect(electron.dialog.showMessageBox).toHaveBeenCalledWith(win, expect.objectContaining({ detail: url, defaultId: 0 }));
  if (opens) expect(electron.shell.openExternal).toHaveBeenCalledExactlyOnceWith(url);
  else expect(electron.shell.openExternal).not.toHaveBeenCalled();
  if (shellFails) {
    expect(electron.dialog.showMessageBox).toHaveBeenNthCalledWith(2, win, {
      type: "error",
      message: "无法在系统浏览器中打开链接",
      detail: url,
    });
  } else {
    expect(electron.dialog.showMessageBox).toHaveBeenCalledTimes(1);
  }
});
