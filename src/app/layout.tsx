import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LoginButton } from "@/components/LoginButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ants",
  description: "Minimalistic nostr search",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans min-h-screen flex flex-col">
        <LoginButton />
        <div className="flex-1">
          {children}
        </div>
        <footer className="text-center text-xs text-gray-400 py-6 select-none bg-[#1a1a1a]">
          <p>
            Made with love by <a href="https://dergigi.com" className="underline hover:text-gray-300" target="_blank" rel="noopener noreferrer">Gigi</a> - okay... vibed with love.
          </p>
          <p className="mt-1">
            <a href="https://github.com/dergigi" className="underline hover:text-gray-300" target="_blank" rel="noopener noreferrer">GitHub</a>
            <span className="mx-2">·</span>
            <a href="https://npub.world/npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc" className="underline hover:text-gray-300" target="_blank" rel="noopener noreferrer">Nostr</a>
            <span className="mx-2">·</span>
            Birthed during SEC-04
          </p>
        </footer>
      </body>
    </html>
  );
}
