import { useEffect, useState } from 'react';

const DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

export function readDocumentColorMode(): 'light' | 'dark' {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    const mode = root.getAttribute('data-mode');
    if (mode === 'dark' || mode === 'light') return mode;
    const cls = root.classList;
    if (cls.contains('dark')) return 'dark';
    if (cls.contains('light')) return 'light';
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia(DARK_MODE_QUERY).matches ? 'dark' : 'light';
  }
  return 'light';
}

export function useAppColorMode(): 'light' | 'dark' {
  const [colorMode, setColorMode] = useState<'light' | 'dark'>(() => readDocumentColorMode());
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => {
      const next = readDocumentColorMode();
      setColorMode((prev) => (prev === next ? prev : next));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-mode'] });
    const systemMode = window.matchMedia?.(DARK_MODE_QUERY);
    systemMode?.addEventListener('change', sync);
    return () => {
      observer.disconnect();
      systemMode?.removeEventListener('change', sync);
    };
  }, []);
  return colorMode;
}
