// `@` 引用补全（宿主侧，不改 vendor）：输入 `@` 弹出 Vault 文件 / 文件夹候选，选中后插入 OK 的 wikiLink 节点
// （序列化为 `[[相对路径]]`，文件写完整相对路径含扩展名，文件夹以 `/` 结尾）。候选与打分由宿主提供（tasks 的 useReferenceIndex）。
// 经 `editor.registerPlugin` 注册，随编辑器销毁 / 组件卸载注销；S5 把候选源换成共享的资源适配层。
import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";
import { appendFileIcon, dismissChildOnEscape, invokerOverlayContainer } from "@huhu/ui";
import type { Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { exitSuggestion, type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";

export interface ReferenceCandidate {
  path: string;
  kind: "file" | "folder";
}

const key = new PluginKey("huhuAtReference");

export function registerAtReference(editor: Editor, search: (query: string) => readonly ReferenceCandidate[]): () => void {
  let menu: HTMLDivElement | null = null;
  let items: ReferenceCandidate[] = [];
  let index = 0;
  let apply: ((c: ReferenceCandidate) => void) | null = null;
  let readCaret: () => DOMRect | null = () => null;
  let position: (() => void) | undefined;
  let stopPosition: (() => void) | undefined;

  const paint = () => {
    if (!menu) return;
    menu.replaceChildren();
    items.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = `editor-ref-item${i === index ? " editor-ref-item-active" : ""}`;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(i === index));
      appendFileIcon(row, c.path, c.kind === "folder", 14);
      row.append(document.createTextNode(c.path));
      const tag = document.createElement("span");
      tag.className = "editor-ref-kind";
      tag.textContent = c.kind === "folder" ? "文件夹" : "文件";
      row.append(tag);
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        apply?.(c);
      });
      menu?.append(row);
    });
  };
  const close = () => {
    stopPosition?.();
    stopPosition = undefined;
    position = undefined;
    menu?.remove();
    menu = null;
    apply = null;
  };

  const plugin = Suggestion<ReferenceCandidate>({
    editor,
    pluginKey: key,
    char: "@",
    allowedPrefixes: [" ", "\n", "，", "。"],
    items: ({ query }) => [...search(query)],
    command: ({ editor: ed, range, props }) => {
      ed.chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "wikiLink", attrs: { target: props.path, alias: null, anchor: null } })
        .run();
    },
    render: () => ({
      onStart: (p: SuggestionProps<ReferenceCandidate>) => {
        const invoker = editor.view.dom;
        const container = invokerOverlayContainer(invoker);
        if (!container) return;
        menu = document.createElement("div");
        menu.className = "editor-ref-menu";
        menu.setAttribute("role", "listbox");
        menu.setAttribute("data-testid", "editor-ref-menu");
        container.append(menu);
        const popup = menu;
        readCaret = () => p.clientRect?.() ?? null;
        const anchor = { contextElement: invoker, getBoundingClientRect: () => readCaret() ?? invoker.getBoundingClientRect() };
        const collision = container.matches("dialog[open]") ? { boundary: container, padding: 8 } : { padding: 8 };
        position = () => {
          if (!readCaret()) return;
          void computePosition(anchor, popup, {
            strategy: "fixed",
            placement: "bottom-start",
            middleware: [offset(4), flip(collision), shift(collision), size({
              ...collision,
              apply({ availableWidth, availableHeight }) {
                popup.style.maxWidth = `${Math.max(0, Math.min(420, availableWidth))}px`;
                popup.style.maxHeight = `${Math.max(0, Math.min(260, availableHeight))}px`;
              },
            })],
          }).then(({ x, y }) => {
            if (popup.isConnected) {
              popup.style.left = `${x}px`;
              popup.style.top = `${y}px`;
            }
          }).catch((error: unknown) => {
            if (popup.isConnected) console.warn("Reference menu positioning failed", error);
          });
        };
        items = p.items;
        index = 0;
        apply = (c) => p.command(c);
        paint();
        stopPosition = autoUpdate(anchor, popup, position);
      },
      onUpdate: (p: SuggestionProps<ReferenceCandidate>) => {
        items = p.items;
        index = Math.min(index, Math.max(0, items.length - 1));
        apply = (c) => p.command(c);
        paint();
        readCaret = () => p.clientRect?.() ?? null;
        position?.();
      },
      onKeyDown: (p: SuggestionKeyDownProps) => {
        if (!menu || p.event.isComposing || p.event.keyCode === 229) return false;
        if (dismissChildOnEscape(p.event, p.view.dom, () => exitSuggestion(p.view, key))) return true;
        if (items.length === 0) return false;
        if (p.event.key === "ArrowDown") {
          index = (index + 1) % items.length;
          paint();
          return true;
        }
        if (p.event.key === "ArrowUp") {
          index = (index - 1 + items.length) % items.length;
          paint();
          return true;
        }
        if (p.event.key === "Enter" || p.event.key === "Tab") {
          const c = items[index];
          if (c) apply?.(c);
          return true;
        }
        return false;
      },
      onExit: close,
    }),
  });
  // 放在最前：Enter / 方向键要先给候选菜单，再轮到 StarterKit 的键位
  editor.registerPlugin(plugin, (added, existing) => [added, ...existing]);
  return () => {
    close();
    if (!editor.isDestroyed) editor.unregisterPlugin(key);
  };
}
