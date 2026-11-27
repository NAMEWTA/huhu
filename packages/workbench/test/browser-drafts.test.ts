// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { browserDraftStorage, switchBrowserDraftScope } from "../src/state/browser-drafts.js";
import { installBrowserDraftGuard, registerDirtyDoc } from "../src/state/flushers.js";

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test("浏览器草稿按 Vault / 会话隔离，过期会话清理后旧编辑器不能再写入", () => {
  const first = { vaultId: "vault", browserSessionId: "first-session" };
  const other = { vaultId: "vault", browserSessionId: "other-session" };
  const otherVault = { vaultId: "other-vault", browserSessionId: "first-session" };
  switchBrowserDraftScope(first);
  const oldEditor = browserDraftStorage(first, "a.md")!;
  oldEditor.write("draft");
  expect(browserDraftStorage(first, "a.md")?.read()).toBe("draft");
  expect(browserDraftStorage(other, "a.md")?.read()).toBeNull();
  expect(browserDraftStorage(otherVault, "a.md")?.read()).toBeNull();
  browserDraftStorage(other, "a.md")?.write("unrelated");
  switchBrowserDraftScope(null, first);
  oldEditor.write("late");
  expect(oldEditor.read()).toBeNull();
  expect(browserDraftStorage(other, "a.md")?.read()).toBe("unrelated");
  expect(localStorage.length).toBe(1);
});

test("本地离场先结算桥缓冲，有脏输入才提示，文件保存后移除守卫", () => {
  const cleanup = installBrowserDraftGuard();
  let dirty = false;
  let onChange: (() => void) | undefined;
  const checkpoint = vi.fn(() => {
    dirty = true;
  });
  const unregister = registerDirtyDoc({
    label: "a.md",
    drain: async () => undefined,
    isDirty: () => dirty,
    save: async () => true,
    keepDraft: async () => undefined,
    checkpoint,
    subscribe(next) {
      onChange = next;
      return () => {
        onChange = undefined;
      };
    },
  });
  const unload = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  try {
    expect(unload()).toBe(false);
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    document.body.append(editor);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    expect(unload()).toBe(true);
    expect(checkpoint).toHaveBeenCalledTimes(1);
    dirty = false;
    onChange?.();
    expect(unload()).toBe(false);
    editor.remove();
  } finally {
    unregister();
    cleanup();
  }
});
