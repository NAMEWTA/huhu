import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { type Editor, mergeAttributes, Node } from '@tiptap/core';
import {
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
  useEditor,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Activity, type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OkFetchContext } from '@/lib/ok-fetch';
import { EditorContent } from './EditorContent';
import { ExcalidrawEmbed } from './components/ExcalidrawEmbed';
import { LocalReferenceContext } from './components/live-doc-pool';
import { __resetSnapshotUrlPoolForTests } from './components/snapshot-url-pool';

vi.mock('@excalidraw/excalidraw', () => ({
  exportToSvg: async () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
  restoreElements: () => [],
  restoreAppState: () => ({}),
}));

const blockViewEffects: string[] = [];

function BlockView({ node }: ReactNodeViewProps) {
  useEffect(() => {
    blockViewEffects.push('mount');
    return () => {
      blockViewEffects.push('unmount');
    };
  }, []);
  return <NodeViewWrapper data-testid="block-view">{node.attrs.label}</NodeViewWrapper>;
}

const ViewBlock = Node.create({
  name: 'viewBlock',
  group: 'block',
  atom: true,
  addAttributes: () => ({ label: { default: 'block view' } }),
  parseHTML: () => [{ tag: 'view-block' }],
  renderHTML: ({ HTMLAttributes }) => ['view-block', mergeAttributes(HTMLAttributes)],
  addNodeView: () => ReactNodeViewRenderer(BlockView),
});

const BoardBlock = ViewBlock.extend({
  addNodeView: () =>
    ReactNodeViewRenderer(() => (
      <NodeViewWrapper>
        <ExcalidrawEmbed src="/tests/board.excalidraw" title="Flow board" />
      </NodeViewWrapper>
    )),
});

function Host({
  visible,
  contentKey = 0,
  show = 'first',
  mounted = true,
  block = ViewBlock,
  onEditorDestroy,
}: {
  visible: boolean;
  contentKey?: number;
  show?: 'first' | 'second';
  mounted?: boolean;
  block?: typeof ViewBlock;
  onEditorDestroy?: () => void;
}) {
  const first = useEditor({
    extensions: [StarterKit, block],
    content: '<p>First document</p><view-block></view-block>',
    immediatelyRender: true,
    onDestroy: () => onEditorDestroy?.(),
  });
  const second = useEditor({
    extensions: [StarterKit, ViewBlock],
    content: '<p>Second document</p>',
    immediatelyRender: true,
  });
  const [portalTarget] = useState(() => document.createElement('div'));

  useEffect(() => {
    document.body.appendChild(portalTarget);
    return () => portalTarget.remove();
  }, [portalTarget]);

  return (
    <Activity mode={visible ? 'visible' : 'hidden'}>
      {mounted &&
        createPortal(
          // oxlint-disable-next-line ok/no-unportaled-editor-content -- portalled per the H6 contract, into a per-render exclusive target
          <EditorContent key={contentKey} editor={show === 'first' ? first : second} />,
          portalTarget,
        )}
    </Activity>
  );
}

function TabActivity({ visible, children }: { visible: boolean; children: ReactNode }) {
  return <Activity mode={visible ? 'visible' : 'hidden'}>{children}</Activity>;
}

function EditorPane({ onEditor }: { onEditor: (editor: Editor) => void }) {
  const editor = useEditor({
    extensions: [StarterKit, ViewBlock],
    content: '<p>First document</p><view-block></view-block>',
    immediatelyRender: true,
  });
  const [portalTarget] = useState(() => document.createElement('div'));

  useEffect(() => {
    document.body.appendChild(portalTarget);
    return () => portalTarget.remove();
  }, [portalTarget]);

  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);

  return createPortal(
    // oxlint-disable-next-line ok/no-unportaled-editor-content -- portalled per the H6 contract, into a per-render exclusive target
    <EditorContent editor={editor} />,
    portalTarget,
  );
}

function relabelBlocks(editor: Editor, label: string): void {
  editor.commands.command(({ tr }) => {
    tr.doc.descendants((node, pos) => {
      if (node.type.name === 'viewBlock') tr.setNodeMarkup(pos, undefined, { label });
    });
    return true;
  });
}

describe('EditorContent', () => {
  afterEach(() => {
    cleanup();
    blockViewEffects.length = 0;
  });

  test('keeps block views when its tab is hidden and shown again', async () => {
    const { rerender } = render(<Host visible />);
    const view = await screen.findByTestId('block-view');

    rerender(<Host visible={false} />);
    rerender(<Host visible />);

    expect(await screen.findByTestId('block-view')).toBe(view);
  });

  test('keeps a board snapshot while its editor is parked and revokes it on close', async ({
    onTestFinished,
  }) => {
    let nextUrl = 0;
    const revokeObjectURL = vi.fn();
    const onEditorDestroy = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = () => `blob:editor-snapshot-${++nextUrl}`;
        static revokeObjectURL = revokeObjectURL;
      },
    );
    onTestFinished(() => {
      __resetSnapshotUrlPoolForTests();
      vi.unstubAllGlobals();
    });

    const localReferenceHost = {
      subscribe: () => () => {},
      readPdf: async () => new Blob(),
    };
    const readBoard = async () => Response.json({ text: JSON.stringify({ elements: [] }) });
    const boardTab = (visible: boolean, contentKey = 0) => (
      <OkFetchContext.Provider value={readBoard}>
        <LocalReferenceContext.Provider value={localReferenceHost}>
          <TooltipProvider>
            <Host
              visible={visible}
              contentKey={contentKey}
              block={BoardBlock}
              onEditorDestroy={onEditorDestroy}
            />
          </TooltipProvider>
        </LocalReferenceContext.Provider>
      </OkFetchContext.Provider>
    );
    const { rerender, unmount } = render(boardTab(true));
    const image = await screen.findByRole<HTMLImageElement>('img', { name: 'Flow board' });
    const url = image.src;
    expect(url).toMatch(/^blob:/);

    const hide = async (snapshotUrl: string, contentKey = 0) => {
      rerender(boardTab(false, contentKey));
      // Let the snapshot pool observe the detach before reattaching or closing the editor.
      await Promise.resolve();
      expect(screen.queryByRole('img', { name: 'Flow board' })).toBeNull();
      expect(onEditorDestroy).not.toHaveBeenCalled();
      expect(revokeObjectURL).not.toHaveBeenCalledWith(snapshotUrl);
    };
    await hide(url);
    rerender(boardTab(true));
    const restored = await screen.findByRole<HTMLImageElement>('img', { name: 'Flow board' });
    expect(restored.src).toBe(url);
    expect(revokeObjectURL).not.toHaveBeenCalledWith(url);

    await hide(url);
    rerender(boardTab(true, 1));
    const rebound = await screen.findByRole<HTMLImageElement>('img', { name: 'Flow board' });
    expect(rebound.src).not.toBe(url);
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(url));

    await hide(rebound.src, 1);
    unmount();
    await waitFor(() => expect(onEditorDestroy).toHaveBeenCalledOnce());
    await waitFor(() => expect(revokeObjectURL.mock.calls).toEqual([[url], [rebound.src]]));
  });

  test('shows a block view that changed while its tab was hidden', async () => {
    const editors: Editor[] = [];
    const pane = <EditorPane onEditor={(editor) => editors.push(editor)} />;
    const { rerender } = render(<TabActivity visible>{pane}</TabActivity>);
    expect((await screen.findByTestId('block-view')).textContent).toBe('block view');

    rerender(<TabActivity visible={false}>{pane}</TabActivity>);
    act(() => relabelBlocks(editors[0] as Editor, 'changed while hidden'));
    rerender(<TabActivity visible>{pane}</TabActivity>);

    await waitFor(() =>
      expect(screen.getByTestId('block-view').textContent).toBe('changed while hidden'),
    );
  });

  test('shows a block view inserted while its tab was hidden', async () => {
    const editors: Editor[] = [];
    const pane = <EditorPane onEditor={(editor) => editors.push(editor)} />;
    const { rerender } = render(<TabActivity visible>{pane}</TabActivity>);
    await screen.findByTestId('block-view');

    rerender(<TabActivity visible={false}>{pane}</TabActivity>);
    await act(async () => {
      editors[0]?.commands.insertContentAt(0, { type: 'viewBlock', attrs: { label: 'inserted' } });
    });
    rerender(<TabActivity visible>{pane}</TabActivity>);

    await waitFor(() =>
      expect(screen.getAllByTestId('block-view').map((view) => view.textContent)).toEqual([
        'inserted',
        'block view',
      ]),
    );
  });

  test('builds the editor again for a new EditorContent of the same editor', async () => {
    const { rerender } = render(<Host visible contentKey={1} />);
    await screen.findByTestId('block-view');

    rerender(<Host visible contentKey={2} />);

    expect(await screen.findByTestId('block-view')).not.toBeNull();
    expect(screen.getByText('First document')).not.toBeNull();
  });

  test('mounts each block view once when a new EditorContent reopens the editor', async () => {
    const { rerender } = render(<Host visible contentKey={1} />);
    await screen.findByTestId('block-view');
    rerender(<Host visible contentKey={1} mounted={false} />);
    blockViewEffects.length = 0;

    rerender(<Host visible contentKey={2} />);

    expect(await screen.findByTestId('block-view')).not.toBeNull();
    expect(blockViewEffects).toEqual(['mount']);
  });

  test('shows only the editor it is given', async () => {
    const { rerender } = render(<Host visible />);
    await screen.findByText('First document');

    rerender(<Host visible show="second" />);

    expect(await screen.findByText('Second document')).not.toBeNull();
    expect(screen.queryByText('First document')).toBeNull();
  });
});
