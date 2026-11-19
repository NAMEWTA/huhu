import { useEffect, useRef, useState, type RefObject } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getEditorForDoc } from "@/editor/active-editor";
import { classifyContextMenuTarget } from "@/editor/plugins/asset-context-menu";
import { getEditorView } from "@/editor/utils/get-editor-view";

export interface EditorAssetActions {
  resolve(path: string, kind: "asset" | "wiki-link" | "image"): string | null;
  open(path: string): void;
  reveal(path: string): void;
  copy(path: string): void;
}

interface MenuTarget {
  path: string;
  x: number;
  y: number;
  returnFocus: HTMLElement;
}

export function EditorAssetMenu({ scope, docName, actions }: { scope: RefObject<HTMLElement | null>; docName: string; actions: EditorAssetActions }) {
  const [target, setTarget] = useState<MenuTarget | null>(null);
  const [open, setOpen] = useState(false);
  const restoreFocus = useRef(true);

  useEffect(() => {
    const surface = scope.current;
    if (!surface) return;
    function show(element: Element, x: number, y: number, returnFocus: HTMLElement) {
      if (!element.closest(".ProseMirror")) return false;
      const image = element.closest('[data-testid="image-slot"]')?.querySelector("img");
      const classified = classifyContextMenuTarget(image ?? element, docName);
      const path = classified && actions.resolve(classified.relPath, classified.kind);
      if (!path) return false;
      restoreFocus.current = true;
      setTarget({ path, x, y, returnFocus });
      setOpen(true);
      return true;
    }
    const onContextMenu = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const editorDom = event.target.closest<HTMLElement>(".ProseMirror");
      if (editorDom && show(event.target, event.clientX, event.clientY, editorDom)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))) return;
      if (!(event.target instanceof HTMLElement) || !event.target.closest(".ProseMirror")) return;
      const editor = getEditorForDoc(docName);
      const view = editor && getEditorView(editor);
      if (!view) return;
      const from = view.state.selection.from;
      const selectionNode = view.nodeDOM(from) ?? view.domAtPos(from).node;
      const element = selectionNode instanceof Element ? selectionNode : selectionNode.parentElement;
      const anchor = event.target === view.dom ? element : event.target;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      if (show(anchor, rect.left, rect.bottom, event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    surface.addEventListener("contextmenu", onContextMenu, true);
    surface.addEventListener("keydown", onKeyDown, true);
    return () => {
      surface.removeEventListener("contextmenu", onContextMenu, true);
      surface.removeEventListener("keydown", onKeyDown, true);
    };
  }, [scope, docName, actions]);

  if (!target) return null;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden tabIndex={-1} style={{ position: "fixed", left: target.x, top: target.y, width: 0, height: 0 }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        aria-label={`资源操作：${target.path}`}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (restoreFocus.current && target.returnFocus.isConnected) target.returnFocus.focus();
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            restoreFocus.current = false;
            actions.open(target.path);
          }}
        >
          打开
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            restoreFocus.current = false;
            actions.reveal(target.path);
          }}
        >
          在文件树中显示
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.copy(target.path)}>复制相对路径</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
