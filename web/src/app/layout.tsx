import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import AppWalletProvider from "@/components/WalletProvider";
import WalletButton from "@/components/WalletButton";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Panta Terminal",
  description:
    "The TradingView for Panta prediction markets — live radar, price history, smart money, one-click non-custodial trading.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <AppWalletProvider>
          <nav className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
            <div className="mx-auto max-w-7xl px-4 h-12 flex items-center gap-6 text-sm">
              <Link href="/" className="font-bold tracking-tight text-base">
                Panta<span className="text-emerald-400">Terminal</span>
              </Link>
              <Link href="/" className="text-zinc-400 hover:text-zinc-100 transition-colors">
                Radar
              </Link>
              <Link
                href="/leaderboard"
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                Smart Money
              </Link>
              <Link
                href="/portfolio"
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                Portfolio
              </Link>
              <a
                href="https://panta.market"
                target="_blank"
                className="ml-auto text-zinc-500 hover:text-zinc-300 transition-colors"
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
