import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import Link from "next/link";
import AppWalletProvider from "@/components/WalletProvider";
import WalletButton from "@/components/WalletButton";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Panta Terminal",
  description:
    "The TradingView for Panta prediction markets — live radar, price history, smart money, one-click non-custodial trading.",
};

const navLink =
  "text-mute hover:text-ink transition-colors duration-200";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream text-ink">
        <AppWalletProvider>
          <nav className="sticky top-0 z-20 border-b border-line bg-cream/85 backdrop-blur">
            <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-6 text-sm">
              <Link
                href="/"
                className="font-display text-lg font-semibold tracking-tight"
              >
                Panta<span className="text-accent italic">Terminal</span>
              </Link>
              <Link href="/" className={navLink}>
                Radar
              </Link>
              <Link href="/leaderboard" className={navLink}>
                Smart Money
              </Link>
              <Link href="/portfolio" className={navLink}>
                Portfolio
              </Link>
              <Link href="/pitch" className={navLink}>
                Pitch
              </Link>
              <a
                href="https://panta.market"
                target="_blank"
                className="ml-auto text-faint hover:text-mute transition-colors duration-200"
              >
                Powered by Panta API ↗
              </a>
              <WalletButton />
            </div>
          </nav>
          <div className="flex-1">{children}</div>
        </AppWalletProvider>
      </body>
    </html>
  );
}
