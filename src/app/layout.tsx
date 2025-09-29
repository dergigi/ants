import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LoginTriggerProvider } from "@/lib/LoginTrigger";
import { Suspense } from "react";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "https://search.dergigi.com";

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
  description: "advanced nostr text search",
  metadataBase: new URL(siteUrl),
  openGraph: {
    url: siteUrl,
    type: "website",
    title: "ants",
    description: "advanced nostr text search",
    images: [
      {
        url: "/android-chrome-512x512.png",
        width: 512,
        height: 512,
        alt: "ants logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ants",
    description: "advanced nostr text search",
    images: ["/android-chrome-512x512.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans min-h-screen flex flex-col">
        <LoginTriggerProvider>
          <Header />
          <div className="flex-1">
            {children}
          </div>
          <Suspense fallback={<div className="text-center text-xs text-gray-400 py-6 select-none bg-[#1a1a1a]">Loading...</div>}>
            <Footer />
          </Suspense>
        </LoginTriggerProvider>
      </body>
    </html>
  );
}
