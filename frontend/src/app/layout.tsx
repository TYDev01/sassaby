import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MouseGlow from "@/components/MouseGlow";
import ClientProviders from "@/components/ClientProviders";
import { Toaster } from "@/components/ui/sonner";
import RatesTicker from "@/components/RatesTicker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sassaby",
  description: "Bridge between Crypto and local bank accounts",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  other: {
    "talentapp:project_verification":
      "5932e84019224bc7c37261b86471db753efa525346beda05a8fd831a08c11e71cb00c1f54454d3427139a6e7cf180f2e048c207a53df4e9b6997d64c39b4a00a",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0a0a] text-white min-h-screen pb-0`}
      >
        <MouseGlow />
        <ClientProviders>{children}</ClientProviders>
        <Toaster position="top-right" richColors theme="dark" />
        <RatesTicker />
      </body>
    </html>
  );
}
