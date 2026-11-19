import { resolveAssetProjectPath } from '@inkeep/open-knowledge-core/utils/link-targets';
import { Trans, useLingui } from '@lingui/react/macro';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { Download } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { basenameFromUrl } from '@/editor/components/File';
import { useDocumentContext } from '@/editor/DocumentContext';
import { getEditorDocName } from '../extensions/doc-context';
import { sanitizeUrlValue } from '../utils/sanitize-url';

function readActiveFileSrc(editor: Editor): string | null {
  const sel = editor.state.selection;
  const node = (sel as { node?: { type: { name: string }; attrs: Record<string, unknown> } }).node;
  if (!node) return null;
  if (node.type.name !== 'jsxComponent') return null;
  const componentName = node.attrs.componentName;
  if (componentName !== 'File' && componentName !== 'WikiEmbedFile') return null;
  const props = (node.attrs.props ?? {}) as Record<string, unknown>;
  const src = props.src;
  if (typeof src !== 'string' || src.length === 0) return null;
  return src;
}

function readActiveFileName(editor: Editor): string {
  const sel = editor.state.selection;
  const node = (sel as { node?: { type: { name: string }; attrs: Record<string, unknown> } }).node;
  if (!node) return '';
  const props = (node.attrs.props ?? {}) as Record<string, unknown>;
  const alias = typeof props.alias === 'string' ? props.alias : '';
  if (alias.length > 0) return alias;
  const name = typeof props.name === 'string' ? props.name : '';
  if (name.length > 0) return name;
  const src = typeof props.src === 'string' ? props.src : '';
  return basenameFromUrl(src);
}

function triggerDownload(src: string, suggestedName: string): void {
  const link = document.createElement('a');
  link.href = src;
  link.download = suggestedName;
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

interface FileBubbleButtonsProps {
  editor: Editor;
}

export function FileBubbleButtons({ editor }: FileBubbleButtonsProps) {
  const { t } = useLingui();
  const { readAsset } = useDocumentContext();
  const [failure, setFailure] = useState<{ src: string; message: string } | null>(null);
  const src = useEditorState({
    editor,
    selector: (ctx) => readActiveFileSrc(ctx.editor),
  });

  const request = useRef<symbol | null>(null);
  useLayoutEffect(() => () => {
    request.current = null;
  }, [editor, src]);

  if (src === null) return null;

  const download = async () => {
    const liveSrc = readActiveFileSrc(editor);
    if (!liveSrc) return;
    const suggestedName = readActiveFileName(editor);
    const docName = getEditorDocName(editor) ?? '';
    const selection = editor.state.selection as { node?: { attrs: Record<string, unknown> } };
    const literal = selection.node?.attrs.componentName === 'WikiEmbedFile';
    const path = resolveAssetProjectPath(liveSrc, docName, { literal });
    const attempt = Symbol();
    request.current = attempt;
    setFailure(null);
    try {
      if (path && readAsset) {
        const blob = await readAsset(path);
        if (request.current !== attempt) return;
        const blobUrl = URL.createObjectURL(blob);
        try {
          triggerDownload(blobUrl, suggestedName);
        } finally {
          setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
        }
      } else {
        const safeSrc = sanitizeUrlValue(liveSrc);
        if (typeof safeSrc !== 'string' || safeSrc === '#') throw new Error('Invalid download URL');
        triggerDownload(safeSrc, suggestedName);
      }
    } catch (error) {
      if (request.current !== attempt) return;
      const fileName = suggestedName || liveSrc;
      const message =
        error instanceof Error && error.message
          ? error.message
          : t`Couldn't read ${fileName}. It may have been moved, deleted, or not finished downloading. Try adding it again.`;
      setFailure({ src: liveSrc, message });
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t`Download file`}
            className="text-accent-foreground"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void download()}
          >
            <Download className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          <Trans>Download file</Trans>
        </TooltipContent>
      </Tooltip>
      {failure?.src === src && <span role="status">{failure.message}</span>}
    </div>
  );
}

export function isFileNodeSelected(editor: Editor): boolean {
  return readActiveFileSrc(editor) !== null;
}
