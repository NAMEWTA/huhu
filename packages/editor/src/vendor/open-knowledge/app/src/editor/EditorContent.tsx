import type { Editor } from '@tiptap/core';
import { type EditorContentProps, PureEditorContent } from '@tiptap/react';
import { observeParkedSnapshotImages } from './components/snapshot-url-pool';
import { getEditorView } from './utils/get-editor-view';

type ContentBoundEditor = Editor & {
  contentComponent?: unknown;
  isEditorContentInitialized?: boolean;
};

const parkedSnapshotObservers = new WeakMap<Editor, () => void>();

function observeParkedEditorSnapshots(editor: Editor, root: HTMLElement): void {
  if (parkedSnapshotObservers.has(editor)) return;
  const stopObserving = observeParkedSnapshotImages(root);
  const stop = () => {
    editor.off('unmount', stop);
    parkedSnapshotObservers.delete(editor);
    stopObserving();
  };
  parkedSnapshotObservers.set(editor, stop);
  editor.on('unmount', stop);
}

/*
 * UPSTREAM(@tiptap/react@3.22.3): PureEditorContent destroys every node view in
 * componentWillUnmount and rebuilds them in componentDidMount, and React calls both each time
 * an <Activity> hides and shows the tree, so this one keeps them until a new owner binds.
 */
class ActivityEditorContent extends PureEditorContent {
  private boundContent: unknown = null;

  override init(): void {
    const editor: ContentBoundEditor | null = this.props.editor;
    if (!editor || editor.isDestroyed) return;
    if (this.boundContent !== null && editor.contentComponent === this.boundContent) {
      this.reattach(editor);
      return;
    }
    if (editor.contentComponent) {
      getEditorView(editor)?.setProps({ nodeViews: {} });
      editor.contentComponent = null;
    }
    super.init();
    this.boundContent = editor.contentComponent ?? null;
    parkedSnapshotObservers.get(editor)?.();
  }

  override render() {
    const editor: ContentBoundEditor | null = this.props.editor;
    if (!editor?.contentComponent || editor.contentComponent === this.boundContent) {
      return super.render();
    }
    const { editor: _editor, innerRef: _innerRef, ...rest } = this.props;
    return <div ref={this.editorContentRef} {...rest} />;
  }

  override componentWillUnmount(): void {
    const editor: ContentBoundEditor | null = this.props.editor;
    if (!editor || this.boundContent === null || editor.contentComponent !== this.boundContent) {
      return;
    }
    editor.isEditorContentInitialized = false;
    const root = getEditorView(editor)?.dom;
    if (!root?.parentNode) return;
    observeParkedEditorSnapshots(editor, root);
    const detached = document.createElement('div');
    detached.append(...root.parentNode.childNodes);
    editor.setOptions({ element: detached });
  }

  private reattach(editor: ContentBoundEditor): void {
    const element: HTMLDivElement | null = this.editorContentRef.current;
    const holder = getEditorView(editor)?.dom.parentNode;
    if (element && holder && holder !== element) {
      element.append(...holder.childNodes);
      editor.setOptions({ element });
    }
    editor.isEditorContentInitialized = true;
    parkedSnapshotObservers.get(editor)?.();
  }
}

const editorKeys = new WeakMap<Editor, number>();
let nextEditorKey = 1;

function keyForEditor(editor: Editor | null): number {
  if (!editor) return 0;
  const known = editorKeys.get(editor);
  if (known !== undefined) return known;
  const key = nextEditorKey;
  nextEditorKey += 1;
  editorKeys.set(editor, key);
  return key;
}

export function EditorContent(props: Omit<EditorContentProps, 'ref'>) {
  return <ActivityEditorContent key={keyForEditor(props.editor)} {...props} />;
}
