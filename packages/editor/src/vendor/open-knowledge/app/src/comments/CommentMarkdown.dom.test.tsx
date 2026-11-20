import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { CommentMarkdown } from './CommentMarkdown';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('renders standard Markdown as DOM elements and opens links through the external-link policy', () => {
  const openWindow = vi.spyOn(window, 'open').mockImplementation(() => null);
  const text = [
    '**bold** *emphasis* `inline` [docs][ref]',
    '> quote\n>\n> - nested',
    '3. ordered',
    '```js\n<literal>\n```',
    '[ref]: https://example.test/docs "Documentation"',
  ].join('\n\n');
  const { container } = render(<CommentMarkdown text={text} />);

  expect(container.querySelector('strong')?.textContent).toBe('bold');
  expect(container.querySelector('em')?.textContent).toBe('emphasis');
  expect(container.querySelector('p code')?.textContent).toBe('inline');
  expect(container.querySelector('blockquote')?.textContent).toContain('quote');
  expect(container.querySelector('blockquote ul li')?.textContent).toBe('nested');
  expect(container.querySelector('ol')?.getAttribute('start')).toBe('3');
  expect(container.querySelector('pre code')?.textContent).toBe('<literal>\n');

  const link = screen.getByRole('link', { name: 'docs' });
  expect(link.getAttribute('title')).toBe('Documentation');
  fireEvent.click(link);
  fireEvent(link, new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
  expect(openWindow).toHaveBeenCalledTimes(2);
  expect(openWindow).toHaveBeenCalledWith('https://example.test/docs', '_blank', 'noopener,noreferrer');
});

test('omits active HTML and automatic media and displays unsafe link labels as text', () => {
  const text = [
    '[unsafe](javascript:example) [encoded](jav&#x61;script:example)',
    '![image label](https://example.test/remote.png)',
    '<script>commentMarker</script>',
    '<img src="https://example.test/html.png" onerror="commentMarker">',
    'text <a href="https://example.test" onclick="commentMarker">HTML label</a>',
  ].join('\n\n');
  const { container } = render(<CommentMarkdown text={text} />);

  expect(container.querySelectorAll('script, img, a, [onclick], [onerror], [src]')).toHaveLength(0);
  expect(container.textContent).toContain('unsafe encoded');
  expect(container.textContent).toContain('image label');
  expect(container.textContent).toContain('HTML label');
  expect(container.textContent).not.toContain('commentMarker');
});
