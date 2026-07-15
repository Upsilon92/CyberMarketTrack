// =============================================================================
// next-intl configuration — "without i18n routing" mode.
// The locale lives in a cookie (NEXT_LOCALE), defaulting to French.
// URLs stay clean (/companies, not /fr/companies).
// =============================================================================
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const LOCALES = ["fr", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "fr";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale: AppLocale = LOCALES.includes(cookieLocale as AppLocale)
    ? (cookieLocale as AppLocale)
    : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
