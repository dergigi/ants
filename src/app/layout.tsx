import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LoginButton } from "@/components/LoginButton";
import { Footer } from "@/components/Footer";
import { Suspense } from "react";

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
        <Suspense fallback={<div className="text-center text-xs text-gray-400 py-6 select-none bg-[#1a1a1a]">Loading...</div>}>
          <Footer />
        </Suspense>
      </body>
    </html>
  );
}
