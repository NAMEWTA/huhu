// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { expect, test, vi } from "vitest";
import { MAX_CACHE, __resetCacheForTests, mountTiptapEditor, parkTiptapEditor, peekTiptap } from "../src/vendor/open-knowledge/app/src/editor/editor-cache";
import { mountTiptapEditorPromise } from "../src/vendor/open-knowledge/app/src/editor/mount-promise";
import { acquireProvider, dropProvider, resetProviderPool } from "../src/host/provider-pool";

test("B01 本地 provider 停放后复用，同一文档的最后一个视图释放后才销毁", async () => {
  const name = "池回收";
  try {
    const first = acquireProvider(name, () => "# 缓冲正文\n", { lazyRich: true });
    const document = first.provider.document;
    await expect.poll(() => document.getText("source").toString()).toBe("# 缓冲正文\n");
    first.release();
    const reopened = acquireProvider(name, () => "# 磁盘正文\n", { lazyRich: true });
    const secondView = acquireProvider(name, () => "# 磁盘正文\n", { lazyRich: true });
    expect(reopened.provider.document).toBe(document);
    expect(secondView.provider.document).toBe(document);
    expect(document.getText("source").toString()).toBe("# 缓冲正文\n");

    dropProvider(name);
    reopened.release();
    await Promise.resolve();
    expect(document.isDestroyed).toBe(false);
    secondView.release();
    await Promise.resolve();
    expect(document.isDestroyed).toBe(true);

    const fresh = acquireProvider(name, () => "# 磁盘正文\n", { lazyRich: true });
    expect(fresh.provider.document).not.toBe(document);
    await expect.poll(() => fresh.provider.document.getText("source").toString()).toBe("# 磁盘正文\n");
  } finally {
    resetProviderPool();
  }
});

test("B01 同一文档共用挂载 Promise，停放后复用 DOM，容量满时驱逐最早停放的视图", async () => {
  const { provider } = acquireProvider("缓存数据", () => "", { lazyRich: true });
  const ydoc = provider.document;
  const bundle = (editor: Editor) => ({ editor, provider, ydoc, ytext: ydoc.getText("source") });
  const name = "首个缓存";
  const construct = vi.fn(() => bundle(new Editor({ element: null, extensions: [StarterKit], content: "<p>缓存正文</p>" })));
  const container = document.createElement("div");

  try {
    const first = mountTiptapEditorPromise({ docName: name, mountId: "first", construct });
    expect(mountTiptapEditorPromise({ docName: name, mountId: "second", construct })).toBe(first);
    const entry = await first;
    const dom = entry.editor.view.dom;
    parkTiptapEditor(entry);
    expect(entry.editor.isDestroyed).toBe(false);
    const reused = mountTiptapEditor({ docName: name, container, factory: construct });
    expect(construct).toHaveBeenCalledTimes(1);
    expect(reused).toBe(entry);
    expect(container.firstElementChild).toBe(dom);
    expect(dom.textContent).toBe("缓存正文");
    parkTiptapEditor(entry);

    for (let index = 0; index < MAX_CACHE; index++) {
      const next = mountTiptapEditor({
        docName: `缓存 ${index}`,
        container,
        factory: (element) => bundle(new Editor({ element, extensions: [StarterKit] })),
      });
      parkTiptapEditor(next);
    }
    expect(peekTiptap(name)).toBeUndefined();
    expect(entry.editor.isDestroyed).toBe(true);
    expect(ydoc.isDestroyed).toBe(false);
  } finally {
    __resetCacheForTests();
    resetProviderPool();
  }
});
