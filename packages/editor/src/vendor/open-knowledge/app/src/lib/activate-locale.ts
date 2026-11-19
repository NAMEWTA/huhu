import type { SupportedLocale } from '@inkeep/open-knowledge-core/i18n/locales';
import { FALLBACK_LOCALE } from '@inkeep/open-knowledge-core/i18n/resolve-locale';
import type { Messages } from '@lingui/core';
import { i18n } from './i18n';

type CatalogLoader = () => Promise<{ readonly messages: unknown }>;

// P-S2a-04：Huhu 只发布 en / zh-Hans 两个目录（decisions OP-D06）；其余 locale 回退到 en。目录由 @lingui/vite-plugin 直接编译 .po。
const CATALOG_LOADERS: Record<SupportedLocale, CatalogLoader> = {
  en: () => import('@/locales/en/messages.po'),
  'zh-Hans': () => import('@/locales/zh-Hans/messages.po'),
  'zh-Hant': () => import('@/locales/en/messages.po'),
  hi: () => import('@/locales/en/messages.po'),
  es: () => import('@/locales/en/messages.po'),
  ar: () => import('@/locales/en/messages.po'),
  fr: () => import('@/locales/en/messages.po'),
  bn: () => import('@/locales/en/messages.po'),
  'pt-BR': () => import('@/locales/en/messages.po'),
  id: () => import('@/locales/en/messages.po'),
  ur: () => import('@/locales/en/messages.po'),
  ko: () => import('@/locales/en/messages.po'),
  pl: () => import('@/locales/en/messages.po'),
};

const loadedLocales = new Set<SupportedLocale>([FALLBACK_LOCALE]);

let requestedLocale: SupportedLocale = 'zh-Hans';

export function getRequestedLocale(): SupportedLocale {
  return requestedLocale;
}

export async function dynamicActivate(locale: SupportedLocale): Promise<void> {
  requestedLocale = locale;

  if (!loadedLocales.has(locale)) {
    const { messages } = await CATALOG_LOADERS[locale]();
    i18n.load(locale, messages as Messages);
    loadedLocales.add(locale);
  }

  if (requestedLocale !== locale) return;
  i18n.activate(locale);
}
