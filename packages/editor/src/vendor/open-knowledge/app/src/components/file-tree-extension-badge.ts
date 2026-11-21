import { extensionOf, fileIconKind } from '@huhu/ui';
import { fileTreeIcon } from '@/components/file-tree-icon-sprite';

export const OK_EXT_BADGE_ATTR = 'data-ok-ext-badge';
export const OK_EXT_ROW_ATTR = 'data-ok-ext-row';
export const OK_FULLNAME_ROW_ATTR = 'data-ok-fullname-row';

export const FILE_TREE_EXT_BADGE_CSS = `
  [data-item-selected='true'][data-file-icon='markdown'] [data-item-section='icon'] {
    color: var(--trees-selected-fg);
  }
  [data-type='item'][${OK_EXT_ROW_ATTR}] [data-truncate-segment-priority]:last-child {
    display: none;
  }
  [data-type='item'][${OK_FULLNAME_ROW_ATTR}] [data-truncate-segment-priority]:last-child {
    display: none;
  }
  [${OK_EXT_BADGE_ATTR}] {
    display: inline-block;
    margin-left: 0.375rem;
    margin-right: 0.25rem;
    align-self: center;
    color: color-mix(in oklab, var(--muted-foreground) 60%, transparent);
    font-size: 0.75rem;
    text-transform: uppercase;
    flex-shrink: 0;
    pointer-events: none;
    user-select: none;
  }
`;

export function applyExtensionBadges(root: ParentNode): void {
  const rows = root.querySelectorAll<HTMLElement>('[data-type="item"][data-item-path]');
  for (const row of rows) {
    const treePath = row.dataset.itemPath;
    if (!treePath) {
      clearExtensionRow(row);
      continue;
    }
    if (treePath.endsWith('/')) {
      applyFolderIcon(row);
      applyFullNameEndTruncation(row, treePath);
      continue;
    }
    row.querySelector('[data-huhu-folder-icon]')?.remove();
    const kind = fileIconKind(treePath);
    row.setAttribute('data-file-icon', kind);
    const ext = extensionOf(treePath);
    if (!ext) {
      clearExtensionRow(row);
      continue;
    }

    const basenameSeg = resolveBasenameSegment(row);
    if (!basenameSeg) continue;

    row.setAttribute(OK_EXT_ROW_ATTR, '');
    row.removeAttribute(OK_FULLNAME_ROW_ATTR);
    trimTrailingDotInBasenameSegment(basenameSeg);

    if (ext === 'md') {
      removeStaleBadge(row);
      continue;
    }
    upsertBadge(row, ext.toUpperCase());
  }
}

function applyFolderIcon(row: HTMLElement): void {
  row.setAttribute('data-file-icon', 'folder');
  const icon = fileTreeIcon(row.getAttribute('aria-expanded') === 'true' ? 'folder-open' : 'folder');
  let svg = row.querySelector<SVGSVGElement>('[data-huhu-folder-icon]');
  if (!svg) {
    const chevron = row.querySelector('[data-item-section="icon"] svg');
    if (!chevron) return;
    svg = row.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-huhu-folder-icon', '');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', icon.viewBox);
    svg.append(row.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'use'));
    chevron.after(svg);
  }
  const use = svg.firstElementChild;
  if (use?.getAttribute('href') !== `#${icon.name}`) use?.setAttribute('href', `#${icon.name}`);
}

function removeStaleBadge(row: HTMLElement): void {
  const badge = row.querySelector<HTMLElement>(`[${OK_EXT_BADGE_ATTR}]`);
  if (badge) badge.remove();
}

function clearExtensionRow(row: HTMLElement): void {
  row.removeAttribute(OK_EXT_ROW_ATTR);
  row.removeAttribute(OK_FULLNAME_ROW_ATTR);
  removeStaleBadge(row);
}

function resolveBasenameSegment(row: HTMLElement): HTMLElement | null {
  const truncateGroup = row.querySelector<HTMLElement>('[data-truncate-group-container="middle"]');
  if (!truncateGroup) return null;
  const segments = truncateGroup.querySelectorAll<HTMLElement>('[data-truncate-segment-priority]');
  if (segments.length < 2) return null;
  return segments[0] ?? null;
}

function applyFullNameEndTruncation(row: HTMLElement, treePath: string): void {
  row.removeAttribute(OK_EXT_ROW_ATTR);
  removeStaleBadge(row);

  const basenameSeg = resolveBasenameSegment(row);
  const name = leafName(treePath);
  if (!basenameSeg || !name) {
    row.removeAttribute(OK_FULLNAME_ROW_ATTR);
    return;
  }

  setSegmentText(basenameSeg, name);
  row.setAttribute(OK_FULLNAME_ROW_ATTR, '');
}

function leafName(treePath: string): string {
  const trimmed = treePath.replace(/\/+$/, '');
  const slash = trimmed.lastIndexOf('/');
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

function mapSegmentTextNodes(segment: HTMLElement, transform: (current: string) => string): void {
  const contentDivs = segment.querySelectorAll<HTMLElement>('[data-truncate-content]');
  for (const contentDiv of contentDivs) {
    const firstChild = contentDiv.firstChild;
    if (!firstChild || firstChild.nodeType !== Node.TEXT_NODE) continue;
    const current = firstChild.textContent ?? '';
    const next = transform(current);
    if (next !== current) firstChild.textContent = next;
  }
}

function setSegmentText(segment: HTMLElement, text: string): void {
  mapSegmentTextNodes(segment, () => text);
}

function trimTrailingDotInBasenameSegment(basenameSeg: HTMLElement): void {
  mapSegmentTextNodes(basenameSeg, (current) => current.replace(/\.+$/, ''));
}

function upsertBadge(row: HTMLElement, label: string): void {
  let badge = row.querySelector<HTMLSpanElement>(`[${OK_EXT_BADGE_ATTR}]`);
  if (!badge) {
    badge = row.ownerDocument.createElement('span');
    badge.setAttribute(OK_EXT_BADGE_ATTR, '');
    badge.setAttribute('aria-hidden', 'true');
    const actionSection = row.querySelector('[data-item-section="action"]');
    if (actionSection) {
      actionSection.before(badge);
    } else {
      row.appendChild(badge);
    }
  }
  if (badge.textContent !== label) {
    badge.textContent = label;
  }
}
