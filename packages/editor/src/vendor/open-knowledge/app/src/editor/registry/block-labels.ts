import type { MessageDescriptor } from '@lingui/core';
import { msg, t } from '@lingui/core/macro';

// Registry identifiers, defaults and aliases remain the serialized source of truth.
const BLOCK_LABELS: Partial<Record<string, MessageDescriptor>> = {
  'Callout': msg`Callout`,
  'Image': msg`Image`,
  'Video': msg`Video`,
  'Audio': msg`Audio`,
  'Embed': msg`Embed`,
  'Accordion': msg`Accordion`,
  'Toggle': msg`Toggle`,
  'Tabs': msg`Tabs`,
  'Tab': msg`Tab`,
  'Math': msg`Math`,
  'Mirror': msg`Mirror`,
  'Mirror Source': msg`Mirror Source`,
  'Align block': msg`Align block`,
  'File': msg`File`,
  'GFM Callout': msg`GFM Callout`,
  'CommonMark Image': msg`CommonMark Image`,
  'Wiki Embed Image': msg`Wiki Embed Image`,
  'Wiki Embed Video': msg`Wiki Embed Video`,
  'Wiki Embed Audio': msg`Wiki Embed Audio`,
  'Wiki Embed File': msg`Wiki Embed File`,
  'HTML5 Details': msg`HTML5 Details`,
  'Dollar Math': msg`Dollar Math`,
  'Math Fence': msg`Math Fence`,
};

const PLACEHOLDERS: Partial<Record<string, MessageDescriptor>> = {
  'Add an image': msg`Add an image`,
  'Add a video': msg`Add a video`,
  'Add audio': msg`Add audio`,
  'Add a PDF': msg`Add a PDF`,
  'Add a file': msg`Add a file`,
  'Embed a URL': msg`Embed a URL`,
  'Add a Mermaid diagram': msg`Add a Mermaid diagram`,
};

const PROPERTY_LABELS: Partial<Record<string, MessageDescriptor>> = {
  'Type': msg`Type`,
  'Title': msg`Title`,
  'Icon': msg`Icon`,
  'Color': msg`Color`,
  'Collapsible': msg`Collapsible`,
  'Default Open': msg`Default Open`,
  'Src': msg`Src`,
  'Alt': msg`Alt`,
  'Width': msg`Width`,
  'Height': msg`Height`,
  'Srcset': msg`Srcset`,
  'Sizes': msg`Sizes`,
  'Loading': msg`Loading`,
  'Decoding': msg`Decoding`,
  'Fetchpriority': msg`Fetchpriority`,
  'Crossorigin': msg`Crossorigin`,
  'Referrerpolicy': msg`Referrerpolicy`,
  'Align': msg`Align`,
  'Controls': msg`Controls`,
  'Autoplay': msg`Autoplay`,
  'Poster': msg`Poster`,
  'Muted': msg`Muted`,
  'Loop': msg`Loop`,
  'Playsinline': msg`Playsinline`,
  'Preload': msg`Preload`,
  'Description': msg`Description`,
  'Id': msg`Id`,
  'Name': msg`Name`,
  'Tag': msg`Tag`,
  'Source Attrs': msg`Source Attrs`,
  'Alias': msg`Alias`,
  'Label': msg`Label`,
  'Formula': msg`Formula`,
  'Language': msg`Language`,
  'Chart': msg`Chart`,
  'Anchor': msg`Anchor`,
};

const ENUM_LABELS: Partial<Record<string, MessageDescriptor>> = {
  'note': msg`note`,
  'tip': msg`tip`,
  'important': msg`important`,
  'warning': msg`warning`,
  'caution': msg`caution`,
  'abstract': msg`abstract`,
  'info': msg`info`,
  'todo': msg`todo`,
  'success': msg`success`,
  'question': msg`question`,
  'failure': msg`failure`,
  'danger': msg`danger`,
  'bug': msg`bug`,
  'example': msg`example`,
  'quote': msg`quote`,
  'eager': msg`eager`,
  'lazy': msg`lazy`,
  'sync': msg`sync`,
  'async': msg`async`,
  'auto': msg`auto`,
  'high': msg`high`,
  'low': msg`low`,
  'anonymous': msg`anonymous`,
  'use-credentials': msg`use-credentials`,
  'center': msg`center`,
  'left': msg`left`,
  'right': msg`right`,
  'justify': msg`justify`,
  'none': msg`none`,
  'metadata': msg`metadata`,
};

export function blockLabel(label: string): string {
  const message = BLOCK_LABELS[label];
  return message ? t(message) : label;
}

export function blockPlaceholder(label: string | undefined, name: string): string {
  const message = label && PLACEHOLDERS[label];
  if (message) return t(message);
  if (label) return label;
  const translated = blockLabel(name);
  return t`Add ${translated}`;
}

export function propertyLabel(label: string): string {
  const message = PROPERTY_LABELS[label];
  return message ? t(message) : label;
}

export function enumLabel(value: string): string {
  const message = ENUM_LABELS[value];
  return message ? t(message) : value;
}
