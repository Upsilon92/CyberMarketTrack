import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Work_Sans, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import { Header } from "@/components/header";
import "./globals.css";

// Body text: Work Sans. Headings/titles: Plus Jakarta Sans. (Both variable
// fonts.) Mono kept for the few monospaced bits.
const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CyberMarketTrack",
  description: "Base de connaissances du marché de la cybersécurité",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const t = await getTranslations("common");

  return (
    <html
      lang={locale}
      className={`${workSans.variable} ${jakarta.variable} ${geistMono.variable} h-full antialiased`}
      // next-themes updates the class on <html>; this avoids the hydration warning
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <NextIntlClientProvider>
            <Header />
            <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">{children}</main>
            <footer className="border-t border-border/70 mt-4">
              <div className="max-w-6xl mx-auto px-4 py-5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  CyberMarket<span className="brand-gradient">Track</span>
                </span>
                <span>{t("tagline")}</span>
              </div>
            </footer>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
