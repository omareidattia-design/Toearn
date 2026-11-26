import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cairo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-cairo",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QANNAS PRO — قنّاص الأسواق | Spot Radar (Binance & MEXC)",
  description:
    "منصة قنّاص الأسواق لتحليل ورصد صفقات الشراء الحقيقية (Spot فقط) باستراتيجية SMC/ICT لاصطياد القاع على Binance وMEXC ببيانات حية.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${ibmPlexMono.variable} dark`}>
      <body className="min-h-screen bg-[#070B14] text-[#E2E8F0] font-sans antialiased selection:bg-[#D4AF37]/30 selection:text-[#F8FAFC]">
        {children}
      </body>
    </html>
  );
}
