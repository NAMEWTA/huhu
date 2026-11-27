// @vitest-environment jsdom
import { createRequire } from "node:module";
import { URL as FileURL } from "node:url";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { FileEntry, FileSession } from "../src/shared/files.js";
import { FileBatchProvider, useFileBatch } from "../src/ui/FileBatch.js";
import { FileTable } from "../src/ui/FileTable.js";

// Reuse the desktop renderer for the component test.
const { createRoot } = createRequire(new FileURL("../../../apps/desktop/package.json", import.meta.url))("react-dom/client") as {
  createRoot(container: Element): { render(node: ReactNode): void; unmount(): void };
};
const call = vi.fn(async () => ({}));
vi.mock("@huhu/workbench", () => ({ useEngine: () => ({ call }) }));

const session: FileSession = {
  fileSessionId: "file-session",
  connectionId: "connection",
  hostId: "host",
  name: "SSH fixture",
  host: "localhost",
  user: "fixture",
  port: 22,
  state: "ready",
};
const entries: FileEntry[] = [
  { name: "folder", type: "dir", size: 0, mtime: 0, mode: "755" },
  { name: "note.txt", type: "file", size: 6, mtime: 0, mode: "644" },
];

function Pane({ side }: { side: "local" | "remote" }) {
  const { controls, selection, drop } = useFileBatch(side, side === "local" ? "/local" : "/remote", entries, false);
  return (
    <section {...drop}>
      {controls}
      <FileTable caption={side} entries={entries} onOpen={() => {}} selection={selection} />
    </section>
  );
}

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const hit = vi.fn<() => Element | null>();

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  call.mockClear();
  hit.mockReset();
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hit });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() =>
    root.render(
      <>
        <FileBatchProvider session={session}>
          <Pane side="local" />
          <Pane side="remote" />
        </FileBatchProvider>
        <FileBatchProvider session={{ ...session, fileSessionId: "other-session" }}>
          <Pane side="local" />
          <Pane side="remote" />
        </FileBatchProvider>
      </>,
    ),
  );
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  Reflect.deleteProperty(document, "elementFromPoint");
  vi.unstubAllGlobals();
});

function dragFixture() {
  const remote = container.querySelector<HTMLElement>('[data-file-batch-side="remote"]')!;
  const [target, otherSession] = container.querySelectorAll<HTMLElement>('[data-file-batch-side="local"]');
  const handle = remote.querySelector<HTMLElement>('[data-testid="ssh-file-drag-handle"]')!;
  let capture: number | undefined;
  Object.assign(handle, {
    setPointerCapture: (id: number) => {
      capture = id;
    },
    hasPointerCapture: (id: number) => capture === id,
    releasePointerCapture: () => {
      capture = undefined;
    },
  });
  const pointer = (type: string, clientX: number) =>
    act(async () => {
      handle.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, button: 0, pointerId: 1, clientX }));
    });
  return { remote, target: target!, otherSession: otherSession!, pointer };
}

test("captured release in the opposite pane submits the selected files once", async () => {
  const { remote, target, pointer } = dragFixture();
  for (const checkbox of remote.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    await act(() => checkbox.click());
  }
  hit.mockReturnValue(target.querySelector("caption"));
  await pointer("pointerdown", 10);
  await pointer("pointermove", 11);
  expect(target.dataset.fileBatchOver).toBe("false");
  await pointer("pointermove", 30);
  expect(target.dataset.fileBatchOver).toBe("true");
  expect(call).not.toHaveBeenCalled();
  await pointer("pointerup", 30);
  await pointer("pointerup", 30);
  expect(target.dataset.fileBatchOver).toBe("false");
  expect(call).toHaveBeenCalledExactlyOnceWith(
    "ssh.transfers.startBatch",
    {
      source: { kind: "remote", fileSessionId: session.fileSessionId, path: "/remote" },
      target: { kind: "local", path: "/local" },
      names: ["folder", "note.txt"],
      localFileSessionId: session.fileSessionId,
    },
    { write: true },
  );
});

test("release in another session and lost capture both cancel without submitting", async () => {
  const { target, otherSession, pointer } = dragFixture();
  hit.mockReturnValue(otherSession);
  await pointer("pointerdown", 10);
  await pointer("pointermove", 30);
  expect(target.dataset.fileBatchOver).toBe("false");
  await pointer("pointerup", 30);

  hit.mockReturnValue(target);
  await pointer("pointerdown", 10);
  await pointer("pointermove", 30);
  expect(target.dataset.fileBatchOver).toBe("true");
  await pointer("lostpointercapture", 30);
  expect(target.dataset.fileBatchOver).toBe("false");
  await pointer("pointerup", 30);
  expect(call).not.toHaveBeenCalled();
});

test("system file drop shows the path prompt and the selection button still submits", async () => {
  const { remote, target } = dragFixture();
  const drop = new MouseEvent("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", { value: { types: ["Files"] } });
  await act(() => {
    target.dispatchEvent(drop);
  });
  expect(drop.defaultPrevented).toBe(true);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("请先选择本机目录");
  expect(call).not.toHaveBeenCalled();

  await act(() => remote.querySelector<HTMLInputElement>('input[aria-label="选择 note.txt"]')!.click());
  const download = [...remote.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "下载所选项目");
  expect(download?.disabled).toBe(false);
  await act(async () => {
    download!.click();
  });
  expect(call).toHaveBeenCalledExactlyOnceWith("ssh.transfers.startBatch", expect.objectContaining({ names: ["note.txt"] }), { write: true });
});
