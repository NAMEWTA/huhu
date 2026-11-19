import { describe, expect, test } from 'vitest';
import { buildPreviewIframeHeader } from './preview-iframe-header';

function cspOf(header: string): string {
  return header.match(/content="([^"]+)"/)?.[1] ?? '';
}

describe('buildPreviewIframeHeader — CSP directives', () => {
  const header = buildPreviewIframeHeader('light');
  const csp = cspOf(header);

  test('contains a CSP <meta> tag', () => {
    expect(header).toMatch(/<meta http-equiv="Content-Security-Policy" content="[^"]+">/);
  });

  test('keeps the default-src deny baseline', () => {
    expect(csp).toContain("default-src 'none'");
  });

  test('blocks external requests and only allows embedded media and fonts', () => {
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain('img-src data: blob:;');
    expect(csp).toContain('font-src data:;');
    expect(csp).toContain('media-src data: blob:;');
    expect(csp).not.toMatch(/\b(?:https?|wss?):/);
  });

  test('permits inline scripts + styles (the whole point of the preview)', () => {
    expect(csp).toContain("script-src 'unsafe-inline'");
    expect(csp).toContain("style-src 'unsafe-inline'");
  });

  test('keeps form-action + base-uri locked', () => {
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'none'");
  });

  test("never grants 'unsafe-eval'", () => {
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test('never opens to `*` or a plaintext http:/ws: scheme-source', () => {
    expect(csp).not.toContain('*');
    expect(csp).not.toMatch(/[\s;]http:(?!\/)/);
    expect(csp).not.toMatch(/[\s;]ws:(?!\/)/);
  });
});
