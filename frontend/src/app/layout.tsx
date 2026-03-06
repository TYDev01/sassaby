import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MouseGlow from "@/components/MouseGlow";
import ClientProviders from "@/components/ClientProviders";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stacks Bridge",
  description: "Bridge between Crypto and local bank accounts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0a0a] text-white min-h-screen`}
      >
        <MouseGlow />
        <ClientProviders>{children}</ClientProviders>
        <Toaster position="top-right" richColors theme="dark" />
      </body>
    </html>
  );
}
