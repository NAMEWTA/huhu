import { __iconNode as botIcon } from 'lucide-react/dist/esm/icons/bot';
import { __iconNode as link2Icon } from 'lucide-react/dist/esm/icons/link-2';
import { __iconNode as lockIcon } from 'lucide-react/dist/esm/icons/lock';
import { FILE_ICON_EXTENSIONS, fileIconSprite } from '@huhu/ui';

export const LINK_DECORATION_ICON_ID = 'ok-file-tree-link-decoration';
export const AGENT_DECORATION_ICON_ID = 'ok-file-tree-agent-decoration';
export const RESTRICTED_DECORATION_ICON_ID = 'huhu-file-tree-restricted-decoration';
const shared = fileIconSprite();

export const fileTreeIcon = shared.icon;
export const FILE_TREE_EXTENSION_ICONS = Object.fromEntries(
  Object.entries(FILE_ICON_EXTENSIONS).map(([ext, kind]) => [ext, fileTreeIcon(kind)]),
);

type IconNode = [string, Record<string, string>][];

function iconNodeToSvg(iconNode: IconNode): string {
  return iconNode
    .map(([tag, { key: _, ...attrs }]) => {
      const attrString = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${attrString} />`;
    })
    .join('');
}

function createLucideSpriteSymbol(id: string, iconNode: IconNode): string {
  const symbolContent = iconNodeToSvg(iconNode);
  return `<symbol id="${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${symbolContent}</symbol>`;
}

export const FILE_TREE_DECORATION_SPRITE_SHEET = `<svg data-icon-sprite aria-hidden="true" width="0" height="0">
  ${createLucideSpriteSymbol(LINK_DECORATION_ICON_ID, link2Icon)}
  ${createLucideSpriteSymbol(AGENT_DECORATION_ICON_ID, botIcon)}
  ${createLucideSpriteSymbol(RESTRICTED_DECORATION_ICON_ID, lockIcon)}
  ${shared.symbols}
</svg>`;
