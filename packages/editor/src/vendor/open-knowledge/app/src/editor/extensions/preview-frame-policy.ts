export const EDITOR_PREVIEW_URL = 'huhu-preview://editor/preview-frame.html';

export const EDITOR_PREVIEW_CSP =
  "default-src 'none'; " +
  "script-src 'unsafe-inline'; " +
  "style-src 'unsafe-inline' data:; " +
  'img-src data: blob:; font-src data:; media-src data: blob:; ' +
  "connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none';";
