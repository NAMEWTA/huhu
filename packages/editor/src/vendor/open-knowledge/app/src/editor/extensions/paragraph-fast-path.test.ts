import {
  type AnyExtension,
  type DecorationWithType,
  type Editor,
  getExtensionField,
} from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import { history, undo } from '@tiptap/pm/history';
import { Fragment, type Node as PmNode, Schema, Slice } from '@tiptap/pm/model';
import {
  EditorState,
  NodeSelection,
  type Plugin,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';
import { type DecorationSet, type EditorView } from '@tiptap/pm/view';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { describe, expect, test, vi } from 'vitest';
import { attachCaretLabel, caretLabelLayerPlugin } from '../caret-label-layer';
import { LocalPlaceholder } from '../TiptapEditor';
import { createBareHtmlImageDecoration } from './bare-html-image-decoration';
import { assertBridgeIdInvariant, BridgeIdPlugin, bridgeIdPluginKey } from './bridge-id-plugin';
import { LowlightPlugin } from './code-block-lowlight-plugin';
import { HeadingAnchors } from './heading-anchors';
import { markIdentityKey, markIdentityPlugin } from './mark-identity';
import { topLevelParagraphInsert } from './top-level-paragraph-insert';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    heading: { group: 'block', content: 'inline*' },
    jsxComponent: { group: 'block', content: 'block+' },
    codeBlock: {
      group: 'block',
      content: 'text*',
      attrs: { language: { default: 'js' } },
      code: true,
    },
    atom: { group: 'block', atom: true },
    text: { group: 'inline' },
  },
  marks: { link: { attrs: { href: {} } }, strong: {}, code: {} },
});

const text = (value: string) => schema.text(value);
const paragraph = (value: string | PmNode[]) =>
  schema.node('paragraph', null, typeof value === 'string' ? (value ? text(value) : null) : value);
const heading = (value: string) => schema.node('heading', null, text(value));
const code = () => schema.node('codeBlock', null, text('return 1'));
const jsx = (child = paragraph('nested')) => schema.node('jsxComponent', null, child);
const documentNode = (...children: PmNode[]) => schema.node('doc', null, children);
const image = '<img src="./test.png" alt="fixture">';
const linkMark = schema.mark('link', { href: 'https://example.org' });

function extensionPlugin(extension: AnyExtension, editor?: Editor): Plugin {
  const plugins = getExtensionField<() => Plugin[]>(extension, 'addProseMirrorPlugins', {
    name: extension.name,
    options: extension.options,
    editor,
  });
  return plugins()[0]!;
}

function makeState(
  doc: PmNode,
  handlers: Parameters<typeof markIdentityPlugin>[0] = { markTypes: ['link'] },
) {
  return EditorState.create({
    doc,
    plugins: [
      extensionPlugin(createBareHtmlImageDecoration('notes/fixture')),
      extensionPlugin(HeadingAnchors),
      LowlightPlugin({
        name: 'codeBlock',
        defaultLanguage: null,
        lowlight: {
          listLanguages: () => ['js', 'ts'],
          highlight: (language, value) => ({
            children: [
              {
                type: 'element',
                properties: { className: [language, value] },
                children: [{ type: 'text', value }],
              },
            ],
          }),
          highlightAuto: () => ({}),
        },
      }),
      extensionPlugin(BridgeIdPlugin),
      markIdentityPlugin(handlers),
      history(),
    ],
  });
}

function decorations(state: EditorState, index: number) {
  return state.plugins[index]!.props.decorations!(state) as DecorationSet;
}

function decorationSnapshot(set: DecorationSet) {
  return set.find().map((decoration) => ({
    from: decoration.from,
    to: decoration.to,
    attrs: (decoration as DecorationWithType).type.attrs,
    key: decoration.spec.key,
    side: decoration.spec.side,
  }));
}

function expectEquivalent(actual: EditorState, reference: EditorState) {
  expect(actual.doc.eq(reference.doc)).toBe(true);
  for (const index of [0, 1, 2]) {
    expect(decorationSnapshot(decorations(actual, index))).toEqual(
      decorationSnapshot(decorations(reference, index)),
    );
  }
  expect(bridgeIdPluginKey.getState(actual)).toEqual(bridgeIdPluginKey.getState(reference));
  expect(markIdentityKey.getState(actual)).toEqual(markIdentityKey.getState(reference));
  assertBridgeIdInvariant(actual);
}

function compareUpdate(doc: PmNode, change: (state: EditorState) => Transaction) {
  const state = makeState(doc);
  const tr = change(state);
  const actual = state.apply(tr);
  // Mark the reference transaction as remote to force the original update paths
  // with the same steps, selection and previous IDs.
  const reference = state.apply(change(state).setMeta(ySyncPluginKey, { isChangeOrigin: true }));
  expectEquivalent(actual, reference);
  const recomputed = makeState(actual.doc);
  for (const index of [0, 1, 2]) {
    expect(decorationSnapshot(decorations(actual, index))).toEqual(
      decorationSnapshot(decorations(recomputed, index)),
    );
  }
  return { state, tr, actual };
}

describe('top-level paragraph insertion', () => {
  test('maps headings and highlighting with the same ranges and attributes as a full scan', () => {
    const doc = documentNode(paragraph('plain'), heading('Same'), code(), heading('Same'));
    const { state, tr, actual } = compareUpdate(doc, (state) => state.tr.insertText('added', 3));
    expect(topLevelParagraphInsert(tr)).toBe(tr.steps[0]);
    expect(decorationSnapshot(decorations(actual, 1)).map(({ attrs }) => attrs)).toEqual([
      { id: 'same' },
      { id: 'same-1' },
    ]);
    expect(decorations(actual, 2).find()[0]!.from).toBe(decorations(state, 2).find()[0]!.from + 5);

    // The optimized update does not visit unrelated blocks.
    const insertion = state.tr.insertText('fast', 2);
    const descendants = vi.spyOn(insertion.doc, 'descendants');
    const next = state.apply(insertion);
    expect(descendants).not.toHaveBeenCalled();
    expect(bridgeIdPluginKey.getState(next)).toBe(bridgeIdPluginKey.getState(state));
    expect(markIdentityKey.getState(next)).toBe(markIdentityKey.getState(state));
    const selectionOnly = next.apply(next.tr.setSelection(TextSelection.create(next.doc, 3)));
    expect(decorations(selectionOnly, 1)).toBe(decorations(next, 1));
  });

  test('rescans an existing image and retains link and JSX identities after their positions shift', () => {
    const doc = documentNode(
      paragraph('plain'),
      heading('Same'),
      paragraph(image),
      code(),
      heading('Same'),
      paragraph([schema.text('link', [linkMark]), schema.text(' bold', [schema.mark('strong')])]),
      jsx(),
    );
    const { state, actual } = compareUpdate(doc, (state) => state.tr.insertText('x', 3));
    expect(decorations(actual, 0).find()).toHaveLength(2);
    const oldBridge = [...bridgeIdPluginKey.getState(state)!.posToId];
    expect([...bridgeIdPluginKey.getState(actual)!.posToId]).toEqual(
      oldBridge.map(([pos, id]) => [pos + 1, id]),
    );
    const [mark] = [...markIdentityKey.getState(actual)!.byId.values()];
    const [oldMark] = [...markIdentityKey.getState(state)!.byId.values()];
    expect(mark).toEqual({ ...oldMark, from: oldMark!.from + 1, to: oldMark!.to + 1 });
  });

  test('rescans possible image syntax even when the previous set was empty', () => {
    const { actual } = compareUpdate(documentNode(paragraph(image.slice(0, -1))), (state) =>
      state.tr.insertText('>', state.doc.firstChild!.nodeSize - 1),
    );
    expect(decorations(actual, 0).find()).toHaveLength(2);
  });

  test('rescans a literal-code edit and keeps its HTML as text', () => {
    const codeMark = schema.mark('code');
    const { tr, actual } = compareUpdate(
      documentNode(paragraph([schema.text(image, [codeMark])])),
      (state) => state.tr.insert(3, schema.text('x', [codeMark])),
    );
    expect(topLevelParagraphInsert(tr)).toBeUndefined();
    expect(decorations(actual, 0).find()).toEqual([]);
  });

  test.each([
    [
      'link mark',
      () => documentNode(paragraph('text')),
      (s: EditorState) => s.tr.insert(3, schema.text('link', [linkMark])),
    ],
    [
      'JSX insertion',
      () => documentNode(paragraph('text')),
      (s: EditorState) => s.tr.insert(s.doc.content.size, jsx()),
    ],
    ['nested text', () => documentNode(jsx()), (s: EditorState) => s.tr.insertText('x', 3)],
    [
      'multiple steps',
      () => documentNode(paragraph('text')),
      (s: EditorState) => s.tr.insertText('x', 2).insertText('y', 3),
    ],
    [
      'open slice',
      () => documentNode(paragraph('text')),
      (s: EditorState) =>
        s.tr.step(new ReplaceStep(2, 2, new Slice(Fragment.from(paragraph('x')), 1, 1))),
    ],
    [
      'multiple text nodes',
      () => documentNode(paragraph('text')),
      (s: EditorState) => s.tr.insert(2, [text('x'), schema.text('y', [schema.mark('strong')])]),
    ],
    [
      'cross-block deletion',
      () => documentNode(paragraph('one'), paragraph('two')),
      (s: EditorState) => s.tr.delete(2, s.doc.content.size - 2),
    ],
    [
      'delete image syntax',
      () => documentNode(paragraph(image)),
      (s: EditorState) => s.tr.delete(1, 2),
    ],
    [
      'heading rename',
      () => documentNode(heading('Same'), heading('Same')),
      (s: EditorState) => s.tr.insertText('New', 1, 5),
    ],
    [
      'heading deletion',
      () => documentNode(heading('Same'), heading('Same')),
      (s: EditorState) => s.tr.delete(0, s.doc.firstChild!.nodeSize),
    ],
    [
      'paste across paragraphs with a heading',
      () => documentNode(paragraph('one'), paragraph('two')),
      (s: EditorState) =>
        s.tr.replace(
          2,
          s.doc.content.size - 2,
          new Slice(
            Fragment.fromArray([paragraph('before'), heading('Pasted'), paragraph('after')]),
            1,
            1,
          ),
        ),
    ],
    [
      'move a heading',
      () => documentNode(heading('A'), heading('B')),
      (s: EditorState) => {
        const first = s.doc.firstChild!;
        const tr = s.tr.delete(0, first.nodeSize);
        return tr.insert(tr.doc.content.size, first);
      },
    ],
    ['edit a code block', () => documentNode(code()), (s: EditorState) => s.tr.insertText('x', 3)],
    [
      'change a code language',
      () => documentNode(code()),
      (s: EditorState) => s.tr.setNodeMarkup(0, null, { language: 'ts' }),
    ],
    [
      'remote change in a paragraph',
      () => documentNode(paragraph('text')),
      (s: EditorState) => s.tr.insertText('x', 3).setMeta(ySyncPluginKey, { isChangeOrigin: true }),
    ],
    [
      'remote complex change',
      () => documentNode(paragraph('text'), heading('Same')),
      (s: EditorState) =>
        s.tr
          .insertText('x', 2)
          .insert(s.doc.content.size + 1, heading('Same'))
          .setMeta(ySyncPluginKey, { isChangeOrigin: true }),
    ],
  ] as const)('%s preserves the full update result', (_name, doc, change) => {
    const { tr } = compareUpdate(doc(), change);
    expect(topLevelParagraphInsert(tr)).toBeUndefined();
  });

  test('undo of a deletion uses the full path even when its inverse is plain insertion', () => {
    const state = makeState(documentNode(paragraph('text'), heading('Same')));
    const deleted = state.apply(state.tr.delete(2, 3));
    expect(
      undo(deleted, (tr) => {
        expect(topLevelParagraphInsert(tr)).toBeUndefined();
        expectEquivalent(
          deleted.apply(tr),
          deleted.apply(tr.setMeta(ySyncPluginKey, { isChangeOrigin: true })),
        );
        expect(tr.doc.eq(state.doc)).toBe(true);
      }),
    ).toBe(true);
  });

  test('mark registration and deregistration still fire around plain edits and marked inserts', () => {
    const onRegister = vi.fn();
    const onDeregister = vi.fn();
    let state = makeState(documentNode(paragraph('text')), {
      markTypes: ['link'],
      onRegister,
      onDeregister,
    });
    const asView = () => ({ state }) as EditorView;
    const view = state.plugins[4]!.spec.view!(asView());
    const update = (tr: Transaction) => {
      const old = state;
      state = state.apply(tr);
      view.update!(asView(), old);
    };
    update(state.tr.insertText('x', 2));
    expect(onRegister).not.toHaveBeenCalled();
    update(state.tr.insert(3, schema.text('link', [linkMark])));
    expect(onRegister).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'm1', from: 3, to: 7 }),
    );
    update(state.tr.insertText('y', 2));
    expect(onRegister).toHaveBeenCalledTimes(1);
    update(state.tr.delete(4, 8));
    expect(onDeregister).toHaveBeenCalledExactlyOnceWith('m1');
  });
});

describe('placeholder delegation', () => {
  test.each([
    'interior cursor',
    'empty document',
    'block start',
    'block end',
    'between blocks',
    'nested node',
    'read only',
    'read only with placeholders enabled',
    'node selection',
    'composition',
    'ranged selection',
    'include children',
    'all empty blocks',
  ])('matches upstream for %s', (scenario) => {
    const topLevel = paragraph('nonempty');
    const doc =
      scenario === 'empty document'
        ? documentNode(paragraph(''))
        : scenario === 'nested node' || scenario === 'include children'
          ? documentNode(jsx(paragraph('')))
          : documentNode(topLevel, schema.node('atom'), paragraph(''));
    const state = EditorState.create({
      doc,
      selection:
        scenario === 'node selection'
          ? NodeSelection.create(doc, topLevel.nodeSize)
          : scenario === 'between blocks'
            ? NodeSelection.create(doc, 0)
            : TextSelection.create(
                doc,
                ['empty document', 'block start'].includes(scenario)
                  ? 1
                  : scenario === 'block end'
                    ? topLevel.nodeSize - 1
                    : 2,
                scenario === 'ranged selection' ? 4 : undefined,
              ),
    });
    const readOnly = scenario.startsWith('read only');
    const editor = {
      isEditable: !readOnly,
      view: { composing: scenario === 'composition' },
      get isEmpty() {
        return scenario === 'empty document';
      },
    } as Editor;
    const isEmpty = vi.spyOn(editor, 'isEmpty', 'get');
    const options = {
      placeholder: 'Fixture placeholder',
      includeChildren: scenario === 'include children',
      showOnlyCurrent: scenario !== 'all empty blocks',
      showOnlyWhenEditable: scenario !== 'read only with placeholders enabled',
    };
    const actual = extensionPlugin(LocalPlaceholder.configure(options), editor).props.decorations!(
      state,
    );
    expect(isEmpty).toHaveBeenCalledTimes(
      scenario === 'interior cursor' || scenario === 'read only' ? 0 : 1,
    );
    const expected = extensionPlugin(Placeholder.configure(options), editor).props.decorations!(
      state,
    );
    if (expected) {
      expect(decorationSnapshot(actual as DecorationSet)).toEqual(
        decorationSnapshot(expected as DecorationSet),
      );
    } else {
      expect(actual).toBeNull();
    }
  });
});

test('caret label layer is placed before the first label and reconciles across views and remounts', () => {
  const hosts = [document.createElement('div'), document.createElement('div')];
  document.body.append(...hosts);
  const plugin = caretLabelLayerPlugin();
  const layer = (host: HTMLElement) => host.querySelector('.collaboration-cursor__label-layer')!;
  const start = (host: HTMLElement) => {
    const dom = document.createElement('div');
    host.append(dom);
    const scan = vi.spyOn(dom, 'querySelectorAll');
    const view = { dom } as unknown as EditorView;
    const lifecycle = plugin.spec.view!(view);
    const update = () => lifecycle.update!(view, view.state);
    const add = () => {
      const caret = document.createElement('span');
      caret.className = 'collaboration-cursor__caret';
      const label = document.createElement('span');
      attachCaretLabel(caret, label);
      dom.append(caret);
      update();
      return { caret, label };
    };
    return { scan, update, add, destroy: () => lifecycle.destroy!() };
  };

  try {
    const [first, second] = hosts.map(start);
    expect(layer(hosts[0]!)).not.toBeNull();
    expect(first!.scan).not.toHaveBeenCalled();
    const { caret, label } = first!.add();
    const other = second!.add();
    expect([...layer(hosts[0]!).children]).toEqual([label]);
    expect([...layer(hosts[1]!).children]).toEqual([other.label]);
    caret.remove();
    first!.update();
    expect(layer(hosts[0]!).children).toHaveLength(0);
    first!.destroy();
    second!.destroy();
    const remount = start(hosts[0]!);
    const remounted = remount.add();
    expect([...layer(hosts[0]!).children]).toEqual([remounted.label]);
    remount.destroy();
  } finally {
    hosts.forEach((host) => host.remove());
  }
});
