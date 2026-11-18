import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { readDocumentColorMode, useAppColorMode } from './use-app-color-mode';

const root = document.documentElement;

afterEach(() => {
  root.removeAttribute('data-mode');
  root.classList.remove('dark', 'light');
});

describe('useAppColorMode in the Huhu editor', () => {
  test('prefers Huhu’s resolved appearance over the document class and system preference', () => {
    root.classList.add('light');
    root.dataset.mode = 'dark';
    expect(readDocumentColorMode()).toBe('dark');
  });

  test('updates mounted previews when Huhu changes appearance', async () => {
    root.dataset.mode = 'light';
    const { result } = renderHook(useAppColorMode);
    expect(result.current).toBe('light');
    root.dataset.mode = 'dark';
    await waitFor(() => expect(result.current).toBe('dark'));
    root.dataset.mode = 'light';
    await waitFor(() => expect(result.current).toBe('light'));
  });
});
