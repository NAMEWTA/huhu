import { FALLBACK_LOCALE } from '@inkeep/open-knowledge-core/i18n/resolve-locale';
import type { Messages } from '@lingui/core';
import { i18n } from '@lingui/core';
import { messages as catalogMessages } from '@/locales/en/messages.po';

i18n.load(FALLBACK_LOCALE, catalogMessages as unknown as Messages);
i18n.activate(FALLBACK_LOCALE);

export { i18n };
