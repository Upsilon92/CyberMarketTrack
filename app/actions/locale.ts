"use server";

// Server action used by the header's locale switcher: persists the chosen
// locale in a cookie (see i18n/request.ts) and re-renders the current page.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALES, LOCALE_COOKIE, type AppLocale } from "@/i18n/request";

export async function setLocale(locale: string) {
  if (!LOCALES.includes(locale as AppLocale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
