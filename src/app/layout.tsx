import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/app/providers";
import { ServiceWorkerRegister } from "@/components/app/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sutra ERP · Food manufacturing ERP", template: "%s · Sutra ERP" },
  description: "Sales, GST invoicing, BOM, production, inventory ledger, costing and receivables for a South Indian snack manufacturer (internship prototype).",
  applicationName: "Sutra ERP",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, title: "Sutra ERP", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans">
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
