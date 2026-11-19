import { useLingui } from '@lingui/react/macro';
import { ExternalEmbedBlockedNotice } from './PreviewBlockedNotice.tsx';

interface EmbedProps {
  src?: string;
}

const HTTP_SCHEME_RE = /^https?:\/\//i;

function isCrossOriginUrl(src: string): boolean {
  try {
    return new URL(src).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function Embed({ src }: EmbedProps) {
  const { t } = useLingui();
  if (typeof src === 'string' && HTTP_SCHEME_RE.test(src) && isCrossOriginUrl(src)) {
    // Q3: the editor never starts an external request for an authored Embed block.
    return <ExternalEmbedBlockedNotice url={src} />;
  }

  let message = t`Embed a URL`;
  if (typeof src === 'string' && src.length > 0) {
    message = HTTP_SCHEME_RE.test(src)
      ? t`Embed only supports cross-origin URLs`
      : t`URL must start with http:// or https://`;
  }

  return (
    <div className="ok-embed ok-embed--placeholder" contentEditable={false}>
      <span>{message}</span>
    </div>
  );
}
